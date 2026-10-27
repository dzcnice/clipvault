import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

export class HostTransport {
  private child: ChildProcessWithoutNullStreams
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  private next = 0
  private exited = false
  private closed: Promise<void>
  constructor(runtimeRoot: string, node: string, directory: string, env: NodeJS.ProcessEnv, notification: (value: unknown) => void, unexpectedExit: () => void) {
    this.child = spawn(join(runtimeRoot, node), [join(runtimeRoot, 'host-worker.mjs')], { cwd: directory, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const lines = createInterface({ input: this.child.stdout })
    lines.on('line', line => {
      if (line.length > 2_000_000) { this.child.kill(); return }
      try {
        const message = JSON.parse(line)
        if (message.type === 'notification') notification(message.notification)
        if (message.type === 'response') {
          const item = this.pending.get(message.id)
          if (!item) return
          this.pending.delete(message.id); clearTimeout(item.timer)
          if (message.error) item.reject(new Error('Harness 请求失败')); else item.resolve(message.result)
        }
      } catch { /* 不记录原始运行时输出 */ }
    })
    this.child.stderr.resume()
    this.child.stdin.on('error', () => {})
    this.closed = new Promise(resolve => {
      const finish = (): void => {
        if (this.exited) return
        this.exited = true; lines.close()
        for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Harness 连接已关闭')) }
        this.pending.clear(); unexpectedExit(); resolve()
      }
      this.child.once('error', finish); this.child.once('exit', finish)
    })
  }
  request(input: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    if (this.exited) return Promise.reject(new Error('Harness 连接已关闭'))
    const id = ++this.next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Harness 请求超时')) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(JSON.stringify({ ...input, id }) + '\n')
    })
  }
  async close(): Promise<void> {
    if (this.exited) return
    this.child.stdin.write('{"type":"close"}\n')
    const timer = setTimeout(() => {
      if (this.exited || !this.child.pid) return
      if (process.platform === 'win32') execFile(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true }, () => {})
      else this.child.kill('SIGKILL')
    }, 6000)
    try { await this.closed } finally { clearTimeout(timer) }
  }
}
