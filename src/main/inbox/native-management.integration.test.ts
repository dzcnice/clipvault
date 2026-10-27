import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../prefs', () => ({ getPrefs: () => ({ maxHistorySize: 5000, historyRetentionDays: 0, imageRetentionDays: 30, historyMaxSizeMb: 0 }) }))
vi.mock('../storage/image-store', () => ({ deleteImageFile: vi.fn(), loadImageAsDataUrl: vi.fn() }))
import * as vault from '../crypto/vault'
import * as clips from '../../db/clipboard-store'
import * as store from '../../db/workbench-store'
import { createSessionRecord } from '../../db/harness-session-store'
import { listInbox, settleInbox, muteInboxRule, mutedInboxRules } from '../../db/inbox-store'
import { suggestForClipboard } from './rules'
import { computeSuggestions, applySuggestion } from '../clipboard/suggestions'
import { interpretClipboardQuery, prepareOrganize, organizeClipboard, type Structurer } from '../clipboard/ai'
import { resourceHealth } from '../resources/health'
import { invalidateSecretCache } from '../workbench/redaction'
import { ClipboardContentType } from '../../types'

const capture = (content: string, sourceApp = 'FixtureEditor') => clips.addClipboardItem({ type: ClipboardContentType.TEXT, content, sourceApp }).then(value => value!)
beforeEach(() => { createIntegrationDb(); vault.createVault('Synthetic-Inbox-Vault-2026!'); invalidateSecretCache() })
afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); invalidateSecretCache(); vi.restoreAllMocks() })

