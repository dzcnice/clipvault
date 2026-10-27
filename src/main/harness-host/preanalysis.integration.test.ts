import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (name: string) => name === 'home' ? homedir() : fixture.userData, getAppPath: () => resolve('.') } }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { HostManager, PREANALYSIS_LIMITS } from './manager'
import { addInbox, getInbox } from '../../db/inbox-store'
import { addClipboardItem } from '../../db/clipboard-store'
import { ClipboardContentType } from '../../types'
import { sessionReceipts } from '../../db/harness-session-store'

let root = '', project = '', manager: HostManager
function reply(text: string, tool?: { name: string; input: unknown }): Response {
  const events = [
    { type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: 'call-synthetic', name: tool.name, input: {} } : { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 10 } }, { type: 'message_stop' }
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000
  while (!check()) { if (Date.now() > deadline) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function modelStub(respond: (body: string) => Response): string[] {
  const bodies: string[] = [], original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return original(url, options)
    const body = String(options?.body); bodies.push(body)
    return respond(body)
  })
  return bodies
}
async function errorSuggestion(projectId: string, text = "TypeError: Cannot read properties of undefined (reading 'token')\n    at login (src/login.ts:3:10)"): Promise<string> {
  const clip = (await addClipboardItem({ type: ClipboardContentType.TEXT, content: text }))!
  return addInbox({ type: 'error_fix', sourceId: clip.id, projectId, data: { title: '这段报错可以在项目中定位', reason: '堆栈格式', preview: text.slice(0, 120), prompt: '定位并修复', ids: [clip.id] } })!
}

describe.skipIf(!isSqliteAvailable())('L2 background read-only pre-analysis', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-preanalysis-')); fixture.userData = join(root, 'data'); project = join(root, 'project')
    await mkdir(fixture.userData); await mkdir(join(project, 'src'), { recursive: true })
    await writeFile(join(project, 'src', 'login.ts'), 'export function login(input) {\n  return input.session.token\n}\n')
    createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!')
    const resource = store.saveResource({ name: 'Synthetic model', kind: 'model', endpoint: 'https://model.fixture', environment: 'dev', fields: [{ name: 'key', value: 'synthetic-model-key-only', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, endpoint: resource.endpoint, resourceId: resource.id, maxRequests: 30, maxMinutes: 10 })
    manager = new HostManager()
  })
  afterEach(async () => { await manager.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })

  it('does nothing unless the project explicitly opted in', async () => {
    const bodies = modelStub(() => reply('should not run'))
    const off = store.saveProject({ name: 'Off', directory: project, environment: 'dev' })
    const inboxId = await errorSuggestion(off.id)
    expect(await manager.preanalyze(inboxId)).toBe(false)
    expect(getInbox(inboxId)?.data.analysis).toBeUndefined()
    expect(bodies).toHaveLength(0)
    expect(manager.busy).toBe(false)
  })

  it('runs hidden, read-only and without a per-turn approval, then files the conclusion into the inbox', async () => {
    let calls = 0
    const bodies = modelStub(() => ++calls === 1
      ? reply('', { name: 'workbench_write_file', input: { path: 'src/login.ts', content: 'tampered', expectedHash: '' } })
      : calls === 2 ? reply('', { name: 'workbench_read_file', input: { path: 'src/login.ts' } })
        : reply('已确认：login.ts 第 2 行直接读取 input.session.token；推测调用方未传 session。'))
    const on = store.saveProject({ name: 'On', directory: project, environment: 'dev', preanalysis: true })
    const inboxId = await errorSuggestion(on.id)
    expect(await manager.preanalyze(inboxId)).toBe(true)
    await until(() => getInbox(inboxId)?.data.analysis?.state === 'done' || getInbox(inboxId)?.data.analysis?.state === 'failed')
    expect(getInbox(inboxId)?.data.analysis).toMatchObject({ state: 'done' })
    expect(getInbox(inboxId)?.data.analysis?.text).toContain('input.session.token')
    expect(manager.approvals.list()).toHaveLength(0)
    expect(manager.list()).toHaveLength(0)
    await expect((await import('node:fs/promises')).readFile(join(project, 'src', 'login.ts'), 'utf8')).resolves.toContain('input.session.token')
    const first = JSON.parse(bodies[0]!)
    expect(JSON.stringify(first)).toContain('只读分析')
    expect(bodies.join('')).toMatch(/Plan mode is read-only|计划模式和子 Agent 仅可只读分析/)
    const consent = (manager as unknown as { all: () => Array<{ id: string; hidden?: string }> }).all().find(item => item.hidden === 'preanalysis')!
    expect(sessionReceipts(consent.id).some(item => item.operation === 'preanalysis_consent' && item.state === 'project_setting')).toBe(true)
    expect(bodies.length).toBeLessThanOrEqual(PREANALYSIS_LIMITS.maxRequests)
  })

  it('skips content containing a blocking secret and enforces the daily cap', async () => {
    const bodies = modelStub(() => reply('done'))
    const on = store.saveProject({ name: 'On', directory: project, environment: 'dev', preanalysis: true })
    const secret = await errorSuggestion(on.id, 'Error: auth failed with key sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z')
    expect(await manager.preanalyze(secret)).toBe(false)
    const queued: string[] = []
    for (let index = 0; index < PREANALYSIS_LIMITS.perProjectPerDay + 1; index++) {
      const id = await errorSuggestion(on.id, `TypeError: synthetic failure ${index}\n    at run (src/login.ts:${index + 1}:1)`)
      if (await manager.preanalyze(id)) queued.push(id)
    }
    expect(queued).toHaveLength(PREANALYSIS_LIMITS.perProjectPerDay)
    await until(() => !manager.busy)
    expect(bodies.length).toBeGreaterThan(0)
  }, 120_000)
})
