import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { templates, saveTemplate, deleteTemplate, taskHandoff } from './daily'

describe.skipIf(!isSqliteAvailable())('daily templates and task handoff', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Daily-Test-Password!') })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb() })
  it('encrypts custom templates, removes only the selected template, and retains built-ins', () => {
    const item = saveTemplate({ name: 'My review', prompt: 'TEMPLATE-CANARY review files', acceptance: 'Tests pass' })
    expect(templates()).toHaveLength(4)
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT data FROM wb_settings').all())).not.toContain('TEMPLATE-CANARY')
    expect(() => deleteTemplate('fix')).toThrow('内置模板')
    deleteTemplate(item.id)
    expect(templates()).toHaveLength(3)
    vault.lockVault(); expect(() => templates()).toThrow()
  })
  it('redacts a known credential from task text, file differences and template names before export', () => {
    const secret = 'SYNTHETIC-ACCOUNT-CANARY'
    store.saveResource({ name: 'Fixture', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: secret, secret: true }] })
    const project = store.saveProject({ name: 'Fixture', directory: 'C:\\synthetic-project', environment: 'dev' })
    const task = store.createTask({ projectId: project.id, prompt: `Review ${secret}`, acceptance: 'Explain evidence' }, [])
    const run = store.createRun(task.id, 'fixture')
    store.recordReceipt('write', run.id, 'write_file', 'fixture', 'completed', { path: 'sample.txt', before: secret, content: secret })
    expect(taskHandoff(task.id)).not.toContain(secret)
    const saved = saveTemplate({ name: secret, prompt: secret, acceptance: secret })
    expect(JSON.stringify(saved)).not.toContain(secret)
  })
})
