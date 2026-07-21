/**
 * HaveIBeenPwned 密码泄露检查（Sprint 11 · TASK-059）
 *
 * 使用 k-anonymity：SHA1 → 前 5 位通过网络查询 → 在返回列表匹配后 35 位。
 * 不会把完整哈希发出去。User-Agent 固定 ClipVault/2.0。
 */

import { createHash } from 'node:crypto'
import { logger } from '../utils/logger'

const API_PREFIX = 'https://api.pwnedpasswords.com/range/'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface CacheEntry {
  at: number
  count: number
}

const cache = new Map<string, CacheEntry>()

/** 测试用：清空缓存 */
export function _clearHibpCache(): void {
  cache.clear()
}

/** 计算 SHA1 大写十六进制字符串 */
export function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase()
}

/**
 * 查询密码泄露次数；返回 0 表示未匹配。
 *
 * @throws 网络/服务异常时抛出
 */
export async function checkPasswordLeaked(password: string): Promise<number> {
  if (typeof password !== 'string' || password.length === 0) return 0
  const full = sha1Upper(password)
  const prefix = full.slice(0, 5)
  const suffix = full.slice(5)

  const cached = cache.get(full)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.count
  }

  const resp = await fetch(API_PREFIX + prefix, {
    method: 'GET',
    headers: {
      'User-Agent': 'ClipVault/2.0',
      'Add-Padding': 'true'
    }
  })
  if (!resp.ok) {
    logger.warn(`[hibp] HTTP ${resp.status}`)
    throw new Error(`HIBP HTTP ${resp.status}`)
  }
  const body = await resp.text()
  let count = 0
  for (const line of body.split(/\r?\n/)) {
    if (!line) continue
    const [sfx, cntStr] = line.split(':')
    if (!sfx || !cntStr) continue
    if (sfx.trim().toUpperCase() === suffix) {
      count = parseInt(cntStr.trim(), 10) || 0
      break
    }
  }
  cache.set(full, { at: Date.now(), count })
  return count
}
