/**
 * 凭证健康检查（Sprint 11 · TASK-059）
 *
 * - 需 vault 已解锁，否则返回 session_required
 * - 弱密码：zxcvbn score < 3
 * - 重复：同 SHA256 值多条
 * - 陈旧：180 天未使用
 * - 结果缓存 1 小时
 */

import { createHash } from 'node:crypto'
import zxcvbn from 'zxcvbn'
import * as vault from '../crypto/vault'
import { listCredentials } from '../../db/credential-store'
import { logger } from '../utils/logger'
import type {
  HealthIssue,
  HealthIssueType,
  HealthReport
} from '../../types/health'
import type { HealthScanResult, CachedScan } from './types'

export const STALE_THRESHOLD_MS = 180 * 24 * 60 * 60 * 1000
export const CACHE_TTL_MS = 60 * 60 * 1000

let cached: CachedScan | null = null

/** 清除缓存（测试 & 强制刷新用） */
export function clearCache(): void {
  cached = null
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

function computeScore(
  total: number,
  issues: HealthIssue[]
): number {
  if (total === 0) return 100
  // 每个 high -10, medium -5, low -2，下限 0
  let penalty = 0
  for (const i of issues) {
    if (i.severity === 'high') penalty += 10
    else if (i.severity === 'medium') penalty += 5
    else penalty += 2
  }
  const score = Math.max(0, 100 - Math.round(penalty))
  return score
}

/** 扫描全部凭证 */
export function scanAll(force = false): HealthScanResult {
  if (!vault.isUnlocked()) {
    return { code: 'session_required' }
  }

  const now = Date.now()
  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.result
  }

  try {
    const { items } = listCredentials(undefined, undefined, undefined)
    const issues: HealthIssue[] = []
    const summary: Record<HealthIssueType, number> = {
      weak_password: 0,
      reused_password: 0,
      stale_unused: 0,
      pwned: 0
    }

    // 1) 弱密码
    const hashMap = new Map<string, string[]>() // hash -> credentialIds
    for (const c of items) {
      // 跳过没有值或解密失败的
      if (!c.value) continue

      try {
        const z = zxcvbn(c.value)
        if (z.score < 3) {
          issues.push({
            credentialId: c.id,
            credentialName: c.name,
            type: 'weak_password',
            severity: z.score <= 1 ? 'high' : 'medium',
            message: `密码强度偏弱（zxcvbn=${z.score}）`,
            meta: { score: z.score }
          })
          summary.weak_password += 1
        }
      } catch (err) {
        logger.warn('[health] zxcvbn failed:', (err as Error).message)
      }

      // 2) 收集 hash 用于重复检测
      const h = sha256(c.value)
      const arr = hashMap.get(h) ?? []
      arr.push(c.id)
      hashMap.set(h, arr)

      // 3) 陈旧
      const lastUsed = c.lastUsedAt ?? c.updatedAt
      if (now - lastUsed > STALE_THRESHOLD_MS) {
        issues.push({
          credentialId: c.id,
          credentialName: c.name,
          type: 'stale_unused',
          severity: 'low',
          message: `已 ${Math.floor(
            (now - lastUsed) / (24 * 60 * 60 * 1000)
          )} 天未使用`,
          meta: { daysSince: Math.floor((now - lastUsed) / (24 * 60 * 60 * 1000)) }
        })
        summary.stale_unused += 1
      }
    }

    // 2) 重复分组
    for (const [h, ids] of hashMap.entries()) {
      if (ids.length < 2) continue
      for (const id of ids) {
        const c = items.find((x: { id: string }) => x.id === id)
        if (!c) continue
        issues.push({
          credentialId: id,
          credentialName: c.name,
          type: 'reused_password',
          severity: 'high',
          message: `与其他 ${ids.length - 1} 个凭证共用相同密码`,
          meta: { groupHash: h.slice(0, 8), groupSize: ids.length }
        })
        summary.reused_password += 1
      }
    }

    const report: HealthReport = {
      generatedAt: now,
      totalCredentials: items.length,
      scannedCredentials: items.filter((c: { value?: string }) => !!c.value).length,
      issues,
      summary
    }

    const score = computeScore(items.length, issues)
    const result: HealthScanResult = { code: 'ok', report, score }
    cached = { at: now, result }
    return result
  } catch (err) {
    logger.error('[health] scanAll failed:', err)
    return { code: 'error', error: (err as Error).message }
  }
}

/** 仅对单一值跑弱度检查（给 UI 强度计使用） */
export function evaluateStrength(value: string): {
  score: 0 | 1 | 2 | 3 | 4
  feedback: string[]
} {
  const z = zxcvbn(value || '')
  const feedback: string[] = []
  if (z.feedback?.warning) feedback.push(z.feedback.warning)
  for (const s of z.feedback?.suggestions ?? []) feedback.push(s)
  return { score: z.score as 0 | 1 | 2 | 3 | 4, feedback }
}
