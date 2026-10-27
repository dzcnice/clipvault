import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../test-setup/integration'
vi.mock('./connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../main/crypto/vault'
import * as store from './workbench-store'
import { fingerprint } from '../main/workbench/input'

describe.skipIf(!isSqliteAvailable())('workbench encrypted SQLite records', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Fixture-Password-2026!') })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb() })
  const project = () => store.saveProject({ name: '测试项目', directory: 'C:\\fixture\\code', environment: 'dev' })
  it('stores fields encrypted, preserves exact spaces, and never returns secret values in metadata', () => {
    const resource = store.saveResource({ name: 'Fixture', kind: 'account', environment: 'dev', fields: [{ name: 'password', value: '  Secret-Canary-Unique  ', secret: false }, { name: 'username', value: 'developer', secret: false }] })
    expect(resource.fields.find(field => field.name === 'password')).not.toHaveProperty('displayValue')
    expect(resource.fields.find(field => field.name === 'username')?.displayValue).toBe('developer')
    expect(store.readResourceField(resource.id, 'password')).toBe('  Secret-Canary-Unique  ')
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT * FROM wb_resource_fields').all())).not.toContain('Secret-Canary-Unique')
  })
  it('keeps previous versions, rejects stale edits and invalidates revocation authorizations', () => {
    const first = store.saveResource({ name: 'API', kind: 'api', environment: 'dev', fields: [{ name: 'key', value: 'first-canary', secret: true }] })
    const second = store.saveResource({ id: first.id, expectedVersion: 1, name: first.name, kind: first.kind, environment: first.environment, fields: [{ name: 'key', value: 'second-canary', secret: true }] })
    expect(second.version).toBe(2)
    expect(store.resourceSecrets([first.id]).sort()).toEqual(['first-canary', 'second-canary'])
    expect(() => store.readResourceField(first.id, 'key', 1)).toThrow('版本')
    expect(() => store.saveResource({ id: first.id, expectedVersion: 1, name: 'stale', kind: 'api', environment: 'dev', fields: [] })).toThrow('刷新')
    store.revokeResource(first.id)
    expect(() => store.readResourceField(first.id, 'key', 2)).toThrow('撤销')
  })
  it('binds resources to project and environment, and persists immutable context independent of clipboard', () => {
    const p = project()
    const resource = store.saveResource({ name: '生产', kind: 'api', environment: 'production', fields: [] })
    expect(() => store.createTask({ projectId: p.id, prompt: 'task', resourceIds: [resource.id] }, [])).toThrow('环境')
    const snapshot = { id: 'context', sourceId: 'deleted-clipboard', kind: 'clipboard' as const, title: '资料', text: '固定上下文', sha256: fingerprint('固定上下文'), redacted: false, createdAt: Date.now() }
    const task = store.createTask({ projectId: p.id, prompt: '实现目标' }, [snapshot])
    expect(store.getTask(task.id).context).toEqual([snapshot])
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT * FROM wb_tasks').all())).not.toContain('固定上下文')
  })
  it('recovers only unfinished runs and does not change completed waiting-for-review results', () => {
    const p = project(), a = store.createTask({ projectId: p.id, prompt: 'A' }, []), b = store.createTask({ projectId: p.id, prompt: 'B' }, [])
    const ar = store.createRun(a.id, '0.2.1-rc.2')
    store.createRun(b.id, '0.2.1-rc.2')
    store.finishRun(ar.id, 'waiting', '等待用户核对')
    store.recoverInterruptedRuns()
    expect(store.getTask(a.id).state).toBe('waiting')
    expect(store.getTask(b.id).state).toBe('interrupted')
    vault.lockVault()
    expect(() => store.listResources()).toThrow('解锁')
  })
  it('appends versioned instructions without rewriting the original task or old run input', () => {
    const p = project(), task = store.createTask({ projectId: p.id, prompt: '原始要求' }, [])
    const run = store.createRun(task.id, 'fixture')
    expect(() => store.appendTask({ taskId: task.id, expectedRevision: 1, prompt: '运行中补充' }, [])).toThrow('停止')
    store.finishRun(run.id, 'waiting', 'old result')
    const next = store.appendTask({ taskId: task.id, expectedRevision: 1, prompt: '追加空输入测试' }, [])
    expect(next).toMatchObject({ prompt: '原始要求', revision: 2, state: 'draft', activeRunId: null, updates: [{ prompt: '追加空输入测试', revision: 2 }] })
    expect(store.getTaskDetail(task.id).runs[0]?.inputRevision).toBe(1)
    expect(() => store.appendTask({ taskId: task.id, expectedRevision: 1, prompt: 'stale' }, [])).toThrow('刷新')
    const foreign = store.saveResource({ name: 'prod', kind: 'account', environment: 'production', fields: [] })
    expect(() => store.appendTask({ taskId: task.id, expectedRevision: 2, prompt: 'wrong', resourceIds: [foreign.id] }, [])).toThrow('环境')
    expect(JSON.stringify(getActiveIntegrationDb().prepare('SELECT data FROM wb_tasks').all())).not.toContain('追加空输入测试')
  })
  it('rejects embedded credentials in displayed addresses even when bypassing the parser', () => {
    for (const endpoint of ['https://user:password@example.com', 'https://example.com?api_key=private', 'javascript:alert(1)']) {
      expect(() => store.saveResource({ name: 'test', kind: 'account', environment: 'dev', fields: [], endpoint })).toThrow()
    }
  })
})
