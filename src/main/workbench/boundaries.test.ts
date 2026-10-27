import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorkApprovals } from './approvals'
import { ProjectFiles } from './files'
import { parseResourceText, redactInput } from './input'
import { assertReplyHasNoSecrets, createBridge, endpointURL } from './bridge'
import { workerEnvironment } from './runtime'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(): Promise<{ root: string; files: ProjectFiles }> { const root = await mkdtemp(join(tmpdir(), 'cv-boundary-')); roots.push(root); return { root, files: new ProjectFiles(root) } }
describe('workbench security and cancellation boundaries', () => {
  it('parses credentials locally and masks exact and common secret formats', () => {
    const parsed = parseResourceText('登录地址：https://example.com\n用户名：demo\n密码：secret-canary')
    expect(parsed.endpoint).toBe('https://example.com/')
    expect(parsed.fields).toContainEqual({ name: '密码', value: 'secret-canary', secret: true })
    expect(redactInput('密码：secret-canary extra-value', ['extra-value']).text).not.toMatch(/secret-canary|extra-value/)
  })
  it('binds one approval to its fingerprint and makes cancellation and expiry irreversible', async () => {
    const approvals = new WorkApprovals(() => {}), controller = new AbortController()
    const input = { taskId: 'task', runId: 'run', operation: 'write', target: 'a.txt', description: 'review' }
    const pending = approvals.request(input, { content: 'first' }, controller.signal)
    const approval = approvals.list()[0]!
    expect(() => approvals.respond(approval.id, 'wrong-hash', true)).toThrow('失效')
    approvals.respond(approval.id, approval.fingerprint, true)
    await pending
    expect(() => approvals.respond(approval.id, approval.fingerprint, true)).toThrow('失效')
    const rejected = approvals.request(input, {}, controller.signal)
    const check = expect(rejected).rejects.toBeDefined()
    controller.abort()
    await check
    expect(approvals.list()).toHaveLength(0)
  })
  it('rejects traversal, credential files, hard links and stale writes', async () => {
    const { root, files } = await fixture()
    await writeFile(join(root, 'safe.txt'), 'one')
    await expect(files.read('../outside.txt')).rejects.toThrow('范围')
    await expect(files.read('.env')).rejects.toThrow('允许范围')
    await link(join(root, 'safe.txt'), join(root, 'hard.txt'))
    await expect(files.read('hard.txt')).rejects.toThrow('硬链接')
    await writeFile(join(root, 'normal.txt'), 'one')
    const first = await files.read('normal.txt')
    await writeFile(join(root, 'normal.txt'), 'user edit')
    await expect(files.write('normal.txt', 'replace', first.sha256)).rejects.toThrow('已变化')
    expect((await files.read('normal.txt')).content).toBe('user edit')
  })
  it('uses a separate copy and invalidates evidence for added or changed code', async () => {
    const { root, files } = await fixture(), target = await mkdtemp(join(tmpdir(), 'cv-copy-')); roots.push(target)
    await writeFile(join(root, 'main.js'), 'const value = 1')
    await mkdir(join(root, 'node_modules')); await writeFile(join(root, '.env'), 'SECRET=not-copied')
    const manifest = await files.snapshot(target, [])
    expect(Object.keys(manifest)).toEqual(['main.js'])
    expect(await files.verifySnapshot(manifest)).toBe(true)
    await writeFile(join(root, 'new.js'), 'const added = true')
    expect(await files.verifySnapshot(manifest)).toBe(false)
    await expect(files.snapshot(join(root, 'snapshot'), [])).rejects.toThrow('项目之外')
  })
  it('does not let a child inherit keys, NODE_OPTIONS, or proxy settings', () => {
    const env = workerEnvironment('/isolated', 'http://127.0.0.1:1', 'capability')
    expect(Object.keys(env)).not.toContain('NODE_OPTIONS')
    expect(Object.keys(env)).not.toContain('DEEPSEEK_API_KEY')
    expect(Object.keys(env)).not.toContain('HTTP_PROXY')
    expect(env.CV_BRIDGE_TOKEN).toBe('capability')
  })
  it('requires HTTPS without embedded authentication and catches split model echoes', () => {
    expect(() => endpointURL('http://example.com')).toThrow('HTTPS')
    expect(() => endpointURL('https://user:pw@example.com')).toThrow('HTTPS')
    expect(() => endpointURL('https://example.com?api_key=key')).toThrow('HTTPS')
    expect(() => assertReplyHasNoSecrets('data: {"delta":{"text":"fixture-"}}\ndata: {"delta":{"text":"secret"}}\n', ['fixture-secret'])).toThrow('受保护')
  })
  it('authenticates bridge calls, injects keys only to a fixed destination, and stops revoked requests', async () => {
    const fetchOriginal = globalThis.fetch, controller = new AbortController()
    let revoked = false
    const remote = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      if (String(url).startsWith('http://127.0.0.1:')) return fetchOriginal(url, init)
      return new Response('data: {"delta":{"text":"safe reply"}}\n\n', { headers: { 'content-type': 'text/event-stream' } })
    })
    const tool = vi.fn(async () => ({ passed: true }))
    const bridge = await createBridge({ model: { resourceId: 'model', field: 'key', endpoint: 'https://model.example/anthropic', model: 'model-fixture', maxRequests: 3, maxMinutes: 1 },
      signal: controller.signal, secrets: () => ['fixture-auth-key'], modelKey: () => { if (revoked) throw new Error('revoked'); return 'fixture-auth-key' }, tool })
    try {
      expect((await fetch(`${bridge.url}/tool`, { method: 'POST', body: '{}' })).status).toBe(403)
      const headers = { authorization: `Bearer ${bridge.token}` }
      expect((await fetch(`${bridge.url}/model/v1/messages`, { method: 'POST', headers, body: '{"model":"untrusted","messages":[]}' })).status).toBe(200)
      const upstream = remote.mock.calls.find(([url]) => String(url).startsWith('https:'))!
      expect(String(upstream[0])).toBe('https://model.example/anthropic/v1/messages')
      expect((upstream[1]?.headers as Record<string, string>)['x-api-key']).toBe('fixture-auth-key')
      expect(upstream[1]?.body).toContain('model-fixture')
      revoked = true
      expect((await fetch(`${bridge.url}/model/v1/messages`, { method: 'POST', headers, body: '{"messages":[]}' })).status).toBe(400)
      expect((await fetch(`${bridge.url}/model/v1/messages`, { method: 'POST', headers, body: '{"messages":["fixture-auth-key"]}' })).status).toBe(400)
      expect(remote.mock.calls.filter(([url]) => String(url).startsWith('https:'))).toHaveLength(1)
      controller.abort()
      expect((await fetch(`${bridge.url}/tool`, { method: 'POST', headers, body: '{"operation":"read_file","args":{}}' })).status).toBe(400)
      expect(tool).not.toHaveBeenCalled()
    } finally { await bridge.close() }
  })
})
