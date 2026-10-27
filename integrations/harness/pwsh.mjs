// Official pwsh tool with a main-process approval boundary. Execution is foreground-only.
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import * as ShellEnv from '@deepseek-ai/dsh-shell-env'
import * as PwshTool from '@deepseek-ai/dsh-tool-pwsh'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { resolve } from 'node:path'

class ApprovedShell extends ShellExecutor {
  get sandboxMode() { return 'workspace-write' }
  resolve(request) {
    if (request.sandboxPolicy?.mode !== 'workspace-write' || request.onExpiry === 'none') throw new Error('This deployment does not permit sandbox escalation or background commands.')
    if (resolve(request.workdir ?? process.cwd()) !== resolve(process.cwd())) throw new Error('Use the project root as workdir. Commands run in a temporary text snapshot.')
    if (request.dshEnv?.DSH_SESSION_ID !== process.env.CV_SESSION_ID) throw new Error('Only the parent session may request a command.')
    return { ...request, workdir: process.cwd(), timeoutMs: Math.min(120_000, Math.max(1000, request.timeoutMs ?? 30_000)), stdoutMaxBytes: 32_768, onExpiry: 'kill' }
  }
  async execute(spec) {
    const response = await fetch(`${process.env.CV_BRIDGE_URL}/tool`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.CV_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'workbench_run_pwsh', args: { command: spec.command, timeoutMs: spec.timeoutMs }, scope: { agentId: spec.dshEnv.DSH_SESSION_ID } }), signal: spec.signal
    })
    if (!response.ok) throw new Error('PowerShell 未获批准、已停止或受限运行失败，请查看会话记录。')
    const result = await response.json()
    let consumed = false
    const stream = value => ({ readFrom: offset => ({ text: Buffer.from(value.text).subarray(offset).toString('utf8'), nextOffset: Buffer.byteLength(value.text), lossy: value.truncated }) })
    return { status: 'completed', exitCode: result.exitCode, signal: result.signal, done: Promise.resolve(), sandbox: result.sandbox,
      observed: { stdout: stream(result.stdout), stderr: stream(result.stderr) },
      readOutput: () => { const delta = consumed ? '' : `${result.stdout.text}\n${result.stderr.text}`; consumed = true; return { delta, lossy: result.stdout.truncated || result.stderr.truncated } },
      kill: () => false, result: async () => result }
  }
}

export const name = 'clipvault-approved-pwsh'
export const inject = ['tools', 'systemPrompt', 'workingDirectory', 'sessionProjections']
export async function apply(ctx) {
  if (process.platform !== 'win32') return
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: process.cwd() }).await()
  await ctx.plugin(ApprovedShell).await()
  await ctx.plugin(ShellEnv).await()
  await ctx.plugin(PwshTool, { enableRunInBackground: false, promoteOnTimeout: false }).await()
  ctx.tools.guard(exec => exec.name === 'pwsh' && (exec.arguments?.sandbox_permissions !== undefined || exec.arguments?.run_in_background === true) ? 'Escalation and background commands are disabled.' : undefined)
  ctx.systemPrompt.section({ name: 'clipvault:pwsh-policy', order: 1001,
    text: 'pwsh 必须逐条经用户批准，只在新建的项目文本副本中运行，副本产物不回写原项目。使用相对路径、项目根 workdir。Windows ACL 仅限制写入，不隔离读取、网络；禁止尝试读取资料库、凭证或其他私人文件，禁止安装、提权、绕过限制或启动后台程序。需要保存修改时使用 workbench_write_file。' })
}
