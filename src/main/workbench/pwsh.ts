import { execFile, spawn } from 'node:child_process'
import { join } from 'node:path'
import { checkEnvironment, LocalCheckStopError } from './local-check'
import { verifyRuntime } from './runtime'

export interface PwshResult {
  exitCode: number | null; signal: string | null; timedOut: boolean; aborted: boolean; timeoutMs: number
  stdout: { text: string; truncated: boolean }; stderr: { text: string; truncated: boolean }
  sandbox: { mode: 'workspace-write'; denied: boolean; enforcement: 'partial' }
}

/** The worker and every descendant belong to this exact invocation. No unrestricted fallback. */
export async function runOfficialPwsh(workspace: string, temporary: string, command: string, timeoutMs: number, signal: AbortSignal, runtime: string): Promise<PwshResult> {
  if (process.platform !== 'win32') throw new Error('此能力需要 Windows ACL')
  const manifest = await verifyRuntime(runtime), node = join(runtime, manifest.node)
  signal.throwIfAborted()
  const child = spawn(node, [join(runtime, 'pwsh-worker.mjs')], { cwd: workspace, env: checkEnvironment(temporary, node), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', exited = false, stopping: Promise<void> | undefined, timedOut = false, overflow = false
  child.once('exit', () => { exited = true })
  let rejectStop: (error: Error) => void = () => {}
  const stopFailed = new Promise<never>((_resolve, reject) => { rejectStop = reject })
  const stop = (): Promise<void> => stopping ??= new Promise((resolve, reject) => {
    if (!child.pid || exited) { resolve(); return }
    execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => {
      if (!error || exited) { resolve(); return }
      setTimeout(() => exited ? resolve() : reject(new LocalCheckStopError(child.pid)), 500)
    })
  })
  const abort = (): void => { void stop().catch(error => rejectStop(error as Error)) }
  const closed = new Promise<number>((resolve, reject) => {
    child.once('error', () => reject(new Error('无法启动受限 PowerShell')))
    child.once('close', code => resolve(code ?? -1))
  })
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { if (output.length + chunk.length > 250_000) { overflow = true; abort() } else output += chunk })
  child.stderr.resume()
  child.stdin.on('error', () => { /* close/error carries the result; never log the command. */ })
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; abort() }, timeoutMs + 20_000)
  child.stdin.end(JSON.stringify({ command, timeoutMs }))
  if (signal.aborted) abort()
  try {
    const code = await Promise.race([closed, stopFailed])
    if (stopping) await stopping
    signal.throwIfAborted()
    if (timedOut || overflow || code !== 0) throw new Error('受限 PowerShell 未正常完成；没有降级为无限制运行')
    const result = JSON.parse(output) as PwshResult
    if (result.sandbox?.mode !== 'workspace-write' || result.sandbox.enforcement !== 'partial' || typeof result.stdout?.text !== 'string' || typeof result.stderr?.text !== 'string') throw new Error('受限 PowerShell 未返回有效隔离证据')
    return result
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort) }
}
