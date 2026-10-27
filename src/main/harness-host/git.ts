import { existsSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

let cached: string | null | undefined
/** Locate git for the workspace-changes recorder; returns null when git is not installed. */
export function findGit(): string | null {
  if (cached !== undefined) return cached
  const names = process.platform === 'win32' ? ['git.exe'] : ['git']
  const dirs = (process.env.PATH ?? '').split(delimiter).map(item => item.replace(/^"|"$/g, '')).filter(item => item && isAbsolute(item))
  if (process.platform === 'win32') for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')]) if (base) dirs.push(join(base, 'Git', 'cmd'))
  cached = null
  for (const dir of dirs) for (const name of names) { const candidate = join(dir, name); if (existsSync(candidate)) { cached = candidate; return cached } }
  return cached
}
