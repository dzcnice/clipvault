/**
 * v2.1 Batch 2C · file-clip-detector 纯函数测试
 *
 * 覆盖文本 vs 文件列表识别：Windows / macOS / Linux 三平台格式
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  clipboard: {
    availableFormats: (): string[] => [],
    readBuffer: (): Buffer => Buffer.alloc(0),
    readText: (): string => ''
  }
}))

import { detectClipboardFiles } from './file-clip-detector'

describe('detectClipboardFiles', () => {
  it('仅 text/plain 不识别为文件列表', () => {
    const r = detectClipboardFiles(['text/plain'])
    expect(r.isFileList).toBe(false)
    expect(r.paths.length).toBe(0)
  })

  it('Windows FileNameW UTF-16LE 单路径', () => {
    const raw = 'C:\\Users\\test\\a.txt'
    const buf = Buffer.from(raw + '\u0000', 'utf16le')
    const r = detectClipboardFiles(['FileNameW', 'CF_HDROP'], {
      readBuffer: (fmt) => (fmt === 'FileNameW' ? buf : Buffer.alloc(0))
    })
    expect(r.isFileList).toBe(true)
    expect(r.paths).toEqual(['C:\\Users\\test\\a.txt'])
  })

  it('Linux text/uri-list 多行路径', () => {
    const uris = 'file:///home/u/a.txt\nfile:///home/u/b%20c.txt'
    const r = detectClipboardFiles(['text/uri-list'], {
      readText: () => uris
    })
    expect(r.isFileList).toBe(true)
    expect(r.paths).toEqual(['/home/u/a.txt', '/home/u/b c.txt'])
  })

  it('uri-list 注释行 # 被忽略', () => {
    const uris = '# comment\nfile:///tmp/x'
    const r = detectClipboardFiles(['text/uri-list'], { readText: () => uris })
    expect(r.paths).toEqual(['/tmp/x'])
  })

  it('Windows file:///C:/... 前导 / 正确剥离', () => {
    const uris = 'file:///C:/Users/u/f.txt'
    const r = detectClipboardFiles(['text/uri-list'], { readText: () => uris })
    expect(r.paths).toEqual(['C:/Users/u/f.txt'])
  })

  it('路径去重', () => {
    const uris = 'file:///tmp/x\nfile:///tmp/x'
    const r = detectClipboardFiles(['text/uri-list'], { readText: () => uris })
    expect(r.paths.length).toBe(1)
  })

  it('空格 trimmed 多行', () => {
    const r = detectClipboardFiles(['text/uri-list'], {
      readText: () => '  file:///a  \n\n  file:///b  '
    })
    expect(r.paths).toEqual(['/a', '/b'])
  })
})
