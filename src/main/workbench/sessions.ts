import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { within } from './files'
import { saveSessionArchive, readSessionArchive } from '../../db/workbench-store'

/** 官方 JSONL 运行时需要可写目录；退出后封入现有 DEK 加密数据库，恢复时短暂展开。 */
export async function sealSession(root: string, home: string, sessionId: string): Promise<void> {
  if (!within(resolve(root), resolve(home)) || resolve(root) === resolve(home)) throw new Error('会话目录越界')
  const files: Record<string, string> = {}, pending = [home]
  let bytes = 0
  while (pending.length) {
    const directory = pending.shift()!
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('会话文件不能使用链接')
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { pending.push(path); continue }
      if (!entry.isFile() || entry.name.endsWith('.lock')) continue
      const content = await readFile(path)
      bytes += content.length
      if (bytes > 64_000_000 || Object.keys(files).length >= 1000) throw new Error('会话超过归档限制，已保留原目录，请新建任务')
      files[relative(home, path).replaceAll('\\', '/')] = content.toString('base64')
    }
  }
  if (!Object.keys(files).length) return
  saveSessionArchive(sessionId, { ...readSessionArchive(sessionId), ...files })
  await rm(home, { recursive: true, force: true })
}
export async function restoreSession(home: string, sessionId: string): Promise<void> {
  const files = readSessionArchive(sessionId)
  if (!files) throw new Error('没有可恢复的持久会话，请重新运行任务')
  for (const [name, encoded] of Object.entries(files)) {
    const path = resolve(home, name)
    if (!name || name.includes(':') || !within(resolve(home), path) || path === resolve(home)) throw new Error('会话归档路径无效')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(encoded, 'base64'), { flag: 'wx' })
  }
}
