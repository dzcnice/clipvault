import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction } from '../../../test-setup/integration'
const fixture = vi.hoisted(() => ({ userData: '', clipboard: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => fixture.userData }, clipboard: { readText: () => fixture.clipboard, writeText: (text: string) => { fixture.clipboard = text }, availableFormats: () => fixture.clipboard ? ['text/plain'] : [], readHTML: () => '', readBuffer: () => Buffer.alloc(0), readImage: () => ({ isEmpty: () => true }) }, nativeImage: {}, Notification: { isSupported: () => false } }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../clipboard/source-app', () => ({ getForegroundAppName: () => 'fixture', refreshForegroundAppName: async () => 'fixture', isAppExcluded: () => false }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { prepareIntake, commitIntake, revealIntake } from './intake'
import { ResourceSequence, resourceCode } from './sequence'
import { ClipboardMonitor } from '../clipboard/monitor'
import { duplicateSecretResources } from './secret-index'
import type { StructuredRequest } from '../harness-host/utility'

const username = 'fixture_user_42', password = 'test-password-not-real', seed = 'JBSWY3DPEHPK3PXP'
const raw = `https://account.fixture/sign-in\nusername=${username}\npassword=${password}\ntotp=${seed}`
function proposal(): unknown { return { name: '支付后台', kind: 'account', purpose: '登录检查', loginUrl: 'https://account.fixture/login', aliases: ['支付管理', 'payment admin'], tags: ['开发'], fields: [{ token: '⟦v1⟧', name: 'username', role: 'username', secret: false }, { token: '⟦v2⟧', name: 'password', role: 'password', secret: true }, { token: '⟦v3⟧', name: 'totp', role: 'totp_seed', secret: true }] } }
describe('native resource intake and sequence', () => {
  let monitor: ClipboardMonitor | undefined
  beforeEach(async () => { fixture.userData = await mkdtemp(join(tmpdir(), 'cv-resource-fixture-')); fixture.clipboard = ''; createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!') })
  afterEach(async () => { monitor?.stop(); monitor = undefined; vi.useRealTimers(); vault.__resetVaultForTests(); closeIntegrationDb(); await rm(fixture.userData, { recursive: true, force: true }) })
  it('structures only a token skeleton, refills locally, and detects duplicate secrets without plaintext indexes', async () => {
    const bodies: string[] = []
    const structure = async <T>(request: StructuredRequest<T>): Promise<T> => { bodies.push(request.prompt); return request.schema.parse(proposal()) }
    const review = await prepareIntake(raw, `登录检查 ${password}`, { structure })
    expect(review.usedAI).toBe(true)
    for (const value of [username, password, seed]) { expect(bodies.join('')).not.toContain(value); expect(JSON.stringify(review)).not.toContain(value) }
    expect(review.draft.fields.map(field => field.role)).toEqual(['username', 'password', 'totp_seed'])
    expect(revealIntake(review.id, '⟦v2⟧')).toBe(password)
    const saved = commitIntake({ id: review.id, draft: review.draft }).resource
    expect(store.readResourceField(saved.id, 'password')).toBe(password)
    expect(store.readResourceField(saved.id, 'totp')).toBe(seed)
    expect(resourceCode(saved.id).code).toMatch(/^\d{6}$/)
    const duplicate = await prepareIntake(raw, '更新')
    expect(duplicate.duplicates.map(item => item.id)).toContain(saved.id)
    commitIntake({ id: duplicate.id, draft: duplicate.draft, updateId: saved.id, expectedVersion: saved.version })
    expect(store.resourceHistory(saved.id)).toHaveLength(6)
    const rows = JSON.stringify(getActiveIntegrationDb().prepare('SELECT * FROM wb_resource_secret_index').all())
    expect(rows).not.toContain(password); expect(rows).not.toContain(seed)
    expect(duplicateSecretResources([password])).toEqual([saved.id])
  })
  it.each(['unavailable', 'original', 'unknown-token', 'duplicate-token', 'wrong-origin'])('falls back safely on %s', async scenario => {
    const structure = async <T>(request: StructuredRequest<T>): Promise<T> => {
      if (scenario === 'unavailable') throw new Error('synthetic offline')
      const output = proposal() as { name: string; loginUrl: string; fields: Array<{ token: string }> }
      if (scenario === 'original') output.name = password
      if (scenario === 'unknown-token') output.fields[0]!.token = '⟦v404⟧'
      if (scenario === 'duplicate-token') output.fields[1]!.token = '⟦v1⟧'
      if (scenario === 'wrong-origin') output.loginUrl = 'https://unapproved.fixture/login'
      return request.schema.parse(output)
    }
    const review = await prepareIntake(raw, '本地登录', { structure })
    expect(review.usedAI).toBe(false); expect(review.warnings.join('')).toContain('本地解析')
    expect(review.draft.fields).toHaveLength(3)
    expect(JSON.stringify(review)).not.toContain(password)
  })
  it('never revives an in-flight draft across a vault lock and discards completed drafts on lock', async () => {
    const review = await prepareIntake(raw, '')
    vault.lockVault(); vault.unlockVault('Synthetic-Vault-Password!')
    expect(() => revealIntake(review.id, '⟦v2⟧')).toThrow('已过期')
    await expect(prepareIntake(raw, '', { structure: async <T>(request: StructuredRequest<T>) => { vault.lockVault(); vault.unlockVault('Synthetic-Vault-Password!'); return request.schema.parse(proposal()) } })).rejects.toThrow('已锁定')
  })
  it('uses username, password and fresh TOTP in order, with monitor self-write suppression and sixty-second expiry', async () => {
    const review = await prepareIntake(raw, ''), resource = commitIntake({ id: review.id, draft: review.draft }).resource
    vi.useFakeTimers()
    monitor = new ClipboardMonitor({ pollInterval: 40, excludedApps: [] })
    const changes = vi.fn(), pasted: string[] = []
    monitor.on('change', changes); monitor.start()
    const sequence = new ResourceSequence({ read: () => fixture.clipboard, write: value => monitor!.writeText(value), paste: async () => { pasted.push(fixture.clipboard); return { ok: true } }, notify: () => {} })
    await sequence.start(resource.id); await vi.advanceTimersByTimeAsync(120)
    await sequence.next(); await vi.advanceTimersByTimeAsync(120)
    await sequence.next(); await vi.advanceTimersByTimeAsync(120)
    expect(pasted[0]).toBe(username); expect(pasted[1]).toBe(password); expect(pasted[2]).toMatch(/^\d{6}$/)
    expect(fixture.clipboard).toBe(''); expect(sequence.state().active).toBe(false); expect(changes).not.toHaveBeenCalled()
    await sequence.start(resource.id); await vi.advanceTimersByTimeAsync(60_001)
    expect(sequence.state().active).toBe(false); expect(fixture.clipboard).toBe(''); expect(changes).not.toHaveBeenCalled()
    expect(store.getResource(resource.id).lastUsedAt).toBeGreaterThan(0)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT * FROM credential_audit').all())).not.toContain(password)
  })
  it('restores only non-secret text, preserves a new external copy, and rejects stale resource versions', async () => {
    const review = await prepareIntake(raw, ''), resource = commitIntake({ id: review.id, draft: review.draft }).resource
    fixture.clipboard = 'ordinary previous text'
    const sequence = new ResourceSequence({ read: () => fixture.clipboard, write: value => { fixture.clipboard = value }, paste: async () => ({ ok: true }), notify: () => {} })
    await sequence.start(resource.id); sequence.finish(); expect(fixture.clipboard).toBe('ordinary previous text')
    fixture.clipboard = password; await sequence.start(resource.id); sequence.finish(); expect(fixture.clipboard).toBe('')
    await sequence.start(resource.id); fixture.clipboard = 'new external copy'; sequence.finish(); expect(fixture.clipboard).toBe('new external copy')
    await sequence.start(resource.id); store.saveResource({ ...resource, expectedVersion: resource.version, fields: [] }); await expect(sequence.next()).rejects.toThrow('版本已变化'); expect(sequence.state().active).toBe(false)
  })
})
