/**
 * otpauth:// URI 解析器（Sprint 11 · TASK-057）
 *
 * 仅支持 TOTP，不支持 HOTP。
 * 规范参考 https://github.com/google/google-authenticator/wiki/Key-Uri-Format
 */

import type { OtpauthParseResult, TOTPAlgorithm } from '../../types/totp'

const BASE32_RE = /^[A-Z2-7=\s]+$/i

function normalizeSecret(raw: string): string {
  const s = raw.replace(/\s+/g, '').toUpperCase()
  if (!s) throw new Error('otpauth: secret 为空')
  if (!BASE32_RE.test(s)) throw new Error('otpauth: secret 非 base32 字符')
  return s.replace(/=+$/, '')
}

function parseAlgorithm(raw: string | null): TOTPAlgorithm {
  if (!raw) return 'SHA1'
  const v = raw.toUpperCase()
  if (v === 'SHA1' || v === 'SHA256' || v === 'SHA512') return v
  throw new Error(`otpauth: 不支持的 algorithm = ${raw}`)
}

function parseDigits(raw: string | null): 6 | 8 {
  if (!raw) return 6
  const n = Number(raw)
  if (n !== 6 && n !== 8) throw new Error(`otpauth: digits 只支持 6/8，收到 ${raw}`)
  return n as 6 | 8
}

function parsePeriod(raw: string | null): number {
  if (!raw) return 30
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > 600) {
    throw new Error(`otpauth: period 非法 = ${raw}`)
  }
  return n
}

export function parseOtpauthURI(uri: string): OtpauthParseResult {
  if (typeof uri !== 'string' || !uri.startsWith('otpauth://')) {
    throw new Error('otpauth: URI 必须以 otpauth:// 开头')
  }

  // URL 类会把 "otpauth://totp/Issuer:alice?secret=..." 中的 host=totp
  const url = new URL(uri)
  if (url.host.toLowerCase() !== 'totp') {
    throw new Error(`otpauth: 仅支持 totp 类型，收到 ${url.host}`)
  }

  // label 形如 /Issuer:account 或 /account
  const labelRaw = decodeURIComponent(url.pathname.replace(/^\//, ''))
  let issuerFromLabel = ''
  let account = labelRaw
  const colonIdx = labelRaw.indexOf(':')
  if (colonIdx >= 0) {
    issuerFromLabel = labelRaw.slice(0, colonIdx).trim()
    account = labelRaw.slice(colonIdx + 1).trim()
  }

  const params = url.searchParams
  const secretRaw = params.get('secret')
  if (!secretRaw) throw new Error('otpauth: 缺少 secret 参数')
  const secret = normalizeSecret(secretRaw)
  const issuerQ = params.get('issuer') ?? ''
  const issuer = issuerQ || issuerFromLabel || undefined
  const algorithm = parseAlgorithm(params.get('algorithm'))
  const digits = parseDigits(params.get('digits'))
  const period = parsePeriod(params.get('period'))

  return {
    secret,
    issuer,
    account: account || undefined,
    algorithm,
    digits,
    period
  }
}

/** 反向构造 otpauth URI（导出/二维码场景） */
export function buildOtpauthURI(opts: {
  secret: string
  issuer?: string
  account?: string
  algorithm?: TOTPAlgorithm
  digits?: 6 | 8
  period?: number
}): string {
  const issuer = opts.issuer ?? ''
  const account = opts.account ?? ''
  const label = issuer && account ? `${issuer}:${account}` : account || issuer
  const params = new URLSearchParams()
  params.set('secret', opts.secret)
  if (issuer) params.set('issuer', issuer)
  params.set('algorithm', opts.algorithm ?? 'SHA1')
  params.set('digits', String(opts.digits ?? 6))
  params.set('period', String(opts.period ?? 30))
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}
