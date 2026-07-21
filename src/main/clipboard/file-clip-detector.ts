/**
 * v2.1 Batch 2C · 剪贴板文件复制检测
 *
 * Windows：文件复制（Ctrl+C 文件）在 clipboard 里会带 CF_HDROP 格式，
 *   Electron 对应的格式字符串是 'FileNameW' / 'FileName' / 'CF_HDROP' 之一。
 * macOS：'public.file-url' / 'NSFilenamesPboardType'
 * Linux：'text/uri-list' 带 file:// 前缀
 *
 * 本模块抽出纯函数 detectClipboardFiles(formats, readers) 以便单测：
 *   - 入参：formats（availableFormats 返回值）+ 可选 reader 回调
 *   - 出参：{ isFileList: boolean, paths: string[] }
 *
 * 生产环境调用方（clipboard monitor）只需把 Electron clipboard.availableFormats()
 * 和 clipboard.readBuffer / clipboard.read 传入即可。
 */

import { clipboard } from 'electron'

/** 平台相关的文件剪贴板格式串 */
export const FILE_CLIPBOARD_FORMATS = [
  // Windows
  'FileNameW',
  'FileName',
  'CF_HDROP',
  // macOS
  'NSFilenamesPboardType',
  'public.file-url',
  // Linux
  'text/uri-list'
] as const

export interface DetectResult {
  isFileList: boolean
  /** 文件绝对路径列表（可能为空，例如格式是 uri-list 但全是 http:// 时） */
  paths: string[]
}

export interface ClipboardReaders {
  /** 读一个 format 的 Buffer（Windows FileNameW 用） */
  readBuffer?: (format: string) => Buffer
  /** 读 text/uri-list 等文本格式 */
  readText?: (format: string) => string
}

/**
 * 纯函数版：根据 formats 列表 + reader 判定是否为文件列表。
 * 便于单测；生产直接调 detectCurrentClipboardFiles。
 */
export function detectClipboardFiles(
  formats: string[],
  readers: ClipboardReaders = {}
): DetectResult {
  const hasFileFormat = formats.some((f) =>
    (FILE_CLIPBOARD_FORMATS as readonly string[]).includes(f)
  )
  if (!hasFileFormat) {
    return { isFileList: false, paths: [] }
  }
  const paths: string[] = []

  // Windows：FileNameW/FileName → Buffer（UTF-16LE 或 ANSI 单路径）
  if (readers.readBuffer) {
    for (const fmt of ['FileNameW', 'FileName']) {
      if (!formats.includes(fmt)) continue
      try {
        const buf = readers.readBuffer(fmt)
        if (!buf || buf.length === 0) continue
        // FileNameW = UTF-16LE; FileName = ANSI
        const text =
          fmt === 'FileNameW' ? buf.toString('utf16le') : buf.toString('latin1')
        // 移除尾部 \0（用 lastIndexOf 代替正则，避免 no-control-regex 规则）
        let end = text.length
        while (end > 0 && text.charCodeAt(end - 1) === 0) end--
        const trimmed = text.slice(0, end)
        if (trimmed.length > 0) paths.push(trimmed)
      } catch {
        /* ignore */
      }
    }
  }

  // macOS / Linux：text/uri-list 或 public.file-url
  if (readers.readText) {
    for (const fmt of ['text/uri-list', 'public.file-url', 'NSFilenamesPboardType']) {
      if (!formats.includes(fmt)) continue
      try {
        const raw = readers.readText(fmt)
        if (!raw) continue
        const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          if (line.startsWith('#')) continue // uri-list 注释
          if (line.startsWith('file://')) {
            try {
              const decoded = decodeURIComponent(line.slice('file://'.length))
              // Windows 的 file:///C:/... → 去掉前导 /
              const normalized =
                decoded.startsWith('/') && /^\/[A-Za-z]:/.test(decoded)
                  ? decoded.slice(1)
                  : decoded
              paths.push(normalized)
            } catch {
              paths.push(line)
            }
          } else if (/^[A-Za-z]:\\/.test(line) || line.startsWith('/')) {
            paths.push(line)
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { isFileList: true, paths: Array.from(new Set(paths)) }
}

/** 生产环境：直接读 Electron clipboard */
export function detectCurrentClipboardFiles(): DetectResult {
  try {
    const formats = clipboard.availableFormats()
    return detectClipboardFiles(formats, {
      readBuffer: (fmt: string): Buffer => clipboard.readBuffer(fmt),
      readText: (_fmt: string): string => {
        // Electron 没有 readText(format)，退化为通用 readText()
        // text/uri-list 场景下 readText() 会返回等价文本
        try {
          return clipboard.readText()
        } catch {
          return ''
        }
      }
    })
  } catch {
    return { isFileList: false, paths: [] }
  }
}
