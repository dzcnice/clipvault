/**
 * TOTP 生成器（Sprint 11 · TASK-057）
 *
 * 基于 `otpauth` 库（RFC 6238），支持 SHA1/256/512 + 6/8 位。
 */

import { TOTP, Secret } from 'otpauth'
import type { TOTPAlgorithm, TOTPCode, TOTPConfig } from '../../types/totp'

export interface TOTPGenerateOpts {
  secret: string
  algorithm?: TOTPAlgorithm
  digits?: 6 | 8
  period?: number
  /** 时间戳（ms），默认 Date.now() */
  now?: number
}

/**
 * 生成 TOTP 码。remainingMs 表示当前窗口还剩多少毫秒。
 */
export function generateTOTP(opts: TOTPGenerateOpts): TOTPCode {
  const algorithm = opts.algorithm ?? 'SHA1'
  const digits = opts.digits ?? 6
  const period = opts.period ?? 30
  const now = opts.now ?? Date.now()

  const totp = new TOTP({
    algorithm,
    digits,
    period,
    secret: Secret.fromBase32(opts.secret.replace(/\s+/g, '').toUpperCase())
  })

  const code = totp.generate({ timestamp: now })
  const periodMs = period * 1000
  const remainingMs = periodMs - (now % periodMs)

  return { code, remainingMs, periodMs }
}

/** 从 TOTPConfig 生成 */
export function generateFromConfig(
  config: TOTPConfig,
  now: number = Date.now()
): TOTPCode {
  return generateTOTP({
    secret: config.secret,
    algorithm: config.algorithm,
    digits: config.digits,
    period: config.period,
    now
  })
}

/** 校验 secret 是否合法 base32 */
export function validateSecret(secret: string): boolean {
  try {
    Secret.fromBase32(secret.replace(/\s+/g, '').toUpperCase())
    return true
  } catch {
    return false
  }
}
