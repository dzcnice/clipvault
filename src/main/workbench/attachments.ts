import { app } from 'electron'
import { spawn } from 'node:child_process'
import { join, basename, extname, resolve, parse, relative, sep } from 'node:path'
import { lstat, readFile, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { readImageBytes } from '../storage/image-store'
import { fingerprint } from './input'
import { redactForOutput as redactInput } from './redaction'
import { isPrivatePath } from './files'
import type { ContextItem } from '../../types/workbench'

export async function recognizeImage(path: string): Promise<{ text: string; language: string }> {
  if (process.platform !== 'win32') throw new Error('当前本地 OCR 支持 Windows；可以选择文字文件或粘贴文字')
  const image = readImageBytes(path)
  const bytes = await sharp(image.bytes).resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).png().toBuffer()
  const script = app.isPackaged ? join(process.resourcesPath, 'app.asar.unpacked/resources/ocr-windows.ps1') : join(app.getAppPath(), 'resources/ocr-windows.ps1')
  if (!existsSync(script)) throw new Error('本地 OCR 组件缺失，请重新构建')
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', exceeded = false
    const timer = setTimeout(() => { exceeded = true; child.kill() }, 30_000)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { output += chunk; if (output.length > 250_000) { exceeded = true; child.kill() } })
    child.stderr.resume()
    child.stdin.on('error', () => {})
    child.once('error', () => { clearTimeout(timer); reject(new Error('无法启动本地 OCR')) })
    child.once('close', code => {
      clearTimeout(timer)
      if (code !== 0 || exceeded) { reject(new Error('本地 OCR 未完成：请确认 Windows 识别语言可用，或选择文字文件')); return }
      try {
        const result = JSON.parse(output.trim()) as { success: boolean; text: string; language: string }
        if (!result.success || typeof result.text !== 'string') throw new Error('invalid')
        if (!result.text.trim()) { reject(new Error('没有识别到文字，请选择更清晰的图片')); return }
        resolve({ text: result.text, language: result.language })
      } catch { reject(new Error('本地 OCR 返回格式无效')) }
    })
    child.stdin.end(JSON.stringify({ base64: bytes.toString('base64') }) + '\n')
  })
}

export async function snapshotAttachment(path: string, secrets: string[]): Promise<ContextItem> {
  const info = await lstat(path), canonical = await realpath(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 32 * 1024 * 1024) throw new Error('附件必须是 32 MB 以内的普通文件，不能使用链接')
  let current = parse(resolve(path)).root
  for (const part of relative(current, resolve(path)).split(sep)) {
    current = join(current, part)
    if ((await lstat(current)).isSymbolicLink()) throw new Error('附件不能通过目录链接读取')
  }
  if (isPrivatePath(path) || isPrivatePath(canonical) || /\.cvbackup$/i.test(canonical)) throw new Error('敏感配置或资料库不能作为任务附件，请在资源库管理')
  const image = /\.(png|jpe?g|webp|gif|cvimg)$/i.test(extname(path))
  if (!image && info.size > 100_000) throw new Error('文字附件不能超过 100 KB')
  const text = image ? (await recognizeImage(path)).text : new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path))
  if (text.includes('\0')) throw new Error('仅支持 UTF-8 文字文件；二进制附件请先转换')
  const filtered = redactInput(text, secrets)
  if (filtered.text.length > 100_000) throw new Error('附件文字超过 100,000 字符')
  return { id: randomUUID(), sourceId: null, kind: 'file', title: `${basename(path)}${image ? ' · 本地 OCR' : ''}`, text: filtered.text, sha256: fingerprint(filtered.text), redacted: filtered.redacted, createdAt: Date.now() }
}
