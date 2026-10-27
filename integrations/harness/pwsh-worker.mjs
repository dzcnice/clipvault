// One approved command, clean process environment, official executor + ACL provider.
import { Context } from '@deepseek-ai/cordis'
import Session from '@deepseek-ai/dsh-session'
import Projection from '@deepseek-ai/dsh-session-projection'
import Policy from '@deepseek-ai/dsh-sandbox-policy'
import Sandbox from '@deepseek-ai/dsh-sandbox-local'
import Subprocess from '@deepseek-ai/dsh-subprocess-local'
import Pwsh from '@deepseek-ai/dsh-pwsh-sandbox'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lstat } from 'node:fs/promises'

class MemoryOutputSubprocess extends Subprocess {
  spawn(spec) {
    const memory = stream => typeof stream === 'object' && stream !== null && 'maxBytes' in stream ? { maxBytes: stream.maxBytes } : stream
    return super.spawn({ ...spec, stdio: { ...spec.stdio, stdout: memory(spec.stdio.stdout), stderr: memory(spec.stdio.stderr) } })
  }
}
const ctx = new Context()
let input = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) {
  input += chunk
  if (input.length > 20_000) throw new Error('Command payload too large')
}
try {
  if (process.platform !== 'win32') throw new Error('Windows ACL required')
  const args = JSON.parse(input), workspace = resolve(process.cwd()), root = dirname(workspace)
  if (basename(workspace) !== 'workspace' || !/^clipvault-(?:pwsh|v6)-[\w-]+$/.test(basename(root))) throw new Error('Temporary workspace required')
  if ((await lstat(root)).isSymbolicLink() || (await lstat(workspace)).isSymbolicLink()) throw new Error('Linked workspace refused')
  if (typeof args.command !== 'string' || !args.command.trim() || args.command.length > 12_000 || args.command.includes('\0')) throw new Error('Invalid command')
  const timeoutMs = Math.min(120_000, Math.max(1000, Number(args.timeoutMs) || 30_000))
  await ctx.plugin(Session).await()
  await ctx.plugin(Projection).await()
  await ctx.plugin(Policy, { mode: 'workspace-write', workspaceRoot: workspace }).await()
  await ctx.plugin(MemoryOutputSubprocess).await()
  await ctx.plugin(Sandbox, { probeTimeoutMs: 10_000 }).await()
  // Relocate the unchanged official runner into the signed/hashed application bundle.
  ctx.sandbox.internals.windowsAclRunnerEntry = join(dirname(fileURLToPath(import.meta.url)), 'windows-acl-runner.mjs')
  await ctx.plugin(Pwsh, { cwd: workspace, timeoutMs, maxTimeoutMs: 120_000, maxOutputBytes: 32_768, maxSpillBytes: 32_768, graceMs: 1000,
    pwshPath: join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') }).await()
  const result = await (await ctx.shell.execute(ctx.shell.resolve({ command: args.command, timeoutMs, workdir: workspace, sandboxPolicy: { mode: 'workspace-write', workspaceRoot: workspace, sessionId: 'approved-command' } }))).result()
  const bounded = stream => ({ text: stream.text, truncated: stream.truncated })
  process.stdout.write(JSON.stringify({ ...result, stdout: bounded(result.stdout), stderr: bounded(result.stderr) }) + '\n')
} catch {
  process.stdout.write(JSON.stringify({ error: 'Windows ACL PowerShell 执行失败；没有降级为无限制运行。' }) + '\n')
  process.exitCode = 1
} finally { await ctx.fiber.dispose() }
