import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '', project: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (name: string) => name === 'home' ? homedir() : fixture.userData, getAppPath: () => resolve('.') } }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('./container', () => ({ containerReady: async () => false, runContainerCheck: async () => { throw new Error('Container is not part of this fixture') } }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { WorkbenchService } from './service'
import { fingerprint } from './input'
import { readEncryptedSession } from './session-store'

let root = '', service: WorkbenchService
function modelReply(text: string, tool?: { name: string; input: unknown }): Response {
  const events = [
    { type: 'message_start', message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: 'call-fixture', name: tool.name, input: {} } : { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } },
    { type: 'message_stop' }
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
async function waitUntil(check: () => boolean, ms = 15000): Promise<void> {
  const until = Date.now() + ms
  while (!check()) { if (Date.now() > until) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 25)) }
}
describe.skipIf(!isSqliteAvailable())('official Harness and local workbench integration', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-service-'))
    fixture.userData = join(root, 'userdata'); fixture.project = join(root, '代码项目')
    await mkdir(fixture.userData); await mkdir(fixture.project)
    createIntegrationDb(); vault.createVault('Fixture-Password-2026!')
    const model = store.saveResource({ name: 'Fixture Model', kind: 'model', endpoint: 'https://model.fixture/anthropic', environment: 'dev', fields: [{ name: 'key', value: 'MODEL-CANARY-unique-2026', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, resourceId: model.id, endpoint: model.endpoint, maxRequests: 10, maxMinutes: 1 })
    service = new WorkbenchService()
  })
  afterEach(async () => { await service.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })
  it('reads the native workbench snapshot without recovering or rewriting a legacy run', async () => {
    const project = store.saveProject({ name: 'Legacy fixture', directory: fixture.project, environment: 'dev' })
    const task = store.createTask({ projectId: project.id, prompt: 'SYNTHETIC_LEGACY_READ_ONLY' }, [])
    store.createRun(task.id, 'legacy-fixture')
    const before = store.getTaskDetail(task.id)
    await service.snapshot()
    expect(store.getTaskDetail(task.id)).toEqual(before)
  })
  it('connects, approves exact actions, probes a resource, edits a file, verifies it, archives and resumes the same session', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const resource = store.saveResource({ name: 'Fixture API', kind: 'api', projectId: project.id, environment: 'dev', endpoint: 'https://api.fixture/health', fields: [{ name: 'key', value: 'API-CANARY-unique-2026', secret: true }] })
    await writeFile(join(fixture.project, 'app.js'), 'export const status = "broken"\n')
    const modelBodies: string[] = [], resourceHeaders: unknown[] = []
    const originalFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url, options)
      if (String(url) === resource.endpoint) { resourceHeaders.push(options?.headers); return new Response('healthy') }
      modelBodies.push(String(options?.body))
      const steps = [
        { name: 'workbench_check_api', input: { resourceId: resource.id, field: 'key', expectedText: 'healthy' } },
        { name: 'workbench_read_file', input: { path: 'app.js' } },
        { name: 'workbench_write_file', input: { path: 'app.js', content: 'export const status = "fixed"\n', expectedHash: fingerprint('export const status = "broken"\n') } },
        { name: 'workbench_verify_file', input: { path: 'app.js', mode: 'contains', expectedText: '"fixed"' } }
      ]
      return modelReply('已修改并完成文本验证，未运行容器测试。', steps[modelBodies.length - 1])
    })
    const reviewed: string[] = []
    service.onChange(() => { for (const approval of service.approvals.list()) { reviewed.push(approval.operation); service.approvals.respond(approval.id, approval.fingerprint, true) } })
    const task = await service.create({ projectId: project.id, prompt: '修复 API 示例，并验证内容', resourceIds: [resource.id] })
    await service.start(task.id)
    await waitUntil(() => !service.busy)
    const detail = store.getTaskDetail(task.id)
    expect(detail.task.state, JSON.stringify(detail.events)).toBe('waiting')
    expect(await readFile(join(fixture.project, 'app.js'), 'utf8')).toContain('"fixed"')
    expect(reviewed).toEqual(['连接模型运行任务', '验证接口', '写入文件'])
    expect(resourceHeaders).toEqual([{ authorization: 'Bearer API-CANARY-unique-2026' }])
    expect(modelBodies.join('')).not.toMatch(/API-CANARY|MODEL-CANARY/)
    expect(JSON.stringify(detail)).not.toMatch(/API-CANARY|MODEL-CANARY/)
    const sessionId = detail.runs[0]!.sessionId
    const archive = readEncryptedSession(sessionId)!
    expect(archive.events.length).toBeGreaterThan(0)
    expect(JSON.stringify(archive)).not.toMatch(/API-CANARY|MODEL-CANARY/)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT event FROM wb_session_events').all())).not.toContain('修复 API 示例')
    expect(store.getResource(resource.id)).toMatchObject({ state: 'verified', verification: { taskId: task.id, status: 200 } })
    expect(detail.changes).toMatchObject([{ path: 'app.js', state: 'completed', before: 'export const status = "broken"\n', after: 'export const status = "fixed"\n' }])
    await writeFile(join(fixture.project, 'app.js'), 'changed after verification')
    await expect(service.accept(task.id)).rejects.toThrow('文件')
    await writeFile(join(fixture.project, 'app.js'), 'export const status = "fixed"\n')
    service = new WorkbenchService()
    await service.snapshot()
    service.onChange(() => { for (const approval of service.approvals.list()) service.approvals.respond(approval.id, approval.fingerprint, true) })
    await service.accept(task.id)
    expect(store.getTask(task.id).state).toBe('completed')
    const followUp = await service.followUp({ taskId: task.id, prompt: '追加要求：检查空输入处理，保留已完成文件', expectedRevision: 1 })
    expect(followUp).toMatchObject({ revision: 2, state: 'draft', activeRunId: null })
    await expect(service.accept(task.id)).rejects.toThrow('验收状态')
    await service.start(task.id, true)
    await waitUntil(() => !service.busy)
    const restored = store.getTaskDetail(task.id)
    expect(restored.runs.at(-1)?.sessionId).toBe(sessionId)
    expect(restored.events.some(event => event.text === '已恢复持久会话')).toBe(true)
    expect(restored.runs.at(-1)?.inputRevision).toBe(2)
    expect(modelBodies.at(-1)).toContain('追加要求')
  }, 30000)
  it('rejects the initial approval without making a model request', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const task = await service.create({ projectId: project.id, prompt: '不要执行未批准的任务' })
    await service.start(task.id)
    await waitUntil(() => service.approvals.list().length === 1)
    const approval = service.approvals.list()[0]!
    service.approvals.respond(approval.id, approval.fingerprint, false)
    await waitUntil(() => !service.busy)
    expect(store.getTask(task.id).state).toBe('failed')
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('runs two independent projects but queues overlapping directories and stops all cleanly', async () => {
    const other = join(root, 'other-project'); await mkdir(other)
    const a = store.saveProject({ name: 'A', directory: fixture.project, environment: 'dev' })
    const b = store.saveProject({ name: 'B', directory: other, environment: 'dev' })
    const first = await service.create({ projectId: a.id, prompt: 'First' })
    const same = await service.create({ projectId: a.id, prompt: 'Same directory' })
    const independent = await service.create({ projectId: b.id, prompt: 'Independent' })
    await service.start(first.id); await service.start(same.id); await service.start(independent.id)
    expect((await service.snapshot()).harness.activeTaskIds).toEqual([first.id, independent.id])
    expect(store.getTask(same.id).state).toBe('queued')
    await service.shutdown()
    expect(service.busy).toBe(false)
    expect(service.approvals.list()).toEqual([])
    expect(store.getTask(same.id).state).toBe('interrupted')
  })
  it('does not accept legacy HTTP-success receipts as verified account behavior', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const resource = store.saveResource({ name: 'API', kind: 'api', endpoint: 'https://api.fixture/health', environment: 'dev', fields: [{ name: 'key', value: 'TEST-ONLY', secret: true }] })
    const task = await service.create({ projectId: project.id, prompt: '验证接口', resourceIds: [resource.id] })
    const run = store.createRun(task.id, '0.2.1-rc.2')
    store.recordReceipt('old-http-success', run.id, 'check_api', 'legacy', 'passed', { id: resource.id, version: resource.version, status: 200 })
    store.finishRun(run.id, 'waiting', '旧版 HTTP 200')
    await expect(service.accept(task.id)).rejects.toThrow('验证证据')
  })
  it('requires explicit review of an unconfirmed local process before another run', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const task = await service.create({ projectId: project.id, prompt: '继续验证' })
    const run = store.createRun(task.id, '0.2.1-rc.2')
    store.recordReceipt('pending-check', run.id, 'run_check', 'command', 'review_required', { command: 'node --test test.cjs', pid: 99999 })
    store.finishRun(run.id, 'interrupted', '')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await service.start(task.id)
    await waitUntil(() => service.approvals.list().length === 1)
    const approval = service.approvals.list()[0]!
    expect(approval.operation).toBe('核对中断检查')
    expect(approval.description).toContain('99999')
    service.approvals.respond(approval.id, approval.fingerprint, false)
    await waitUntil(() => !service.busy)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(store.taskReceipts(task.id).find(item => item.id === 'pending-check')?.state).toBe('review_required')
  })
  it('reconciles an interrupted write against real bytes without replaying it', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const task = await service.create({ projectId: project.id, prompt: '核对上次修改' })
    const interrupted = store.createRun(task.id, '0.2.1-rc.2')
    store.recordReceipt('unfinished-write', interrupted.id, 'write_file', 'approved-fingerprint', 'started', { path: 'state.json', before: '{"n":0}', content: '{"n":1}', expected: fingerprint('{"n":0}') })
    await writeFile(join(fixture.project, 'state.json'), '{"n":1}')
    store.finishRun(interrupted.id, 'interrupted', '')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelReply('已核对当前文件；未重放写入。'))
    service.onChange(() => { for (const approval of service.approvals.list()) service.approvals.respond(approval.id, approval.fingerprint, true) })
    await service.start(task.id)
    await waitUntil(() => !service.busy)
    expect(store.taskReceipts(task.id).find(receipt => receipt.id === 'unfinished-write')?.state).toBe('completed')
    expect(store.getTaskDetail(task.id).events.some(event => event.text.includes('未重复执行写入'))).toBe(true)
    expect(await readFile(join(fixture.project, 'state.json'), 'utf8')).toBe('{"n":1}')
  })
  it('requires review when an interrupted write now contains a user edit', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    const task = await service.create({ projectId: project.id, prompt: '保留我的修改后继续' })
    const interrupted = store.createRun(task.id, '0.2.1-rc.2')
    store.recordReceipt('uncertain-write', interrupted.id, 'write_file', 'approved-fingerprint', 'started', { path: 'state.json', before: '{"n":0}', content: '{"n":1}', expected: fingerprint('{"n":0}') })
    await writeFile(join(fixture.project, 'state.json'), '{"n":2}')
    store.finishRun(interrupted.id, 'interrupted', '')
    const reviewed: string[] = []
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(modelReply('保留用户修改。'))
    service.onChange(() => { for (const approval of service.approvals.list()) { reviewed.push(approval.operation); service.approvals.respond(approval.id, approval.fingerprint, true) } })
    await service.start(task.id)
    await waitUntil(() => !service.busy)
    expect(reviewed).toEqual(['核对中断写入', '连接模型运行任务'])
    expect(store.taskReceipts(task.id).find(receipt => receipt.id === 'uncertain-write')?.state).toBe('resolved_current')
    expect(await readFile(join(fixture.project, 'state.json'), 'utf8')).toBe('{"n":2}')
  })
  it('stops an active model request, clears approval capabilities, and preserves task records', async () => {
    const project = store.saveProject({ name: 'Fixture', directory: fixture.project, environment: 'dev' })
    let requested = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      requested = true
      return new Promise((_resolve, reject) => { options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) })
    })
    service.onChange(() => { for (const approval of service.approvals.list()) service.approvals.respond(approval.id, approval.fingerprint, true) })
    const task = await service.create({ projectId: project.id, prompt: '等待模型然后取消' })
    await service.start(task.id)
    await waitUntil(() => requested)
    await service.stop(task.id)
    expect(service.busy).toBe(false)
    expect(service.approvals.list()).toEqual([])
    expect(['stopped', 'interrupted']).toContain(store.getTask(task.id).state)
  }, 25000)
})
