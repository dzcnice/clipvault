import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (name: string) => name === 'home' ? homedir() : fixture.userData, getAppPath: () => resolve('.') }, Notification: Object.assign(class { show(): void {} }, { isSupported: () => false }) }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { HostManager } from './manager'
import * as clips from '../../db/clipboard-store'
import { ClipboardContentType } from '../../types'
import sharp from 'sharp'

let root = '', manager: HostManager
function reply(text: string, tool?: { name: string; input: unknown }): Response {
  const events = [
    { type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: `call-${Math.random()}`, name: tool.name, input: {} } : { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 10 } }, { type: 'message_stop' }
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
const rss = '<rss><channel><item><title>Electron safeStorage</title><link>https://www.electronjs.org/docs/latest/api/safe-storage</link><description>encryption helper</description></item></channel></rss>'
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) { if (Date.now() > deadline) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function script(steps: Array<(body: string) => Response>): { bodies: string[]; searches: string[] } {
  const bodies: string[] = [], searches: string[] = [], original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return original(url, options)
    if (String(url).startsWith('https://www.bing.com/')) { searches.push(new URL(String(url)).searchParams.get('q') ?? ''); return new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }) }
    const body = String(options?.body); bodies.push(body)
    return (steps.shift() ?? (() => reply('done')))(body)
  })
  return { bodies, searches }
}
const approvals: string[] = []
function approveAll(): void {
  manager.onChange(() => { for (const item of manager.approvals.list()) { approvals.push(item.operation); manager.respondApproval(item.id, item.fingerprint, true) } })
}
const toolNames = (body: string): string[] => (JSON.parse(body).tools ?? []).map((tool: { name: string }) => tool.name)