describe('native inbox and AI boundaries', () => {
  it('suggests an error fix within one second without model requests; mutes and deduplicates locally', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const project = store.saveProject({ name: 'fixture', directory: 'C:/fixture-repo', description: '', environment: 'dev' })
    const item = await capture('TypeError: C:/fixture-repo/src/main.ts:10:2 cannot read property')
    const before = performance.now(); expect(suggestForClipboard(item)).toBeTruthy(); expect(performance.now() - before).toBeLessThan(1000)
    expect(listInbox()[0]).toMatchObject({ type: 'error_fix', projectId: project.id, data: { ids: [item.id] } })
    expect(suggestForClipboard(item)).toBeNull()
    settleInbox(listInbox()[0]!.id, 'dismissed'); expect(suggestForClipboard(item)).toBeNull()
    muteInboxRule('error_fix'); expect(mutedInboxRules()).toContain('error_fix')
    expect(suggestForClipboard(await capture('Error: C:/fixture-repo/another.ts'))).toBeNull()
    muteInboxRule('error_fix', false); expect(mutedInboxRules()).not.toContain('error_fix')
    expect(fetch).not.toHaveBeenCalled()
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT data FROM wb_inbox').all())).not.toContain('TypeError')
  })
  it('recognizes duplicate secrets using keyed indexes and leaves all values out of suggestions', async () => {
    const secret = 'sk-Q7wE2rT8yU3iO9pA4sD6fG1hJ5kL0zXcV'
    const resource = store.saveResource({ name: 'Fixture Service', kind: 'api', fields: [{ name: 'key', role: 'api_key', secret: true, value: secret }], purpose: '', endpoint: '', environment: 'dev' })
    suggestForClipboard(await capture(secret))
    expect(listInbox()[0]).toMatchObject({ type: 'duplicate_secret', data: { resourceIds: [resource.id] } })
    expect(JSON.stringify(listInbox())).not.toContain(secret)
  })
  it('sends only query/date/project/category/source metadata for recall and falls back locally on failure', async () => {
    const marker = 'CLIP_CONTENT_UNIQUE_CANARY_987654', item = await capture(marker + ' needle')
    const bodies: string[] = []
    const structure: Structurer = async request => { bodies.push(request.prompt); return request.schema.parse({ keywords: ['needle'], categories: ['text'], sourceApps: ['FixtureEditor'] }) }
    const result = await interpretClipboardQuery('昨天 Editor 复制的内容', structure)
    expect(result.usedAI).toBe(true); expect((await clips.searchClipboardHistory(result.filter)).items.map(item => item.id)).toContain(item.id)
    expect(bodies.join('')).not.toContain(marker); expect(bodies.join('')).not.toContain(item.id)
    const payload = JSON.parse(bodies[0]!.slice(bodies[0]!.indexOf('\n') + 1))
    expect(Object.keys(payload).sort()).toEqual(['categories', 'date', 'projectNames', 'query', 'sourceApps'])
    expect((await interpretClipboardQuery('local needle', async () => { throw new Error('unavailable') })).usedAI).toBe(false)
  })
  it('organizes only confirmed previews, encrypts summaries, searches metadata and rejects review replay', async () => {
    const first = await capture('SELECT * FROM allowed_table;'), other = await capture('UNSELECTED_CANARY_3294')
    const sensitive = await capture('username=someone\npassword="Y8k2!rT9pQ6s"')
    const review = prepareOrganize([first.id, other.id, sensitive.id]); expect(review.entries.find(item => item.id === sensitive.id)?.sensitive).toBe(true)
    const bodies: string[] = [], structure: Structurer = async request => { bodies.push(request.prompt); return request.schema.parse({ items: [{ id: first.id, title: 'SUMMARY_CANARY', summary: '数据库查询示例' }], suggestions: [] }) }
    expect(await organizeClipboard(review.id, [first.id], structure)).toEqual({ count: 1, suggestions: 0 })
    expect(bodies.join('')).toContain('allowed_table'); expect(bodies.join('')).not.toContain('UNSELECTED_CANARY_3294'); expect(bodies.join('')).not.toContain('Y8k2!rT9pQ6s')
    expect(clips.getClipboardItemById(first.id)?.aiMeta?.title).toBe('SUMMARY_CANARY')
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT ai_meta FROM clipboard_history').all())).not.toContain('SUMMARY_CANARY')
    expect((await clips.searchClipboardHistory({ keyword: 'SUMMARY_CANARY' })).total).toBe(1)
    await expect(organizeClipboard(review.id, [first.id], structure)).rejects.toThrow('失效')
    const fresh = prepareOrganize([first.id])
    await expect(organizeClipboard(fresh.id, [first.id], async request => request.schema.parse({ items: [{ id: other.id, title: 'forbidden', summary: 'forbidden' }], suggestions: [] }))).rejects.toThrow('未获确认')
    expect(clips.getClipboardItemById(other.id)?.aiMeta).toBeUndefined()
  })
  it('protects session references from automatic retention and makes local organization explicit', async () => {
    const project = store.saveProject({ name: 'test', directory: 'C:/test-repo', environment: 'dev', description: '' }), item = await capture('referenced fixture')
    createSessionRecord('session-fixture', project.id, {})
    getActiveIntegrationDb().prepare('INSERT INTO wb_session_clipboard_refs VALUES (?,?)').run('session-fixture', item.id)
    await capture('disposable fixture'); expect(clips.cleanupOldHistory(0)).toBe(1)
    expect(clips.getClipboardItemById(item.id)).not.toBeNull()
    computeSuggestions(); expect(listInbox().some(item => item.data.action === 'protected')).toBe(true)
    expect(clips.getClipboardItemById(item.id)).not.toBeNull()
  })
  it('finds recurring clipboard groups and runs merge only on the explicit action', async () => {
    const project = store.saveProject({ name: 'fixture', directory: 'C:/fixture-repo', description: '', environment: 'dev' }), now = Date.now()
    const first = await capture('const a = 1; // fixture-repo'), second = await capture('const b = 2; // fixture-repo')
    const db = getActiveIntegrationDb(); db.prepare('UPDATE clipboard_history SET project_id=?').run(project.id)
    for (const at of [now - 900000, now - 300000]) for (const item of [first, second]) db.prepare('INSERT INTO clipboard_occurrences(clipboard_id,copied_at,source_app,is_migration) VALUES(?,?,?,0)').run(item.id, at, 'Editor')
    computeSuggestions(now); const suggestion = listInbox().find(item => item.data.action === 'snippet')!
    expect(suggestion).toBeTruthy(); expect(clips.listClipboardHistory({ snippetsOnly: true }).total).toBe(0)
    applySuggestion(suggestion.id); expect(clips.listClipboardHistory({ snippetsOnly: true }).items[0]?.content).toContain('const a = 1')
    expect(clips.getClipboardItemById(first.id)).not.toBeNull()
  })
  it('reports weak, repeated and rotation reminders without returning password values', () => {
    for (const name of ['A', 'B']) store.saveResource({ name, kind: 'account', purpose: '', endpoint: '', environment: 'dev', rotateAfterDays: 1, fields: [{ name: 'password', value: 'simple-pass', role: 'password', secret: true }] })
    const reports = resourceHealth(true)
    expect(reports.every(report => report.issues.some(issue => issue.kind === 'weak_password') && report.issues.some(issue => issue.kind === 'duplicate_secret') && report.issues.some(issue => issue.kind === 'rotate'))).toBe(true)
    expect(JSON.stringify(reports)).not.toContain('simple-pass'); expect(JSON.stringify(listInbox())).not.toContain('simple-pass')
  })
})
