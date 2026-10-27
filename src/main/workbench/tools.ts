import { mkdtemp, mkdir, rm, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import * as store from '../../db/workbench-store'
import type { WorkRun, WorkTask } from '../../types/workbench'
import { boundedText, fingerprint } from './input'
import { redactForOutput as redactInput, findBlockingSecret } from './redaction'
import { ProjectFiles, within } from './files'
import { WorkApprovals } from './approvals'
import { endpointURL } from './bridge'
import { runLocalCheck, parseCheckCommand, LocalCheckStopError } from './local-check'
import { requestNetwork } from './network'
import { runOfficialPwsh } from './pwsh'

export class TaskTools {
  unconfirmedCheck = ''
  private proofs: Array<() => Promise<boolean>> = []
  private versions = new Map<string, number>()
  private operations = new Set<Promise<unknown>>()
  constructor(private readonly task: WorkTask, private readonly run: WorkRun, readonly files: ProjectFiles,
    private readonly approvals: WorkApprovals, private readonly signal: AbortSignal, private readonly tempRoot: string,
    private readonly secrets: () => string[], private readonly changed: () => void, private readonly runtimeRoot: string,
    private readonly audit: { event: typeof store.addEvent; receipt: typeof store.recordReceipt; permission?: 'readonly' | 'confirm' | 'project_auto' } = { event: store.addEvent, receipt: store.recordReceipt }) {
    for (const id of task.resourceIds) this.versions.set(id, store.getResource(id).version)
  }
  private event(kind: 'tool' | 'result' | 'error', text: string): void { this.audit.event(this.run.id, kind, redactInput(text, this.secrets()).text); this.changed() }
  async verified(): Promise<boolean> { return this.proofs.length > 0 && (await Promise.all(this.proofs.map(proof => proof().catch(() => false)))).every(Boolean) }
  async settled(): Promise<void> { await Promise.allSettled(this.operations) }
  grantResource(id: string): void {
    const resource = store.getResource(id)
    if (resource.state === 'revoked' || (resource.projectId && resource.projectId !== this.task.projectId) || resource.environment !== this.task.environment) throw new Error('资源项目、环境或状态不匹配')
    this.versions.set(id, resource.version)
  }
  execute(operation: string, args: Record<string, unknown>): Promise<unknown> {
    const pending = this.dispatch(operation, args)
    this.operations.add(pending)
    void pending.finally(() => this.operations.delete(pending)).catch(() => {})
    return pending
  }
  private async approve(operation: string, target: string, description: string, payload: unknown, difference?: { before: string; after: string }): Promise<void> {
    if (this.audit.permission === 'readonly') throw new Error('当前会话为只读权限')
    if (this.audit.permission === 'project_auto' && operation === '写入文件') { this.signal.throwIfAborted(); return }
    await this.approvals.request({ taskId: this.task.id, runId: this.run.id, operation, target,
      description: redactInput(description, this.secrets()).text, ...(difference ? { difference: { before: redactInput(difference.before, this.secrets()).text, after: redactInput(difference.after, this.secrets()).text } } : {}) }, payload, this.signal)
    this.signal.throwIfAborted()
  }
  private async dispatch(operation: string, args: Record<string, unknown>): Promise<unknown> {
    operation = operation.replace(/^workbench_/, '')
    this.signal.throwIfAborted()
    const path = typeof args.path === 'string' ? args.path : ''
    try {
      switch (operation) {
        case 'list_files': return await this.files.list(path)
        case 'read_file': {
          const file = await this.files.read(path)
          const filtered = redactInput(file.content, this.secrets())
          this.event('tool', `读取 ${path}${filtered.redacted ? '（已隐藏敏感内容）' : ''}`)
          return { ...file, content: filtered.text, redacted: filtered.redacted }
        }
        case 'write_file': {
          boundedText(args.content, '文件内容', 512_000)
          const content = args.content as string
          const expected = boundedText(args.expectedHash, '文件版本', 64)
          const before = await this.files.inspectWrite(path, expected)
          if (content.includes('[已隐藏敏感字段]')) throw new Error('该处含被隐藏的值，请在本地编辑')
          if (findBlockingSecret(content, this.secrets())) throw new Error('文件包含敏感字段，请在本地编辑，避免覆盖隐藏的内容')
          const description = `目录：${this.task.directory}\n文件：${path}\n原始内容：\n${before.before.slice(0, 24000)}\n修改后：\n${content.slice(0, 24000)}${content.length > 24000 || before.before.length > 24000 ? '\n（内容超过审批展示范围，已禁止本次修改）' : ''}`
          if (content.length > 24000 || before.before.length > 24000) throw new Error('单次修改超过 24,000 字符，请拆分文件或手动编辑')
          const id = randomUUID(), hash = fingerprint(JSON.stringify({ path, content, expected }))
          await this.approve('写入文件', path, description, { path, content, expected }, { before: before.before, after: content })
          this.audit.receipt(id, this.run.id, 'write_file', hash, 'started', { path, before: before.before, content, expected })
          const result = await this.files.write(path, args.content as string, expected)
          this.audit.receipt(id, this.run.id, 'write_file', hash, 'completed', { path, before: before.before, content: args.content, ...result })
          this.proofs = []
          this.event('tool', `已写入 ${path}；等待验证`)
          return result
        }
        case 'verify_file': {
          const file = await this.files.read(path)
          const mode = boundedText(args.mode, '检查类型', 20, true)
          if (mode === 'json') JSON.parse(file.content)
          else if (mode === 'contains') {
            const expected = boundedText(args.expectedText, '预期文本', 4000, true)
            if (!file.content.includes(expected)) throw new Error('文件未包含预期文本')
          } else throw new Error('未知检查类型')
          this.proofs.push(async () => (await this.files.read(path)).sha256 === file.sha256)
          this.audit.receipt(randomUUID(), this.run.id, 'verify_file', file.sha256, 'passed', { path, mode, sha256: file.sha256 })
          this.event('result', `${path}：${mode === 'json' ? 'JSON 格式' : '文本匹配'}检查通过`)
          return { passed: true, scope: mode, sha256: file.sha256 }
        }
        case 'check_api': return await this.checkApi(args)
        case 'run_check': return await this.runCheck(args)
        case 'run_pwsh': return await this.runPwsh(args)
        default: throw new Error('工具不在当前任务允许范围内')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '工具执行失败'
      this.event('error', `${operation}：${message}`)
      throw new Error(redactInput(message, this.secrets()).text)
    }
  }
  private async checkApi(args: Record<string, unknown>): Promise<unknown> {
    const id = boundedText(args.resourceId, '资源 ID', 100, true), field = boundedText(args.field, '字段', 64, true)
    const version = this.versions.get(id)
    if (version === undefined) throw new Error('该资源没有关联到本任务')
    const resource = store.getResource(id)
    if (resource.kind !== 'api' || resource.state === 'revoked' || resource.version !== version || resource.environment !== this.task.environment) throw new Error('资源状态或版本已变化，请重新创建任务')
    const url = endpointURL(resource.endpoint), expectedText = boundedText(args.expectedText, '预期响应文本', 4000)
    await this.approve('验证接口', url.href, `GET ${url.href}\n环境：${resource.environment}\n使用 ${resource.name} 的 ${field} 字段作为 Bearer 认证。\n预期：${expectedText || 'HTTP 成功状态'}\n只返回状态和匹配结果；禁止重定向。`, { id, field, version, url: url.href, expectedText })
    const receipt = randomUUID()
    this.audit.receipt(receipt, this.run.id, 'check_api', fingerprint(url.href + version), 'started', { id, version, endpoint: url.href })
    const response = await requestNetwork(url, { method: 'GET', redirect: 'error', headers: { authorization: `Bearer ${store.readResourceField(id, field, version)}` }, signal: AbortSignal.any([this.signal, AbortSignal.timeout(15000)]) })
    let text = ''
    if (response.body) {
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let done = false
      try { while (!done) { const chunk = await reader.read(); done = chunk.done; if (done) break; text += decoder.decode(chunk.value, { stream: true }); if (text.length > 65_536) throw new Error('接口响应超过验证限制') } } finally { await reader.cancel().catch(() => {}) }
    }
    this.signal.throwIfAborted()
    store.readResourceField(id, field, version)
    const passed = response.ok && !!expectedText && text.includes(expectedText)
    this.audit.receipt(receipt, this.run.id, 'check_api', fingerprint(url.href + version), passed ? 'passed' : response.ok && !expectedText ? 'observed' : 'failed', { id, version, status: response.status, passed, expectedText, scope: expectedText ? 'response_contains' : 'connectivity_only', endpoint: url.href })
    if (passed) {
      store.markResourceVerified(id, version, { taskId: this.task.id, runId: this.run.id, createdAt: Date.now(), endpoint: url.href, status: response.status })
      this.proofs.push(async () => { const current = store.getResource(id); return current.state !== 'revoked' && current.version === version })
    }
    this.event('result', `${resource.name}：HTTP ${response.status}，${passed ? `响应包含预期文本：${expectedText}；不代表网页已登录` : response.ok && !expectedText ? '接口可访问，未提供预期响应，不能作为验证通过' : '响应检查未通过'}`)
    return { status: response.status, passed, scope: expectedText ? 'response_contains' : 'connectivity_only' }
  }
  private async runCheck(args: Record<string, unknown>): Promise<unknown> {
    const command = boundedText(args.command, '命令', 4000, true)
    parseCheckCommand(command)
    if (findBlockingSecret(command, this.secrets())) throw new Error('检查命令不能包含密钥')
    await this.approve('运行本机检查', this.task.directory, `命令：${command}\n在项目文本副本中执行，复用现有 node_modules，不自动安装依赖。最多 2 分钟，不注入模型或资源密钥，产物不自动回写。\n以当前系统账户权限执行；项目脚本仍可能访问本机其他文件或网络，不提供容器隔离。请确认信任此项目及 package.json 中的测试脚本。`, { command, directory: this.task.directory, executor: 'local-node' })
    const staging = await mkdtemp(join(this.tempRoot, 'check-'))
    if (!within(this.tempRoot, staging)) throw new Error('临时目录无效')
    const receipt = randomUUID()
    let preserveSnapshot = false
    try {
      const manifest = await this.files.snapshot(staging, this.secrets())
      this.audit.receipt(receipt, this.run.id, 'run_check', fingerprint(JSON.stringify(manifest)), 'started', { command, manifest, executor: 'local-node' })
      const result = await runLocalCheck(staging, this.task.directory, command, this.signal, this.runtimeRoot)
      const unchanged = await this.files.verifySnapshot(manifest)
      const passed = result.exitCode === 0 && unchanged
      const output = redactInput(result.output, this.secrets()).text
      this.audit.receipt(receipt, this.run.id, 'run_check', fingerprint(JSON.stringify(manifest)), passed ? 'passed' : 'failed', { command, ...result, output, manifest, unchanged })
      if (passed) this.proofs.push(() => this.files.verifySnapshot(manifest))
      this.event('result', `本机检查：退出码 ${result.exitCode}${unchanged ? '' : '；项目已变化，结果不能用于当前文件'}\n${output}`)
      return { passed, exitCode: result.exitCode, output, unchanged }
    } catch (error) {
      preserveSnapshot = error instanceof LocalCheckStopError
      if (error instanceof LocalCheckStopError) this.unconfirmedCheck = error.message
      this.audit.receipt(receipt, this.run.id, 'run_check', fingerprint(command), preserveSnapshot ? 'review_required' : this.signal.aborted ? 'stopped' : 'failed', {
        command, executor: 'local-node', ...(preserveSnapshot ? { pid: (error as LocalCheckStopError).pid, staging } : {})
      })
      throw error
    } finally { if (!preserveSnapshot) await rm(staging, { recursive: true, force: true }) }
  }
  private async runPwsh(args: Record<string, unknown>): Promise<unknown> {
    const command = boundedText(args.command, 'PowerShell 命令', 12_000, true)
    const timeoutMs = Math.min(120_000, Math.max(1000, Number(args.timeoutMs) || 30_000))
    if (findBlockingSecret(command, this.secrets())) throw new Error('命令不能包含密钥')
    if (process.platform !== 'win32') throw new Error('此能力需要 Windows ACL')
    await this.approve('运行受限 PowerShell', this.task.directory,
      `完整命令：\n${command}\n\n在新建的系统临时目录中复制项目文本并设置 Windows ACL；仅允许写入该副本与本次临时目录。真实项目不改权限，产物不回写。最长 ${timeoutMs / 1000} 秒，不注入账号或模型密钥。\nACL 不隔离读取与网络；此命令仍可读取其他可访问文件、连接网络。请只批准已核对且信任的命令。禁止提权和后台运行。`, { command, timeoutMs, directory: this.task.directory, executor: 'official-pwsh-windows-acl' })
    const staging = await mkdtemp(join(tmpdir(), 'clipvault-pwsh-')), workspace = join(staging, 'workspace'), temporary = join(staging, 'temp')
    if (!within(tmpdir(), staging)) throw new Error('临时目录无效')
    const receipt = randomUUID()
    let preserve = false
    try {
      await mkdir(workspace); await mkdir(temporary)
      const manifest = await this.files.snapshot(workspace, this.secrets())
      this.audit.receipt(receipt, this.run.id, 'run_pwsh', fingerprint(command), 'started', { command, timeoutMs, manifest })
      const result = await runOfficialPwsh(workspace, temporary, command, timeoutMs, this.signal, this.runtimeRoot)
      const safe = { ...result, stdout: { ...result.stdout, text: redactInput(result.stdout.text, this.secrets()).text }, stderr: { ...result.stderr, text: redactInput(result.stderr.text, this.secrets()).text } }
      const unchanged = await this.files.verifySnapshot(manifest)
      this.audit.receipt(receipt, this.run.id, 'run_pwsh', fingerprint(command), result.exitCode === 0 && !result.timedOut && unchanged ? 'completed' : 'failed', { command, ...safe, unchanged, scope: 'temporary-text-snapshot' })
      this.event('result', `受限 PowerShell：退出码 ${result.exitCode ?? '无'}；仅在临时文本副本执行，产物不回写\n${safe.stdout.text}\n${safe.stderr.text}`)
      return safe
    } catch (error) {
      preserve = error instanceof LocalCheckStopError
      if (preserve) this.unconfirmedCheck = (error as Error).message
      this.audit.receipt(receipt, this.run.id, 'run_pwsh', fingerprint(command), preserve ? 'review_required' : this.signal.aborted ? 'stopped' : 'failed', { command, ...(preserve ? { staging } : {}) })
      throw error
    } finally {
      // The granted child cannot replace its ungranted parent. Never follow a replaced root.
      if (!preserve && within(tmpdir(), staging) && !(await lstat(staging)).isSymbolicLink()) await rm(staging, { recursive: true, force: true })
    }
  }
}
