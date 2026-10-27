import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, method: string, payload: unknown) => Promise<{ success: boolean; error?: string; data?: unknown }>>(),
  mutate: vi.fn(), task: { id: 'legacy', title: 'Synthetic legacy', prompt: 'Original input' }
}))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, callback: never) => fixture.handlers.set(name, callback) }, dialog: {}, shell: {}, clipboard: {} }))
vi.mock('./utils', () => ({ wrapUnlockedHandler: (handler: unknown) => handler }))
vi.mock('../workbench/service', () => ({ getWorkbench: () => ({ onChange: () => () => {}, create: fixture.mutate, followUp: fixture.mutate, start: fixture.mutate, stop: fixture.mutate, accept: fixture.mutate, approvals: { respond: fixture.mutate } }), workbenchBusy: () => false }))
vi.mock('../../db/workbench-store', () => ({ listTasks: () => [fixture.task], listProjects: () => [], listResources: () => [], getTaskDetail: () => ({ task: fixture.task, runs: [], events: [], changes: [] }) }))
vi.mock('../../db/inbox-store', () => ({ onInboxChanged: () => () => {} }))
vi.mock('../workbench/redaction', () => ({ outboundRedact: (text: string) => ({ text }), redactOutboundValue: (value: unknown) => value }))
vi.mock('../workbench/bridge', () => ({}))
vi.mock('../clipboard/monitor', () => ({}))
vi.mock('../backup-merge', () => ({}))
vi.mock('../workbench/login', () => ({}))
vi.mock('../workbench/daily', () => ({}))
vi.mock('../storage/protect-images', () => ({}))
vi.mock('../resources/intake', () => ({}))
vi.mock('../harness-host/manager', () => ({}))
vi.mock('../clipboard/key-intercept', () => ({}))
vi.mock('../../db/clipboard-store', () => ({}))
vi.mock('../resources/sequence', () => ({}))
vi.mock('../prefs', () => ({}))
vi.mock('../clipboard/suggestions', () => ({}))
vi.mock('../clipboard/ai', () => ({}))
vi.mock('../resources/health', () => ({}))
import { registerWorkbenchHandlers } from './workbench-handlers'

beforeEach(() => {
  vi.clearAllMocks()
  registerWorkbenchHandlers({ once: vi.fn(), isDestroyed: () => false, webContents: { send: vi.fn() } } as never)
})
describe('legacy IPC is read-only independently of renderer controls', () => {
  it.each(['createTask', 'followUp', 'start', 'stop', 'accept', 'approve'])('refuses a direct %s request without invoking the old executor', async method => {
    const result = await fixture.handlers.get('workbench:call')!({}, method, { id: 'legacy', allowed: true })
    expect(result.success).toBe(false); expect(result.error).toContain('仅供查看')
    expect(fixture.mutate).not.toHaveBeenCalled()
  })
  it('keeps original task inputs accessible through read operations', async () => {
    const handler = fixture.handlers.get('workbench:call')!
    expect((await handler({}, 'quickIndex', null)).data).toMatchObject({ tasks: [fixture.task] })
    expect((await handler({}, 'task', 'legacy')).data).toMatchObject({ task: fixture.task })
    expect(fixture.mutate).not.toHaveBeenCalled()
  })
})
