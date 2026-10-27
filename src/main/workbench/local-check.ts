import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, symlink } from 'node:fs/promises'
import { join, delimiter, dirname, isAbsolute } from 'node:path'

export class LocalCheckStopError extends Error {
  constructor(readonly pid: number | undefined) {
    super(`尚未确认本机检查进程停止（PID ${pid ?? '未知'}），临时副本已保留；请核对进程后再继续任务`)
    this.name = 'LocalCheckStopError'
  }
}

export function checkEnvironment(home: string, node: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'SystemDrive', 'OS']) if (process.env[key]) env[key] = process.env[key]
  return { ...env, PATH: [dirname(node), process.env.PATH ?? ''].join(delimiter), HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TEMP: home, TMP: home,
    CI: '1', NO_COLOR: '1', npm_config_userconfig: join(home, '.npmrc'), npm_config_cache: join(home, '.npm-cache'), npm_config_audit: 'false', npm_config_fund: 'false' }
}
export function parseCheckCommand(command: string): string[] {
  if (!command.trim() || command.length > 4000 || /[\r\n\0;&|<>`$%^!]/.test(command)) throw new Error('请填写单条测试、构建或检查命令，不支持 shell 拼接')
  const args: string[] = [], pattern = /"([^"]*)"|'([^']*)'|([^\s"']+)/gy
  let offset = 0
  while (offset < command.length) {
    while (/\s/.test(command[offset] ?? '') && offset < command.length) offset++
    if (offset === command.length) break
    pattern.lastIndex = offset
    const match = pattern.exec(command)
    if (!match) throw new Error('命令引号不完整')
    args.push(match[1] ?? match[2] ?? match[3]!); offset = pattern.lastIndex
  }
  if (args.some(arg => {
    const value = arg.startsWith('-') && arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : arg
    return isAbsolute(value) || /^[a-z]:/i.test(value) || value.split(/[\\/]/).includes('..')
  })) throw new Error('命令只能引用当前项目内的相对路径')
  const [program, subcommand, script] = args
  if (program === 'node' && subcommand === '--test' && !args.some(arg => /^--(?:eval|print|require|import|loader|experimental-loader|inspect)/.test(arg) || /^-[rep]/.test(arg))) return args
  const npmOverrides = /^(?:-g|--(?:global|prefix|userconfig|globalconfig|cache|script-shell|location|workspace|workspaces|config))(?:=|$)/
  if (program === 'npm' && !args.some(arg => npmOverrides.test(arg)) && (subcommand === 'test' || subcommand === 'run' && /^(test(?::[\w-]+)?|typecheck|lint|build)$/.test(script ?? ''))) return args
  throw new Error('首版支持 node --test、npm test、npm run test/typecheck/lint/build，不自动安装依赖')
}
function npmCLI(node: string): string {
  for (const folder of [dirname(node), ...(process.env.PATH ?? '').split(delimiter)]) {
    const candidate = join(folder.replace(/^"|"$/g, ''), 'node_modules/npm/bin/npm-cli.js')
    if (existsSync(candidate)) return candidate
  }
  throw new Error('未找到本机 npm，请使用 node --test，或先准备项目所需 Node/npm 环境')
}
export function localCheckReady(runtimeRoot: string): boolean {
  return existsSync(join(runtimeRoot, process.platform === 'win32' ? 'node.exe' : 'node'))
}
export async function runLocalCheck(directory: string, source: string, command: string, signal: AbortSignal, runtimeRoot: string, timeoutMs = 120000): Promise<{ exitCode: number; output: string; engine: string }> {
  const args = parseCheckCommand(command), node = join(runtimeRoot, process.platform === 'win32' ? 'node.exe' : 'node')
  if (!existsSync(node)) throw new Error('随应用提供的 Node 测试运行时不存在，请重新构建')
  signal.throwIfAborted()
  const dependencies = join(source, 'node_modules')
  if (existsSync(dependencies)) {
    const info = await lstat(dependencies)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('项目依赖根目录不能是外部链接，请先整理依赖目录')
    await symlink(dependencies, join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  }
  signal.throwIfAborted()
  const actualArgs = args[0] === 'npm' ? [npmCLI(node), ...args.slice(1)] : args.slice(1)
  const child = spawn(node, actualArgs, { cwd: directory, env: checkEnvironment(directory, node), windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let exited = false
  child.once('exit', () => { exited = true })
  let output = '', timedOut = false, stopping: Promise<void> | undefined
  let rejectStop: (error: Error) => void = () => {}
  const stopFailed = new Promise<never>((_resolve, reject) => { rejectStop = reject })
  const collect = (data: Buffer): void => { if (output.length < 65536) output += data.toString('utf8').slice(0, 65536 - output.length) }
  child.stdout.on('data', collect); child.stderr.on('data', collect)
  const stop = (): Promise<void> => stopping ??= new Promise((resolve, reject) => {
    if (!child.pid || exited) { resolve(); return }
    if (process.platform === 'win32') execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => {
      if (!error || exited) { resolve(); return }
      // taskkill may report an already-exiting PID before Node delivers its exit event.
      // A signal exit keeps exitCode=null, so use the observed exit event as evidence.
      setTimeout(() => exited ? resolve() : reject(new Error('尚未确认本机检查进程停止，请核对运行中的命令')), 500)
    })
    else { try { process.kill(-child.pid, 'SIGKILL'); resolve() } catch { if (child.exitCode !== null) resolve(); else reject(new Error('尚未确认本机检查进程停止')) } }
  })
  const abort = (): void => { void stop().catch(() => rejectStop(new LocalCheckStopError(child.pid))) }
  const closed = new Promise<number>((resolve, reject) => { child.once('error', () => reject(new Error('无法启动本机检查进程'))); child.once('close', code => resolve(code ?? -1)) })
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; abort() }, timeoutMs)
  if (signal.aborted) abort()
  try {
    const exitCode = await Promise.race([closed, stopFailed])
    if (stopping) await stopping
    signal.throwIfAborted()
    if (timedOut) throw new Error('本机检查超过运行时限，已结束受管进程')
    return { exitCode, output, engine: 'local-node' }
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
