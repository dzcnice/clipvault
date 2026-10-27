import { app } from 'electron'
import { writeFile, readFile } from 'node:fs/promises'
import { mkdtempSync, mkdirSync, copyFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import Database from 'better-sqlite3'
import { initDatabase, closeDatabase } from '../../src/db/connection'
import * as vault from '../../src/main/crypto/vault'
import * as store from '../../src/db/workbench-store'
import { WorkbenchService } from '../../src/main/workbench/service'
import { redactInput } from '../../src/main/workbench/input'

let stage = 'read-input', retainedSecret = ''

async function main(): Promise<void> {
  // safeStorage fixes its OS key store during app readiness: configure the profile before any await.
  const root = mkdtempSync(join(tmpdir(), 'clipvault-workbench-preview-live-'))
  const profile = join(root, 'profile'), directory = join(root, 'sample-project')
  mkdirSync(profile); mkdirSync(directory)
  app.setPath('userData', profile)
  const sourceArg = process.argv.indexOf('--source-profile')
  const sourceProfile = sourceArg >= 0 ? resolve(process.argv[sourceArg + 1] ?? '') : null
  let config: { key: string; endpoint: string; model: string }
  if (sourceProfile) {
    if (basename(sourceProfile) !== 'clipvault-workbench-preview') throw new Error('只允许复制独立工作台预览资料库')
    stage = 'copy-encrypted-profile'
    const localState = join(sourceProfile, 'Local State')
    if (existsSync(localState)) copyFileSync(localState, join(profile, 'Local State'))
    const source = new Database(join(sourceProfile, 'clipvault.db'), { readonly: true, fileMustExist: true })
    try { await source.backup(join(profile, 'clipvault.db')) } finally { source.close() }
  } else {
    const channel = process.env.CV_ACCEPTANCE_URL
    delete process.env.CV_ACCEPTANCE_URL
    if (!channel?.startsWith('http://127.0.0.1:')) throw new Error('缺少单次本机验收通道')
    const response = await fetch(channel, { redirect: 'error', signal: AbortSignal.timeout(5000) })
    config = await response.json() as { key: string; endpoint: string; model: string }
  }
  await app.whenReady()
  stage = 'initialize-vault'
  await writeFile(join(profile, 'clipvault-prefs.json'), JSON.stringify({ clipboardMonitorEnabled: false, autoUpdateCheck: false, onboardingTipsSeen: true }))
  initDatabase()
  if (sourceProfile) {
    if (!vault.ensureVaultOpen().ok) throw new Error('加密副本无法解锁，源资料未修改')
    const model = store.getModelConfig()
    if (!model.resourceId) throw new Error('副本没有配置模型')
    config = { key: store.readResourceField(model.resourceId, model.field), endpoint: model.endpoint, model: model.model }
  } else vault.createVaultSafeStorage()
  retainedSecret = config!.key
  stage = 'save-model'
  const resource = store.saveResource({ name: '工作台运行模型', kind: 'model', environment: 'development', endpoint: config!.endpoint, fields: [{ name: 'key', value: config!.key, secret: true }] })
  config = config!
  config.key = ''
  store.saveModelConfig({ ...store.DEFAULT_MODEL, resourceId: resource.id, protocol: 'openai-chat', endpoint: config.endpoint, model: config.model, maxRequests: 8, maxMinutes: 2 })
  const project = store.saveProject({ name: '工作台隔离验收示例', directory, environment: 'development', description: '只用于验收的合成项目，可以检查完整任务记录。' })
  await writeFile(join(directory, 'settings.json'), '{"enabled":false,"source":"synthetic-fixture"}\n')
  await writeFile(join(directory, 'settings.test.cjs'), "const {test}=require('node:test'); const assert=require('node:assert/strict'); const settings=require('./settings.json'); test('enabled',()=>assert.equal(settings.enabled,true)); test('source',()=>assert.equal(settings.source,'synthetic-fixture'));\n")
  const service = new WorkbenchService()
  stage = 'create-task'
  const approved: string[] = []
  service.onChange(() => {
    for (const approval of service.approvals.list()) {
      const allowed = approval.operation === '连接模型运行任务' && approval.target === config.endpoint || approval.operation === '写入文件' && approval.target === 'settings.json' || approval.operation === '运行本机检查' && approval.target === directory && approval.description.startsWith('命令：node --test settings.test.cjs\n')
      approved.push(allowed ? approval.operation : '已拒绝范围外操作')
      service.approvals.respond(approval.id, approval.fingerprint, allowed)
    }
  })
  const task = await service.create({ projectId: project.id, prompt: '这是本机专用示例验收任务。读取 settings.json，把 enabled 从 false 改为 true，保持 source 不变。使用文件工具完成批准写入后，必须调用 workbench_run_check，命令准确为 node --test settings.test.cjs。测试文件已准备好，不要修改它。不要联网，不要访问其他目录。', acceptance: 'settings.json 是有效 JSON；enabled=true，source=synthetic-fixture；真实 Node 测试两项通过，退出码 0。' })
  let outcome: Record<string, unknown>
  try {
    await service.start(task.id)
    const deadline = Date.now() + 150000
    while (service.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
    if (service.busy) await service.stop(task.id)
    const result = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))
    const detail = store.getTaskDetail(task.id)
    if (detail.task.state !== 'waiting' || result.enabled !== true || result.source !== 'synthetic-fixture') throw new Error('模型未完成要求的文件变更')
    const check = store.taskReceipts(task.id).find(receipt => receipt.operation === 'run_check' && receipt.state === 'passed')
    if (!check) throw new Error('缺少真实本机测试证据')
    await service.accept(task.id)
    const files = (path: string): string[] => existsSync(path) ? readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)]) : []
    const noPlainSession = !files(join(profile, 'workbench')).some(path => /\.jsonl$/.test(path))
    if (!noPlainSession) throw new Error('发现未加密活动会话文件')
    outcome = { passed: true, model: config.model, endpoint: config.endpoint, taskId: task.id, sessionId: detail.runs.at(-1)?.sessionId, state: store.getTask(task.id).state, changes: detail.changes.map(change => ({ path: change.path, state: change.state })), approvals: approved, profile, directory, actualModelRequests: true, actualLocalCheck: true, noPlainSession, modelKeyAbsentFromDatabase: !readFileSync(join(profile, 'clipvault.db')).includes(Buffer.from(retainedSecret)), sourceProfileReadOnly: !!sourceProfile, verification: check.data }
  } catch {
    const detail = store.getTaskDetail(task.id)
    outcome = { passed: false, model: config.model, endpoint: config.endpoint, state: detail.task.state, lastError: detail.runs.at(-1)?.error || '任务未达到文件验收要求', approvals: approved, profile, directory }
  } finally { await service.shutdown(); vault.lockVault(); closeDatabase() }
  await writeFile(join(root, 'report.json'), JSON.stringify(outcome, null, 2))
  process.stdout.write(`LIVE_REPORT:${JSON.stringify(outcome)}\n`)
  app.quit()
}
main().catch(error => { process.stdout.write(`LIVE_REPORT:${JSON.stringify({ passed: false, stage, error: redactInput(error instanceof Error ? error.message : '独立验收初始化失败', [retainedSecret]).text.slice(0, 400) })}\n`); app.exit(1) })
