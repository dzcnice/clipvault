import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '', project: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (name: string) => name === 'home' ? homedir() : fixture.userData, getAppPath: () => resolve('.') } }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../workbench/local-check', async original => {
  const actual = await original<typeof import('../workbench/local-check')>()
  return { ...actual, runLocalCheck: vi.fn(actual.runLocalCheck) }
})
vi.mock('../workbench/pwsh', () => ({ runOfficialPwsh: vi.fn() }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { readEncryptedSession } from '../workbench/session-store'
import { HostManager } from './manager'
import { runLocalCheck } from '../workbench/local-check'
import { runOfficialPwsh } from '../workbench/pwsh'
import { z } from 'zod'
import { ProjectFiles } from '../workbench/files'
import { getWorkbench } from '../workbench/service'
import { sessionReceipts, sessionFamilyOperation } from '../../db/harness-session-store'
import { searchHistory } from './history'
import { addClipboardItem } from '../../db/clipboard-store'
import { ClipboardContentType } from '../../types'

let root = '', manager: HostManager
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
  const deadline = Date.now() + 15_000
  while (!check()) { if (Date.now() > deadline) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
function modelStub(respond: (body: string, signal?: AbortSignal | null) => Promise<Response> | Response): string[] {
  const bodies: string[] = [], original = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    if (String(url).startsWith('http://127.0.0.1:')) return original(url, options)
    expect(String(url)).toBe(store.getModelConfig().protocol === 'openai-chat' ? 'https://model.fixture/chat/completions' : 'https://model.fixture/v1/messages')
    const body = String(options?.body); bodies.push(body)
    return respond(body, options?.signal)
  })
  return bodies
}
function approve(allowWrites = true): void {
  manager.onChange(() => {
    for (const item of manager.approvals.list()) manager.respondApproval(item.id, item.fingerprint, allowWrites || item.operation !== '写入文件')
    for (const session of manager.list()) for (const question of manager.questions.list(session.id)) manager.answerQuestion(question.id, { answers: question.questions.map(item => ({ id: item.id, selected: [], custom: 'synthetic-answer' })) })
  })
}
describe.skipIf(!isSqliteAvailable())('Harness-native session lifecycle with official Host', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-native-host-')); fixture.userData = join(root, 'data'); fixture.project = join(root, 'project')
    await mkdir(fixture.userData); await mkdir(fixture.project)
    createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!')
    const resource = store.saveResource({ name: 'Synthetic model', kind: 'model', endpoint: 'https://model.fixture', environment: 'dev', fields: [{ name: 'key', value: 'synthetic-model-key-only', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, endpoint: resource.endpoint, resourceId: resource.id, maxRequests: 10, maxMinutes: 1 })
    manager = new HostManager()
  })
  afterEach(async () => { await manager.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })
  async function session(directory = fixture.project): Promise<string> {
    const project = store.saveProject({ name: 'Synthetic', directory, environment: 'dev' })
    return (await manager.createSession({ projectId: project.id, permission: 'confirm' })).id
  }
  it('uses official questions and resumes encrypted multi-turn history in a new manager', async () => {
    let calls = 0
    const bodies = modelStub(() => ++calls === 1 ? reply('', { name: 'ask_user_question', input: { questions: [{ id: 'choice', question: 'Synthetic question?' }] } }) : reply('NATIVE_SESSION_OK'))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Start synthetic conversation' }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle')
    expect(bodies.join('')).toContain('synthetic-answer')
    expect(manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === 'NATIVE_SESSION_OK')).toBe(true)
    const before = readEncryptedSession(id)!.events.length
    await manager.shutdown(); manager = new HostManager(); approve()
    expect(manager.events(id, -1).some(event => event.type === 'question' && event.question.state === 'answered')).toBe(true)
    expect(manager.events(id, -1).some(event => event.type === 'approval' && event.approval.state === 'allowed')).toBe(true)
    await manager.prompt(id, { text: 'Continue synthetic conversation' }); await until(() => !manager.busy)
    expect(bodies.at(-1)).toContain('Start synthetic conversation')
    expect(readEncryptedSession(id)!.events.length).toBeGreaterThan(before)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT event FROM wb_session_events').all())).not.toContain('NATIVE_SESSION_OK')
  }, 30_000)
  it('preserves approved writes after stop and records failed model turns as failed', async () => {
    let calls = 0, waiting = false
    modelStub((_body, signal) => ++calls === 1 ? reply('', { name: 'workbench_write_file', input: { path: 'approved.json', content: '{"ok":true}', expectedHash: '' } }) : new Promise((_resolve, reject) => { waiting = true; signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }) }))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Write the approved fixture, then wait' }); await until(() => waiting)
    await manager.stop(id)
    expect(await readFile(join(fixture.project, 'approved.json'), 'utf8')).toBe('{"ok":true}')
    vi.restoreAllMocks()
    modelStub(() => new Response('synthetic failure', { status: 400 }))
    await manager.prompt(id, { text: 'Resume after stop' }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('failed')
  }, 30_000)
  it('runs the official question through an OpenAI-compatible streaming provider', async () => {
    store.saveModelConfig({ ...store.getModelConfig(), protocol: 'openai-chat' })
    let calls = 0
    const bodies = modelStub(() => {
      const question = ++calls === 1
      const data = { id: 'openai-fixture', choices: [{ delta: question ? { tool_calls: [{ index: 0, id: 'question-fixture', function: { name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'choice', question: 'Which option?' }] }) } }] } : { content: 'OPENAI_NATIVE_OK' }, finish_reason: question ? 'tool_calls' : 'stop' }] }
      return new Response(`data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    })
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Ask using the compatible protocol' }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle')
    expect(bodies.join('')).toContain('synthetic-answer')
    expect(manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === 'OPENAI_NATIVE_OK')).toBe(true)
  }, 30_000)
  it('denies exact file writes and redacts an unselected resource in file results', async () => {
    const secret = 'ordinary-password-synthetic-not-selected'
    store.saveResource({ name: 'Unselected', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: secret, secret: true }] })
    await writeFile(join(fixture.project, 'notes.txt'), `configuration: ${secret}`)
    let calls = 0
    const bodies = modelStub(() => {
      calls++
      if (calls === 1) return reply('', { name: 'workbench_read_file', input: { path: 'notes.txt' } })
      if (calls === 2) return reply('', { name: 'workbench_write_file', input: { path: 'new.json', content: '{}', expectedHash: '' } })
      return reply('WRITE_REFUSED')
    })
    const id = await session(); approve(false)
    await manager.prompt(id, { text: 'Read notes, propose a new JSON file' }); await until(() => !manager.busy)
    await expect(readFile(join(fixture.project, 'new.json'))).rejects.toThrow()
    expect(bodies.join('')).not.toContain(secret)
    expect(bodies.join('')).toContain('已隐藏敏感字段')
    await expect(manager.prompt(id, { text: `Use ${secret}` })).rejects.toThrow('尚未发送')
  }, 30_000)
  it('runs different directories in parallel, queues the same directory, and cancels pending approvals', async () => {
    const other = join(root, 'other'); await mkdir(other)
    const a = await session(), b = await session(), c = await session(other)
    const first = manager.prompt(a, { text: 'a' }).catch(() => {})
    await until(() => manager.approvals.list().length === 1)
    const waiting = [first, manager.prompt(b, { text: 'b' }).catch(() => {}), manager.prompt(c, { text: 'c' }).catch(() => {})]
    await until(() => manager.approvals.list().length === 2)
    expect(manager.list().find(item => item.id === b)?.state).toBe('queued')
    await manager.shutdown(); await Promise.all(waiting)
    expect(manager.busy).toBe(false); expect(manager.approvals.list()).toEqual([])
    expect(manager.list().every(item => item.state === 'stopped')).toBe(true)
  }, 30_000)
  it('stops an active model call within ten seconds', async () => {
    let started = false
    modelStub((_body, signal) => new Promise((_resolve, reject) => { started = true; signal?.addEventListener('abort', () => reject(new Error('synthetic abort')), { once: true }) }))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Wait for stop' }); await until(() => started)
    const before = Date.now(); await manager.stop(id)
    expect(Date.now() - before).toBeLessThan(10_000)
    expect(manager.list()[0]?.state).toBe('stopped'); expect(manager.busy).toBe(false)
  }, 30_000)
  it('prewarms an actual Host without model traffic, then uses it and drains before locking', async () => {
    const bodies = modelStub(() => reply('PREWARM_OK'))
    const id = await session()
    await manager.prewarm(id)
    expect(manager.busy).toBe(true)
    expect(bodies).toHaveLength(0)
    expect(readEncryptedSession(id)).toBeNull()
    approve()
    await manager.prompt(id, { text: 'Use prewarmed Host' }); await until(() => !manager.busy)
    expect(bodies).toHaveLength(1)
    expect(manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === 'PREWARM_OK')).toBe(true)
    await manager.prewarm(id); await manager.suspend(); vault.lockVault()
    expect(manager.busy).toBe(false)
    expect(vault.unlockVault('Synthetic-Vault-Password!')).toBe(true)
    expect(manager.list()[0]?.id).toBe(id)
  }, 30_000)
  it('redacts an unselected resource from command output before the next model request', async () => {
    const secret = 'unselected-command-result-canary'
    store.saveResource({ name: 'Other service', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: secret, secret: true }] })
    await writeFile(join(fixture.project, 'package.json'), '{"name":"synthetic-check"}')
    vi.mocked(runLocalCheck).mockResolvedValueOnce({ exitCode: 0, output: `Result: ${secret}`, engine: 'synthetic-local-check' })
    let calls = 0
    const bodies = modelStub(() => ++calls === 1 ? reply('', { name: 'workbench_run_check', input: { command: 'npm test' } }) : reply('CHECK_COMPLETE'))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Run the fixture check' }); await until(() => !manager.busy)
    expect(runLocalCheck).toHaveBeenCalled()
    expect(bodies.join('')).not.toContain(secret)
    expect(bodies.join('')).toContain('已隐藏敏感字段')
  }, 30_000)
  it('utility Host uses new tool-free in-memory sessions and validates structured output', async () => {
    let calls = 0
    const bodies = modelStub(() => reply(JSON.stringify(++calls < 3 ? { name: 'UTILITY_SYNTHETIC_RESULT' } : { unexpected: true })))
    const request = { purpose: 'resource_structure' as const, prompt: 'Return {"name":string}', schema: z.object({ name: z.string() }), timeoutMs: 15_000 }
    expect(await manager.structured(request)).toEqual({ name: 'UTILITY_SYNTHETIC_RESULT' })
    expect(await manager.structured(request)).toEqual({ name: 'UTILITY_SYNTHETIC_RESULT' })
    expect(JSON.parse(bodies[0]!).tools ?? []).toEqual([])
    expect(bodies[1]).not.toContain('UTILITY_SYNTHETIC_RESULT')
    expect(getActiveIntegrationDb().prepare('SELECT COUNT(*) AS n FROM wb_sessions').get()).toEqual({ n: 0 })
    await expect(manager.structured(request)).rejects.toThrow('模型暂不可用')
    expect(manager.busy).toBe(false)
  }, 45_000)
  it('preserves all clean v1.1 code through prompts, streams, read/write tools and local snapshots', async () => {
    const clean = (await readFile(resolve('src/main/workbench/__fixtures__/secret-scan/clean.txt'), 'utf8')).trimEnd()
    await writeFile(join(fixture.project, 'source.txt'), clean)
    await writeFile(join(fixture.project, 'package.json'), '{"name":"synthetic-clean-code"}')
    await writeFile(join(fixture.project, 'check.cjs'), "const {readFileSync}=require('node:fs'); require('node:assert/strict').ok(readFileSync('source.txt','utf8').includes('password: string'))")
    let calls = 0
    const bodies = modelStub(() => {
      if (++calls === 1) return reply('', { name: 'workbench_read_file', input: { path: 'source.txt' } })
      if (calls === 2) return reply('', { name: 'workbench_write_file', input: { path: 'copied.txt', content: clean, expectedHash: '' } })
      if (calls === 3) return reply('', { name: 'workbench_run_check', input: { command: 'node --test check.cjs' } })
      return reply(clean)
    })
    const id = await session(); approve()
    await manager.prompt(id, { text: clean }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle')
    expect(await readFile(join(fixture.project, 'copied.txt'), 'utf8')).toBe(clean)
    const results = JSON.parse(bodies[1]!).messages.flatMap((message: { content: Array<{ type: string; content?: string }> }) => message.content).filter((block: { type: string }) => block.type === 'tool_result')
    expect(JSON.stringify(results)).toContain(JSON.stringify(JSON.stringify(clean).slice(1, -1)).slice(1, -1))
    expect(sessionReceipts(id).some(receipt => receipt.operation === 'run_check' && receipt.state === 'passed')).toBe(true)
    expect(manager.events(id, -1).some(event => event.type === 'assistant_message' && event.text === clean)).toBe(true)
    const snapshot = join(root, 'snapshot'); await mkdir(snapshot)
    await new ProjectFiles(fixture.project).snapshot(snapshot, [])
    expect(await readFile(join(snapshot, 'source.txt'), 'utf8')).toBe(clean)
  }, 30_000)
  it('requires a one-message opt-in for possible literals and never bypasses a known-secret block', async () => {
    const possible = (await readFile(resolve('src/main/workbench/__fixtures__/secret-scan/replace-only.txt'), 'utf8')).trimEnd()
    const bodies = modelStub(() => reply('ACKNOWLEDGED'))
    const id = await session(); approve()
    await expect(manager.prompt(id, { text: possible })).rejects.toThrow('POSSIBLE_SECRET')
    expect(bodies).toHaveLength(0)
    await manager.prompt(id, { text: possible, allowPossibleSecret: true }); await until(() => !manager.busy)
    expect(JSON.parse(bodies[0]!).messages.some((message: { content: Array<{ text: string }> }) => message.content.some(block => block.text === possible))).toBe(true)
    await expect(manager.prompt(id, { text: 'synthetic-model-key-only', allowPossibleSecret: true })).rejects.toThrow('尚未发送')
  }, 30_000)
  it('admits encrypted attachment references through the official attachment service and resumes them', async () => {
    const path = join(fixture.project, 'attached.txt'); await writeFile(path, 'SYNTHETIC_ATTACHMENT_CANARY')
    const attachments = await getWorkbench().prepareAttachments([path])
    const bodies = modelStub(() => reply('ATTACHMENT_RECEIVED'))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Read this selected attachment', attachmentIds: attachments.map(item => item.id) }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle')
    expect(bodies.join('')).toContain('SYNTHETIC_ATTACHMENT_CANARY')
    const receipt = sessionReceipts(id).find(item => item.operation === 'attachment')!
    expect(receipt.data.verifiedAt).toBeGreaterThan(0)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT * FROM wb_session_receipts').all())).not.toContain('SYNTHETIC_ATTACHMENT_CANARY')
    await manager.shutdown(); manager = new HostManager(); approve()
    await manager.prompt(id, { text: 'Continue using the admitted snapshot' }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle'); expect(bodies.at(-1)).toContain('SYNTHETIC_ATTACHMENT_CANARY')
  }, 30_000)
  it('uses native data tools, binds mentions, and only applies a resource proposal after a version-bound decision', async () => {
    const clip = (await addClipboardItem({ type: ClipboardContentType.TEXT, content: 'SYNTHETIC_CLIP_CONTEXT' }))!
    const resource = store.saveResource({ name: 'Synthetic account', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: 'synthetic-data-tool-secret', secret: true }] })
    const id = await session(); approve(); let calls = 0
    const bodies = modelStub(() => {
      if (++calls === 1) return reply('', { name: 'resource_list', input: {} })
      if (calls === 2) return reply('', { name: 'clipboard_read', input: { id: clip.id } })
      if (calls === 3) return reply('', { name: 'resource_propose', input: { resourceId: resource.id, patch: { purpose: '经确认的用途' } } })
      return reply('PROPOSAL_READY')
    })
    await manager.prompt(id, { text: 'Organize the selected resource metadata', mentions: [{ kind: 'clipboard', id: clip.id }, { kind: 'resource', id: resource.id }] }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle')
    expect(bodies.join('')).toContain('SYNTHETIC_CLIP_CONTEXT'); expect(bodies.join('')).not.toContain('synthetic-data-tool-secret')
    expect(getActiveIntegrationDb().prepare('SELECT COUNT(*) AS n FROM wb_session_clipboard_refs WHERE clipboard_id=?').get(clip.id)).toEqual({ n: 1 })
    expect(store.getResource(resource.id).purpose).toBe('')
    const proposal = sessionReceipts(id).find(item => item.operation === 'resource_proposal')!
    expect(proposal).toBeDefined()
    await manager.shutdown(); manager = new HostManager()
    expect(manager.events(id, -1).some(event => event.type === 'proposal' && event.state === 'pending')).toBe(true)
    manager.respondProposal(id, proposal.id, true)
    expect(store.getResource(resource.id).purpose).toBe('经确认的用途')
    expect(store.readResourceField(resource.id, 'password')).toBe('synthetic-data-tool-secret')
    expect(() => manager.respondProposal(id, proposal.id, true)).toThrow('失效')
  }, 30_000)
  it('persists official goals and todos and replays them without starting a model call', async () => {
    const id = await session(); approve(); let calls = 0
    modelStub(async () => {
      if (++calls === 1) return reply('', { name: 'create_goal', input: { objective: 'Synthetic explicit objective', max_goal_rounds: 2 } })
      if (calls === 2) return reply('', { name: 'todo_write', input: { todos: [{ content: 'Inspect synthetic fixture', status: 'completed' }] } })
      if (calls === 3) {
        await until(() => !!readEncryptedSession(id)?.events.some(event => event.type === 'goal/change'))
        const data = readEncryptedSession(id)!.events.find(event => event.type === 'goal/change')!.data as { goal: { id: string; revision: number } }
        return reply('', { name: 'update_goal', input: { goal_id: data.goal.id, revision: data.goal.revision, action: 'complete' } })
      }
      return reply('GOAL_COMPLETE_SYNTHETIC')
    })
    await manager.prompt(id, { text: 'Create a goal, record a todo and complete the synthetic objective' }); await until(() => !manager.busy)
    expect(manager.context(id).goal).toMatchObject({ objective: 'Synthetic explicit objective', phase: 'complete' })
    expect(manager.context(id).todos).toEqual([{ content: 'Inspect synthetic fixture', status: 'completed' }])
    await manager.shutdown(); manager = new HostManager()
    expect(manager.context(id).goal?.phase).toBe('complete'); expect(calls).toBe(4)
  }, 30_000)
  it('denies writes in official plan mode and shows the full plan before allowing exit', async () => {
    const id = await session(); await manager.setPlanMode(id, true); let calls = 0, reviewed = false
    manager.onChange(() => {
      for (const item of manager.approvals.list()) manager.respondApproval(item.id, item.fingerprint, true)
      for (const question of manager.questions.list(id)) {
        expect(question.questions[0]?.detail).toBe('# Synthetic plan\nWrite the approved fixture only.'); reviewed = true
        manager.answerQuestion(question.id, { answers: question.questions.map(item => ({ id: item.id, selected: ['Approve'], custom: '' })) })
      }
    })
    modelStub(() => {
      if (++calls === 1) return reply('', { name: 'workbench_write_file', input: { path: 'plan-blocked.json', content: '{}', expectedHash: '' } })
      if (calls === 2) return reply('', { name: 'exit_plan_mode', input: { plan: '# Synthetic plan\nWrite the approved fixture only.' } })
      if (calls === 3) return reply('', { name: 'workbench_write_file', input: { path: 'plan-approved.json', content: '{}', expectedHash: '' } })
      return reply('PLAN_REVIEW_COMPLETE')
    })
    await manager.prompt(id, { text: 'Plan the fixture work first' }); await until(() => !manager.busy)
    expect(reviewed).toBe(true); expect(manager.context(id).planMode).toBe(false)
    await expect(readFile(join(fixture.project, 'plan-blocked.json'))).rejects.toThrow()
    expect(await readFile(join(fixture.project, 'plan-approved.json'), 'utf8')).toBe('{}')
  }, 30_000)
  it('runs an official read-only child, denies child writes and encrypts its separate session', async () => {
    const id = await session(); approve(); let parentCalls = 0, childCalls = 0
    modelStub(body => {
      const parsed = JSON.parse(body) as { messages: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }
      const first = parsed.messages.find(message => message.role === 'user')?.content.map(block => block.text ?? '').join('') ?? ''
      if (first.includes('CHILD_SCOPE_SYNTHETIC')) {
        if (++childCalls === 1) return reply('', { name: 'workbench_write_file', input: { path: 'child-denied.json', content: '{}', expectedHash: '' } })
        if (childCalls === 2) return reply('', { name: 'send_message', input: { agent_id: id, message: 'CHILD_FINDING_SYNTHETIC' } })
        return reply('CHILD_COMPLETE_SYNTHETIC')
      }
      if (++parentCalls === 1) return reply('', { name: 'subagent', input: { description: 'Synthetic read only analysis', prompt: 'CHILD_SCOPE_SYNTHETIC: analyze only and report to parent' } })
      return reply('PARENT_COMPLETE_SYNTHETIC')
    })
    await manager.prompt(id, { text: 'Delegate a synthetic read-only analysis' }); await until(() => !manager.busy)
    const child = sessionReceipts(id).find(item => item.operation === 'child_session')
    expect(child).toBeDefined(); expect(childCalls, JSON.stringify({ parentCalls, child: readEncryptedSession(child!.id)?.events.map(event => ({ type: event.type, data: ['turn/end', 'error'].includes(event.type) ? event.data : undefined })), errors: manager.events(id, -1).filter(event => event.type === 'error') })).toBeGreaterThanOrEqual(2)
    expect(readEncryptedSession(child!.id)?.events.some(event => event.type === 'assistant/message')).toBe(true)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT event FROM wb_session_events').all())).not.toContain('CHILD_SCOPE_SYNTHETIC')
    await expect(readFile(join(fixture.project, 'child-denied.json'))).rejects.toThrow()
    expect(manager.list()).toHaveLength(1)
    expect(() => sessionFamilyOperation('other-root', { id: child!.id, operation: 'read' })).toThrow('越界')
    expect(() => sessionFamilyOperation(id, { id: 'forged-child', operation: 'create', header: { ...readEncryptedSession(child!.id)!.header, id: 'forged-child', parentSession: 'other-root' } })).toThrow('越界')
  }, 30_000)
  it('searches encrypted history with the official memory-only FTS index and no model requests', async () => {
    const id = await session(); approve()
    const bodies = modelStub(() => reply('HISTORY_LOCAL_CANARY 中文合成记录'))
    await manager.prompt(id, { text: 'Record searchable synthetic history' }); await until(() => !manager.busy)
    const before = bodies.length, result = await searchHistory('HISTORY_LOCAL_CANARY')
    expect(result.items.map(item => item.id)).toEqual([id]); expect(result.searched).toBe(1)
    expect(result.items[0]?.snippet).toContain('HISTORY_LOCAL_CANARY')
    expect((await searchHistory('not-existing OR *')).items).toEqual([])
    expect(bodies).toHaveLength(before)
    vault.lockVault(); await expect(searchHistory('HISTORY_LOCAL_CANARY')).rejects.toThrow('解锁')
  }, 30_000)
  it('keeps official PowerShell behind exact approval and denies escalation, background and plan-mode execution', async () => {
    const id = await session(); let calls = 0, approvedCommands = 0
    vi.mocked(runOfficialPwsh).mockResolvedValue({ exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: 1000, stdout: { text: 'SYNTHETIC_PWSH_OUTPUT', truncated: false }, stderr: { text: '', truncated: false }, sandbox: { mode: 'workspace-write', enforcement: 'partial', denied: false } })
    manager.onChange(() => { for (const item of manager.approvals.list()) {
      if (item.operation === '运行受限 PowerShell') { expect(item.description).toContain('Write-Output'); expect(item.description).toContain('ACL 不隔离读取与网络'); approvedCommands++ }
      manager.respondApproval(item.id, item.fingerprint, true)
    } })
    modelStub(() => {
      const base = { description: 'Synthetic command', command: "Write-Output 'SYNTHETIC_PWSH_OUTPUT'", timeoutMs: 1000 }
      if (++calls === 1) return reply('', { name: 'pwsh', input: { ...base, sandbox_permissions: 'danger-full-access', justification: 'synthetic forbidden escalation' } })
      if (calls === 2) return reply('', { name: 'pwsh', input: { ...base, run_in_background: true } })
      if (calls === 3) return reply('', { name: 'pwsh', input: base })
      return reply('PWSH_APPROVAL_COMPLETE')
    })
    await manager.prompt(id, { text: 'Run only the approved synthetic command' }); await until(() => !manager.busy)
    expect(manager.list()[0]?.state).toBe('idle'); expect(approvedCommands).toBe(1); expect(runOfficialPwsh).toHaveBeenCalledTimes(1)
    await manager.setPlanMode(id, true); calls = 2
    await manager.prompt(id, { text: 'Analyze only while in plan mode' }); await until(() => !manager.busy)
    expect(approvedCommands).toBe(1); expect(runOfficialPwsh).toHaveBeenCalledTimes(1)
  }, 30_000)
  it('can propose a metadata-only note and cancels outstanding proposals when stopped', async () => {
    let calls = 0
    modelStub(() => ++calls % 2 ? reply('', { name: 'resource_propose', input: { patch: { name: '合成资料说明', purpose: '下次复用' } } }) : reply('READY'))
    const id = await session(); approve()
    await manager.prompt(id, { text: 'Create a note proposal' }); await until(() => !manager.busy)
    const first = sessionReceipts(id).find(item => item.operation === 'resource_proposal')!
    manager.respondProposal(id, first.id, true)
    expect(store.listResources().find(item => item.name === '合成资料说明')?.fields).toEqual([])
    await manager.prompt(id, { text: 'Create another proposal' }); await until(() => !manager.busy)
    const second = sessionReceipts(id).find(item => item.operation === 'resource_proposal' && item.state === 'pending')!
    await manager.stop(id)
    expect(() => manager.respondProposal(id, second.id, true)).toThrow('失效')
  }, 30_000)
})
