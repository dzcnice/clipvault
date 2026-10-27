import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { WorkRun } from '../../types/workbench'

export async function inspectWorkspace(directory: string): Promise<NonNullable<WorkRun['workspace']>> {
  const unknown = { git: false, head: '', branch: '', dirtyCount: 0, checkedAt: Date.now() }
  const git = (process.env.PATH ?? '').split(delimiter).map(folder => join(folder.replace(/^"|"$/g, ''), process.platform === 'win32' ? 'git.exe' : 'git')).find(existsSync)
  if (!git) return unknown
  const env: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key]
  const run = (args: string[]): Promise<string> => new Promise((resolve, reject) => execFile(git, ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', directory, ...args], { env, windowsHide: true, timeout: 3000, maxBuffer: 65536 }, (error, stdout) => error ? reject(new Error('Git 状态不可用')) : resolve(stdout.trim())))
  try {
    const head = await run(['rev-parse', '--verify', 'HEAD'])
    const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
    const status = await run(['status', '--porcelain=v1', '--untracked-files=normal'])
    return { git: true, head, branch, dirtyCount: status ? status.split('\n').length : 0, checkedAt: Date.now() }
  } catch { return unknown }
}
