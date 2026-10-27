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
import { HostManager } from '../harness-host/manager'

let root = '', project = '', manager: HostManager
function reply(text: string, tool?: { name: string; input: unknown }): Response {
  const events = [
    { type: 'message_start', message: { id: 'synthetic', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: tool ? { type: 'tool_use', id: `call-${Math.random()}`, name: tool.name, input: {} } : { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: tool ? { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } : { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 10 } }, { type: 'message_stop' }
  ]
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 30_000
  while (!check()) { if (Date.now() > deadline) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function script(steps: Array<(body: string) => Response>): string[] {
  const bodies: string[] = [], original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return original(url, options)
    const body = String(options?.body); bodies.push(body)
    return (steps.shift() ?? (() => reply('done')))(body)
  })
  return bodies
}
const approvals: string[] = []
function approveAll(): void {
  manager.onChange(() => { for (const item of manager.approvals.list()) { approvals.push(item.operation); manager.respondApproval(item.id, item.fingerprint, true) } })
}
const toolResult = (body: string): string => JSON.stringify(JSON.parse(body).messages.at(-1))

describe.skipIf(!isSqliteAvailable())('reminders: official schedule tools and time rules, delivered by the host', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-schedule-')); fixture.userData = join(root, 'data'); project = join(root, 'project')
    await mkdir(fixture.userData); await mkdir(project)
    createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!')
    const resource = store.saveResource({ name: 'Synthetic model', kind: 'model', endpoint: 'https://model.fixture', environment: 'dev', fields: [{ name: 'key', value: 'synthetic-model-key-only', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, endpoint: resource.endpoint, resourceId: resource.id, maxRequests: 10, maxMinutes: 2 })
    manager = new HostManager(); approvals.length = 0
  })
  afterEach(async () => { await manager.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })
  async function session(): Promise<string> {
    const created = store.saveProject({ name: 'Synthetic', directory: project, environment: 'dev' })
    return (await manager.createSession({ projectId: created.id, permission: 'confirm' })).id
  }

  it('creates a one-shot reminder with the official tool and delivers it into the same session behind the send approval', async () => {
    const bodies = script([
      () => reply('', { name: 'schedule_create', input: { title: '检查构建', prompt: '看看 CI 是否通过', after_seconds: 60 } }),
      () => reply('CREATED'),
      () => reply('REMINDER_HANDLED')
    ])
    const id = await session(); approveAll()
    await manager.prompt(id, { text: '一分钟后提醒我检查构建' }); await until(() => !manager.busy)
    const [reminder] = manager.context(id).schedules ?? []
    expect(reminder).toMatchObject({ title: '检查构建', prompt: '看看 CI 是否通过', kind: 'after', status: 'active' })
    expect(Date.parse(reminder!.scheduledAt) - Date.now()).toBeGreaterThan(30_000)
    expect(toolResult(bodies[1]!)).toContain('schedule-')
    await manager.schedules.fire(Date.now() + 120_000)
    await until(() => manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === 'REMINDER_HANDLED'))
    await until(() => !manager.busy)
    expect(bodies[2]).toContain('看看 CI 是否通过')
    expect(approvals.filter(item => item === '发送消息并使用项目上下文')).toHaveLength(2)
    expect(manager.context(id).schedules?.[0]).toMatchObject({ status: 'inactive' })
    expect(manager.context(id).schedules?.[0]?.lastDeliveredAt).toBeTruthy()
  }, 90_000)

  it('rejects rules the official builders refuse and lets the user delete a reminder', async () => {
    const bodies = script([
      () => reply('', { name: 'schedule_create', input: { title: '太频繁', prompt: 'ping', every_seconds: 10 } }),
      () => reply('', { name: 'schedule_create', input: { title: '每日回顾', prompt: '回顾今天的改动', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } } }),
      () => reply('OK')
    ])
    const id = await session(); approveAll()
    await manager.prompt(id, { text: '设置提醒' }); await until(() => !manager.busy)
    expect(toolResult(bodies[1]!)).toContain('frequency_too_high')
    const schedules = manager.context(id).schedules ?? []
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toMatchObject({ title: '每日回顾', kind: 'daily', status: 'active' })
    manager.removeSchedule(id, schedules[0]!.id)
    expect(manager.context(id).schedules).toHaveLength(0)
  }, 90_000)

  it('delivers only the latest missed occurrence of a recurring reminder and advances to the next target', async () => {
    script([
      () => reply('', { name: 'schedule_create', input: { title: '每日回顾', prompt: '回顾今天的改动', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } } }),
      () => reply('OK'), () => reply('DAILY_HANDLED')
    ])
    const id = await session(); approveAll()
    await manager.prompt(id, { text: '每天九点提醒我回顾' }); await until(() => !manager.busy)
    const first = Date.parse(manager.context(id).schedules![0]!.scheduledAt)
    const later = first + 3 * 86_400_000 + 3_600_000
    await manager.schedules.fire(later)
    await until(() => manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === 'DAILY_HANDLED'))
    await until(() => !manager.busy)
    const reminders = manager.events(id, -1).filter(event => event.type === 'user_message' && event.text.includes('回顾今天的改动'))
    expect(reminders).toHaveLength(1)
    const next = manager.context(id).schedules![0]!
    expect(next.status).toBe('active')
    expect(Date.parse(next.scheduledAt)).toBeGreaterThan(later)
    expect(Date.parse(next.scheduledAt) - later).toBeLessThanOrEqual(86_400_000)
  }, 90_000)
})
