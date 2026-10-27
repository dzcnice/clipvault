import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { boundedText, fingerprint } from './input'
import { findBlockingSecret } from './redaction'

const PRIVATE_PART = /^(?:\.git|\.env(?:\..*)?|\.ssh|\.aws|\.azure|\.codex|\.npmrc|\.pypirc|node_modules|harness-home|migration-backups|credentials?(?:\..*)?|clipvault\.db(?:-.*)?)$/i
const PRIVATE_EXT = /\.(?:pem|pfx|p12|key|keystore|db|sqlite|sqlite3)$/i
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|py|json|html?|css|scss|md|txt|ya?ml|toml|ini|cfg|sql|sh|ps1|xml|csv|vue|svelte|rs|go|java|c|h|cpp|gitignore)$/i
export function isPrivatePath(path: string): boolean { return path.split(/[\\/]/).some(part => PRIVATE_PART.test(part)) || PRIVATE_EXT.test(path) }
export function within(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

export class ProjectFiles {
  constructor(readonly root: string, private readonly forbidden: string[] = []) {}
  async path(input: string, allowMissing = false): Promise<string> {
    boundedText(input, '相对路径', 1000)
    if (isAbsolute(input) || input.includes(':') || isPrivatePath(input)) throw new Error('该路径不在任务允许范围内')
    const root = await realpath(this.root), target = resolve(root, input || '.')
    if (!within(root, target) || this.forbidden.some(dir => within(resolve(dir), target))) throw new Error('拒绝访问项目范围外或私有目录')
    let current = root
    for (const part of relative(root, target).split(sep).filter(Boolean)) {
      current = join(current, part)
      try {
        const info = await lstat(current)
        if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error('不允许通过符号链接、联接或硬链接访问文件')
        if (!within(root, await realpath(current))) throw new Error('路径越界')
      } catch (error) { if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') break; throw error }
    }
    return target
  }
  async list(input = '.'): Promise<Array<{ name: string; directory: boolean }>> {
    const path = await this.path(input)
    const entries = await readdir(path, { withFileTypes: true })
    return entries.filter(entry => !entry.isSymbolicLink() && !isPrivatePath(join(input, entry.name))).slice(0, 300).map(entry => ({ name: entry.name, directory: entry.isDirectory() }))
  }
  async read(input: string): Promise<{ content: string; sha256: string }> {
    const path = await this.path(input)
    const file = await open(path, 'r')
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > 512_000 || info.nlink > 1) throw new Error('仅支持不超过 500 KB 的普通文本文件')
      const data = await file.readFile()
      if (data.includes(0) || !Buffer.from(data.toString('utf8')).equals(data)) throw new Error('该文件不是 UTF-8 文本')
      await this.path(input)
      return { content: data.toString('utf8'), sha256: fingerprint(data.toString('utf8')) }
    } finally { await file.close() }
  }
  async inspectWrite(path: string, expectedHash: string): Promise<{ before: string; sha256: string }> {
    if (!path || !TEXT_EXT.test(path)) throw new Error('此操作仅支持项目文本文件')
    const target = await this.path(path, true)
    try {
      const existing = await this.read(path)
      if (existing.sha256 !== expectedHash) throw new Error('文件已变化，请重新读取并生成修改')
      return { before: existing.content, sha256: existing.sha256 }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (expectedHash) throw new Error('文件已不存在，请重新确认')
      await this.path(relative(this.root, target), true)
      return { before: '', sha256: '' }
    }
  }
  async write(path: string, content: string, expectedHash: string): Promise<{ sha256: string }> {
    if (typeof content !== 'string' || Buffer.byteLength(content) > 512_000 || content.includes('\0')) throw new Error('文件内容无效或过长')
    await this.inspectWrite(path, expectedHash)
    const target = await this.path(path, true)
    await mkdir(dirname(target), { recursive: true })
    await this.path(path, true)
    const temporary = join(dirname(target), `.cv-${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
      await this.inspectWrite(path, expectedHash)
      await rename(temporary, target)
    } catch (error) { await unlink(temporary).catch(() => {}); throw error }
    return { sha256: fingerprint(content) }
  }
  async snapshot(target: string, secrets: string[]): Promise<Record<string, string>> {
    if (within(resolve(this.root), resolve(target))) throw new Error('检查副本必须位于项目之外')
    const manifest: Record<string, string> = {}, pending = ['.']
    let bytes = 0
    while (pending.length) {
      const directory = pending.shift()!
      const entries = await readdir(await this.path(directory), { withFileTypes: true })
      for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isSymbolicLink() || isPrivatePath(path)) continue
        if (entry.isDirectory()) { if (path.split(sep).length < 15) pending.push(path); continue }
        if (!entry.isFile() || !TEXT_EXT.test(entry.name)) continue
        if (Object.keys(manifest).length >= 2000) throw new Error('检查副本超过 2000 个文件，请缩小项目范围')
        const file = await this.read(path)
        bytes += Buffer.byteLength(file.content)
        if (bytes > 32_000_000) throw new Error('检查副本超过 32 MB，请缩小项目范围')
        if (findBlockingSecret(file.content, secrets)) throw new Error(`检查副本检测到敏感配置：${path}。请先移出代码文件`)
        const output = join(target, path)
        await mkdir(dirname(output), { recursive: true })
        await writeFile(output, file.content)
        manifest[path] = file.sha256
      }
    }
    return manifest
  }
  async verifySnapshot(manifest: Record<string, string>): Promise<boolean> {
    const pending = ['.'], paths: string[] = []
    while (pending.length) {
      const directory = pending.shift()!
      const entries = await readdir(await this.path(directory), { withFileTypes: true })
      for (const entry of entries) {
        const path = join(directory, entry.name)
        if (entry.isSymbolicLink() || isPrivatePath(path)) continue
        if (entry.isDirectory()) { if (path.split(sep).length < 15) pending.push(path); continue }
        if (entry.isFile() && TEXT_EXT.test(entry.name)) paths.push(path)
      }
    }
    if (paths.length !== Object.keys(manifest).length || paths.some(path => !(path in manifest))) return false
    for (const [path, hash] of Object.entries(manifest)) {
      try { if (fingerprint(await readFile(await this.path(path), 'utf8')) !== hash) return false } catch { return false }
    }
    return true
  }
}
