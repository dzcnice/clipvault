import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { allResourceSecrets, outboundRedact, containsSecrets } from './redaction'
import { createBridge } from './bridge'

describe.skipIf(!isSqliteAvailable())('global outbound secret boundary', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Synthetic-redaction-password!') })
  afterEach(() => { vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb() })
  it('invalidates on resource revisions and vault locks, and protects historical and revoked values', () => {
    const input = { name: 'Fixture', kind: 'account' as const, environment: 'dev', fields: [{ name: 'password', value: 'synthetic-old-password', secret: true }] }
    const resource = store.saveResource(input)
    expect(outboundRedact(input.fields[0]!.value).redacted).toBe(true)
    store.saveResource({ ...input, id: resource.id, expectedVersion: resource.version, fields: [{ name: 'password', value: 'synthetic-new-password', secret: true }] })
    expect(allResourceSecrets()).toEqual(expect.arrayContaining(['synthetic-old-password', 'synthetic-new-password']))
    store.revokeResource(resource.id)
    expect(outboundRedact('synthetic-new-password').redacted).toBe(true)
    vault.lockVault(); expect(() => allResourceSecrets()).toThrow('解锁')
    vault.unlockVault('Synthetic-redaction-password!'); expect(allResourceSecrets()).toHaveLength(2)
  })
  it('blocks JSON-escaped secrets before any external request and enforces session control binding', async () => {
    const secret = 'synthetic-quote-"-newline\n-end'
    expect(containsSecrets(JSON.stringify({ text: secret }), [secret])).toBe(true)
    const bridge = await createBridge({ model: { ...store.DEFAULT_MODEL, endpoint: 'https://fixture.invalid' }, signal: new AbortController().signal, secrets: () => [secret], modelKey: () => 'synthetic-only', tool: async () => ({}),
      control: async (_operation, input) => { if (input.sessionId !== 'expected') throw new Error('会话控制越界'); return { type: 'idle' } } })
    const original = globalThis.fetch, external = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, options) => { if (String(url).startsWith(bridge.url)) return original(url, options); external(); throw new Error('External network forbidden in test') })
    try {
      const headers = { authorization: `Bearer ${bridge.token}`, 'content-type': 'application/json' }
      expect((await fetch(`${bridge.url}/model/v1/messages`, { method: 'POST', headers, body: JSON.stringify({ messages: [{ content: secret }] }) })).status).toBe(400)
      expect(external).not.toHaveBeenCalled()
      expect((await fetch(`${bridge.url}/control/next`, { method: 'POST', headers, body: JSON.stringify({ sessionId: 'other' }) })).status).toBe(400)
      expect((await fetch(`${bridge.url}/control/next`, { method: 'POST', headers, body: JSON.stringify({ sessionId: 'expected' }) })).status).toBe(200)
    } finally { await bridge.close() }
  })
})
