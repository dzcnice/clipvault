import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export const CHECK_IMAGE = 'node:22.22.1-bookworm-slim'
export function dockerExecutable(): string {
  const path = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Docker/Docker/resources/bin/docker.exe') : '/usr/bin/docker'
  if (!existsSync(path)) throw new Error('未安装容器运行时，无法执行项目命令')
  return path
}
export function dockerEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {}
  for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'HOME']) if (process.env[key]) result[key] = process.env[key]
  return result
}
const hostArgs = (): string[] => ['--host', process.platform === 'win32' ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock']
function docker(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => execFile(dockerExecutable(), [...hostArgs(), ...args], { env: dockerEnvironment(), windowsHide: true, timeout: 12_000, maxBuffer: 65_536 }, (error, stdout) => error ? reject(new Error('本机容器服务不可用、镜像未准备或清理失败')) : resolve(stdout.trim())))
}
export async function containerReady(): Promise<boolean> {
  try { return /^sha256:[a-f0-9]{64}$/.test(await docker(['image', 'inspect', CHECK_IMAGE, '--format', '{{.Id}}'])) } catch { return false }
}
export async function runContainerCheck(directory: string, command: string, signal: AbortSignal, executionId = randomUUID()): Promise<{ exitCode: number; output: string; image: string }> {
  signal.throwIfAborted()
  if (!command.trim() || command.length > 4000 || command.includes('\0')) throw new Error('检查命令无效')
  if (!/^[a-f0-9-]{36}$/.test(executionId)) throw new Error('检查标识无效')
  if (directory.includes(',')) throw new Error('容器检查目录不能包含逗号')
  const image = await docker(['image', 'inspect', CHECK_IMAGE, '--format', '{{.Id}}'])
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw new Error('容器镜像身份无效')
  signal.throwIfAborted()
  const name = `clipvault-check-${executionId}`
  const args = ['create', '--name', name, '--label', 'com.clipvault.check=true', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '128', '--memory', '512m', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m',
    '--mount', `type=bind,source=${directory},target=/workspace`, '--workdir', '/workspace', '--env', 'HOME=/tmp', '--env', 'CI=1',
    image, 'sh', '-lc', command]
  let cleanup: Promise<void> | undefined, created = false
  const remove = (): Promise<void> => cleanup ??= docker(['rm', '--force', name]).then(() => {}).catch(error => { cleanup = undefined; throw error })
  const finishCleanup = async (): Promise<void> => {
    try { await remove() } catch (error) { if (created) throw error }
  }
  try {
    // create 超时仍可能已创建，最终清理覆盖这一窗口，不能只关闭 docker 客户端。
    await docker(args); created = true
    signal.throwIfAborted()
    const child = spawn(dockerExecutable(), [...hostArgs(), 'start', '--attach', name], { env: dockerEnvironment(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', timedOut = false
    const collect = (data: Buffer): void => { if (output.length < 65_536) output += data.toString('utf8').slice(0, 65_536 - output.length) }
    child.stdout.on('data', collect); child.stderr.on('data', collect)
    const abort = (): void => { void remove().catch(() => {}); child.kill() }
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => { timedOut = true; abort() }, 120_000)
    const finished = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('close', () => resolve()) })
    if (signal.aborted) abort()
    try {
      await finished
      const exitCode = signal.aborted || timedOut ? -1 : Number(await docker(['inspect', name, '--format', '{{.State.ExitCode}}']))
      await remove()
      signal.throwIfAborted()
      if (timedOut) throw new Error('检查超过 2 分钟，容器已结束')
      if (!Number.isInteger(exitCode)) throw new Error('没有可靠的容器退出码')
      return { exitCode, output, image }
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
  } finally {
    // 即使创建请求未返回，也只清理本次随机命名的容器。已创建时清理失败必须向上报告。
    await finishCleanup()
  }
}
