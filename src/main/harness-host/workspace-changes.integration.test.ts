import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile, readdir, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: (name: string) => name === 'home' ? homedir() : fixture.userData, getAppPath: () => resolve('.') } }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { HostManager } from './manager'
import { findGit } from './git'

let root = '', project = '', manager: HostManager
const git = findGit()
const run = (...args: string[]): string => execFileSync(git!, ['-C', project, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } })
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
  const deadline = Date.now() + 30_000
  while (!check()) { if (Date.now() > deadline) throw new Error('Fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)) }
}
async function looseObjects(): Promise<number> {
  let total = 0
  for (const entry of await readdir(join(project, '.git', 'objects'), { withFileTypes: true })) if (entry.isDirectory() && /^[0-9a-f]{2}$/.test(entry.name)) total += (await readdir(join(project, '.git', 'objects', entry.name))).length
  return total
}

describe.skipIf(!isSqliteAvailable() || !git)('official workspace-changes with a git-only subprocess seam', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cv-workspace-')); fixture.userData = join(root, 'data'); project = join(root, 'project')
    await mkdir(fixture.userData); await mkdir(join(project, 'src'), { recursive: true })
    await writeFile(join(project, 'src', 'app.ts'), 'export const retry = 1\n')
    run('init', '-q'); run('config', 'user.email', 'fixture@example.test'); run('config', 'user.name', 'Fixture'); run('config', 'core.autocrlf', 'false')
    run('add', '-A'); run('commit', '-q', '-m', 'init')
    createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!')
    const resource = store.saveResource({ name: 'Synthetic model', kind: 'model', endpoint: 'https://model.fixture', environment: 'dev', fields: [{ name: 'key', value: 'synthetic-model-key-only', secret: true }] })
    store.saveModelConfig({ ...store.DEFAULT_MODEL, endpoint: resource.endpoint, resourceId: resource.id, maxRequests: 10, maxMinutes: 2 })
    manager = new HostManager()
  })
  afterEach(async () => { await manager.shutdown(); vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(root, { recursive: true, force: true }) })

  it('records an encrypted, redacted per-turn diff without touching the repository index or object store', async () => {
    const before = await readFile(join(project, 'src', 'app.ts'), 'utf8')
    const objectsBefore = await looseObjects(), headBefore = run('rev-parse', 'HEAD').trim()
    const next = 'export const retry = 3\nexport const password = "Tr0ub4dor&3x"\n'
    let calls = 0
    const original = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).startsWith('http://127.0.0.1:')) return original(url, options)
      return ++calls === 1 ? reply('', { name: 'workbench_write_file', input: { path: 'src/app.ts', content: next, expectedHash: createHash('sha256').update(before).digest('hex') } }) : reply('done')
    })
    manager.onChange(() => { for (const item of manager.approvals.list()) manager.respondApproval(item.id, item.fingerprint, true) })
    const created = store.saveProject({ name: 'Repo', directory: project, environment: 'dev' })
    const id = (await manager.createSession({ projectId: created.id, permission: 'confirm' })).id
    await manager.prompt(id, { text: 'bump retry' }); await until(() => !manager.busy)
    expect(await readFile(join(project, 'src', 'app.ts'), 'utf8')).toBe(next)
    const turns = manager.context(id).workspaceChanges ?? []
    expect(turns).toHaveLength(1)
    const file = turns[0]!.files.find(item => item.path === 'src/app.ts')!
    expect(file).toMatchObject({ added: 2, deleted: 1 })
    const lines = file.hunks!.flatMap(hunk => hunk.lines)
    expect(lines).toContain('+export const retry = 3')
    expect(lines.join('\n')).not.toContain('Tr0ub4dor&3x')
    expect(lines.join('\n')).toContain('[已隐藏敏感字段]')
    // The user's repository: nothing staged, HEAD and loose objects unchanged.
    expect(run('diff', '--cached', '--name-only').trim()).toBe('')
    expect(run('rev-parse', 'HEAD').trim()).toBe(headBefore)
    expect(await looseObjects()).toBe(objectsBefore)
    const home = join(fixture.userData, 'harness-sessions', id)
    expect((await readdir(home)).some(name => name.startsWith('dsh-workspace-changes-'))).toBe(false)
  }, 90_000)
})
