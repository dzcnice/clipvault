/**
 * Health checker 单测（Sprint 11 · TASK-059）
 *
 * mock vault + credential-store，验证弱密码/重复/陈旧检测逻辑。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CredentialType } from '../../types/credential'
import type { Credential } from '../../types/credential'

const vaultUnlocked = { value: true }
let mockItems: Credential[] = []

vi.mock('../crypto/vault', () => ({
  isUnlocked: (): boolean => vaultUnlocked.value,
  encryptWithDEK: (s: string): string => s,
  decryptWithDEK: (s: string): string => s
}))

vi.mock('../../db/credential-store', () => ({
  listCredentials: (): { items: Credential[]; total: number } => ({
    items: mockItems,
    total: mockItems.length
  })
}))

import { scanAll, clearCache, STALE_THRESHOLD_MS, evaluateStrength } from './checker'

function mkCred(over: Partial<Credential>): Credential {
  const now = Date.now()
  return {
    id: over.id ?? 'c-' + Math.random().toString(36).slice(2),
    name: over.name ?? 'cred',
    type: CredentialType.PASSWORD,
    value: over.value ?? 'AbcDefGh1!JklMnoP',
    tags: [],
    metadata: {},
    createdAt: over.createdAt ?? now,
    updatedAt: over.updatedAt ?? now,
    lastUsedAt: over.lastUsedAt,
    useCount: 0,
    isFavorite: false,
    ...over
  } as Credential
}

describe('scanAll', () => {
  beforeEach(() => {
    clearCache()
    vaultUnlocked.value = true
    mockItems = []
  })

  it('vault 未解锁时返回 session_required', () => {
    vaultUnlocked.value = false
    const r = scanAll()
    expect(r.code).toBe('session_required')
  })

  it('空凭证时报告为满分', () => {
    mockItems = []
    const r = scanAll()
    expect(r.code).toBe('ok')
    if (r.code !== 'ok') return
    expect(r.score).toBe(100)
    expect(r.report.issues).toHaveLength(0)
  })

  it('弱密码被检测为 weak_password', () => {
    mockItems = [mkCred({ id: 'c1', name: 'weak', value: '123456' })]
    const r = scanAll(true)
    expect(r.code).toBe('ok')
    if (r.code !== 'ok') return
    const weak = r.report.issues.find((i) => i.type === 'weak_password')
    expect(weak).toBeTruthy()
    expect(r.report.summary.weak_password).toBe(1)
  })

  it('相同 value 被检测为 reused_password', () => {
    const pw = 'CorrectHorseBatteryStaple9!'
    mockItems = [
      mkCred({ id: 'a', name: 'A', value: pw }),
      mkCred({ id: 'b', name: 'B', value: pw })
    ]
    const r = scanAll(true)
    expect(r.code).toBe('ok')
    if (r.code !== 'ok') return
    const dups = r.report.issues.filter((i) => i.type === 'reused_password')
    expect(dups).toHaveLength(2)
    expect(r.report.summary.reused_password).toBe(2)
  })

  it('lastUsedAt 超过 180 天被检测为 stale_unused', () => {
    const oldTs = Date.now() - STALE_THRESHOLD_MS - 1000
    mockItems = [
      mkCred({
        id: 's',
        name: 'S',
        value: 'VeryStrongPwd$9Xx!',
        lastUsedAt: oldTs,
        updatedAt: oldTs
      })
    ]
    const r = scanAll(true)
    expect(r.code).toBe('ok')
    if (r.code !== 'ok') return
    const stale = r.report.issues.find((i) => i.type === 'stale_unused')
    expect(stale).toBeTruthy()
  })

  it('有 high/medium issues 时分数降低', () => {
    mockItems = [
      mkCred({ id: 'x', name: 'x', value: '111111' }) // 弱
    ]
    const r = scanAll(true)
    if (r.code !== 'ok') throw new Error('expect ok')
    expect(r.score).toBeLessThan(100)
  })

  it('缓存命中：第二次不重新计算', () => {
    mockItems = [mkCred({ id: '1', value: 'abc' })]
    const r1 = scanAll()
    mockItems = [] // 改数据
    const r2 = scanAll() // 应返回缓存，仍含 1 条
    if (r1.code !== 'ok' || r2.code !== 'ok') throw new Error()
    expect(r2.report.totalCredentials).toBe(1)
  })

  it('force=true 绕过缓存', () => {
    mockItems = [mkCred({ id: '1', value: 'abc' })]
    scanAll()
    mockItems = []
    const r = scanAll(true)
    if (r.code !== 'ok') throw new Error()
    expect(r.report.totalCredentials).toBe(0)
  })
})

describe('evaluateStrength', () => {
  it('弱密码 score 低', () => {
    const r = evaluateStrength('123456')
    expect(r.score).toBeLessThanOrEqual(1)
  })
  it('强密码 score 高', () => {
    const r = evaluateStrength('Tr0ub4dor&3xYz!QqW9')
    expect(r.score).toBeGreaterThanOrEqual(3)
  })
})