describe.skipIf(!isSqliteAvailable())('quick ask: built-in project, web access through the main process, one send consent per session', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-quick-')); fixture.userData = join(root, 'data')
    await mkdir(fixture.userData)
    createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!')
    const resource = store.saveResource({ name: 'Synthetic model', kind: 'model', endpoint: 'https://model.fixture', environment: 'dev', fields: [{ name: 'key', value: 'synthetic-model-key-only', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, endpoint: resource.endpoint, resourceId: resource.id, maxRequests: 10, maxMinutes: 2 })
    manager = new HostManager(); approvals.length = 0
  })
  afterEach(async () => { await manager.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })

  it('creates the built-in quick project on demand, searches the web and asks for send consent only once', async () => {
    const { bodies, searches } = script([
      () => reply('', { name: 'web_search', input: { queries: ['electron safeStorage'] } }),
      () => reply('FOUND'),
      () => reply('SECOND_TURN')
    ])
    const session = await manager.createSession({ projectId: store.QUICK_PROJECT_ID, permission: 'confirm' })
    expect(store.getProject(store.QUICK_PROJECT_ID)).toMatchObject({ name: '随手问', builtin: 'quick', web: true })
    expect(store.listProjects().some(project => project.id === store.QUICK_PROJECT_ID)).toBe(false)
    approveAll()
    await manager.prompt(session.id, { text: '查一下 electron safeStorage' }); await until(() => manager.list().find(item => item.id === session.id)?.state === 'idle' && !manager.busy)
    expect(toolNames(bodies[0]!)).toEqual(expect.arrayContaining(['web_search', 'web_fetch']))
    expect(searches).toEqual(['electron safeStorage'])
    expect(JSON.stringify(JSON.parse(bodies[1]!).messages.at(-1))).toContain('https://www.electronjs.org/docs/latest/api/safe-storage')
    expect(manager.events(session.id, -1).some(event => event.type === 'change' && event.text.includes('联网搜索'))).toBe(true)
    await manager.prompt(session.id, { text: '再说说用法' }); await until(() => manager.events(session.id, -1).some(event => event.type === 'assistant_message' && event.text === 'SECOND_TURN') && !manager.busy)
    expect(approvals.filter(item => item === '发送消息并使用项目上下文')).toHaveLength(1)
  }, 120_000)

  it('keeps web tools away from code projects that did not opt in, and refuses to edit the built-in project', async () => {
    const { bodies } = script([() => reply('NO_WEB')])
    const project = join(root, 'project'); await mkdir(project)
    const created = store.saveProject({ name: 'Code', directory: project, environment: 'dev' })
    const session = await manager.createSession({ projectId: created.id, permission: 'confirm' })
    approveAll()
    await manager.prompt(session.id, { text: 'hello' }); await until(() => manager.list().find(item => item.id === session.id)?.state === 'idle' && !manager.busy)
    expect(toolNames(bodies[0]!)).not.toContain('web_search')
    expect(() => store.saveProject({ id: store.QUICK_PROJECT_ID, name: 'x', directory: project })).toThrow('内置项目')
  }, 120_000)

  async function screenshot(): Promise<string> {
    const png = await sharp({ create: { width: 64, height: 40, channels: 3, background: '#2f6bf0' } }).png().toBuffer()
    const item = await clips.addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: `data:image/png;base64,${png.toString('base64')}`, sourceApp: 'Synthetic' })
    clips.setClipboardOcr(item!.id, 'done', 'TypeError: cannot read properties of undefined')
    return item!.id
  }
  it('sends a referenced screenshot to the model as an image together with its local OCR text', async () => {
    const { bodies } = script([() => reply('IMAGE_SEEN')])
    const id = await screenshot()
    const session = await manager.createSession({ projectId: store.QUICK_PROJECT_ID, permission: 'confirm' })
    approveAll()
    await manager.prompt(session.id, { text: '这张截图里是什么错误？', mentions: [{ kind: 'clipboard', id }] })
    await until(() => manager.events(session.id, -1).some(event => event.type === 'assistant_message' && event.text === 'IMAGE_SEEN') && !manager.busy)
    const content = JSON.parse(bodies[0]!).messages.at(-1).content as Array<{ type: string; text?: string; source?: { media_type: string; data: string } }>
    const picture = content.find(block => block.type === 'image')
    expect(picture?.source?.media_type).toBe('image/jpeg')
    expect(Buffer.from(picture!.source!.data, 'base64').subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect(content.filter(block => block.type === 'text').map(block => block.text).join('')).toContain('TypeError: cannot read properties of undefined')
    expect(JSON.stringify(manager.events(session.id, -1))).not.toContain(picture!.source!.data.slice(0, 40))
  }, 120_000)
  it('retries without the image when the model rejects images and says so in the session', async () => {
    const { bodies } = script([() => new Response('{"error":"image input not supported"}', { status: 400 }), () => reply('TEXT_ONLY')])
    const id = await screenshot()
    const session = await manager.createSession({ projectId: store.QUICK_PROJECT_ID, permission: 'confirm' })
    approveAll()
    await manager.prompt(session.id, { text: '看看', mentions: [{ kind: 'clipboard', id }] })
    await until(() => manager.events(session.id, -1).some(event => event.type === 'assistant_message' && event.text === 'TEXT_ONLY') && !manager.busy)
    expect(bodies[0]).toContain('"type":"image"'); expect(bodies[1]).not.toContain('"type":"image"')
    expect(bodies[1]).toContain('不支持识图'); expect(bodies[1]).toContain('TypeError')
    expect(manager.events(session.id, -1).some(event => event.type === 'change' && event.text.includes('不支持识图'))).toBe(true)
  }, 120_000)
  it('remembers a preference only after approval, refuses secrets, and puts "about me" into the system prompt', async () => {
    const { bodies } = script([
      () => reply('', { name: 'memory_remember', input: { note: '默认用中文回答，技术术语保留英文' } }),
      () => reply('', { name: 'memory_remember', input: { note: 'password: Synthetic-Pass-123' } }),
      () => reply('NOTED'),
      () => reply('SECOND')
    ])
    store.saveAboutMe('- 叫我主人')
    const session = await manager.createSession({ projectId: store.QUICK_PROJECT_ID, permission: 'confirm' })
    approveAll()
    await manager.prompt(session.id, { text: '以后都用中文' })
    await until(() => manager.events(session.id, -1).some(event => event.type === 'assistant_message' && event.text === 'NOTED') && !manager.busy)
    expect(approvals).toContain('记住关于你的信息')
    expect(store.getAboutMe()).toBe('- 叫我主人\n- 默认用中文回答，技术术语保留英文')
    expect(JSON.stringify(JSON.parse(bodies[2]!).messages.at(-1))).toContain('"is_error":true')
    expect(JSON.stringify(JSON.parse(bodies[0]!).system)).toContain('叫我主人')
    await manager.prompt(session.id, { text: '再来' })
    await until(() => manager.events(session.id, -1).some(event => event.type === 'assistant_message' && event.text === 'SECOND') && !manager.busy)
    expect(JSON.stringify(JSON.parse(bodies[3]!).system)).toContain('默认用中文回答')
  }, 120_000)
  it('pins, archives and permanently deletes a session with its events and receipts', async () => {
    script([() => reply('KEEP')])
    const session = await manager.createSession({ projectId: store.QUICK_PROJECT_ID, permission: 'confirm' })
    approveAll()
    await manager.prompt(session.id, { text: 'hello' }); await until(() => manager.list().find(item => item.id === session.id)?.state === 'idle' && !manager.busy)
    manager.setFlags(session.id, { pinned: true })
    expect(manager.list().find(item => item.id === session.id)).toMatchObject({ pinned: true })
    manager.setFlags(session.id, { archived: true })
    expect(manager.list().find(item => item.id === session.id)).toMatchObject({ archived: true, pinned: false })
    await manager.remove(session.id)
    expect(manager.list().some(item => item.id === session.id)).toBe(false)
    const db = getActiveIntegrationDb()
    for (const table of ['wb_sessions', 'wb_session_events', 'wb_session_receipts']) expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'wb_sessions' ? 'id' : 'session_id'} = ?`).get(session.id) as { n: number }).n, table).toBe(0)
  }, 120_000)
})
