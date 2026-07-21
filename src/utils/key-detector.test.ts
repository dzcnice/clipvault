/**
 * key-detector 单元测试
 * 覆盖至少 6 种主流密钥识别
 */

import { describe, it, expect } from 'vitest'
import { detectKey, detectAllKeys, mightContainSensitive } from './key-detector'

describe('key-detector', () => {
  it('OpenAI API Key 能识别', () => {
    const r = detectKey('sk-' + 'a'.repeat(48))
    expect(r.detected).toBe(true)
    expect(r.pattern?.name).toContain('openai')
  })

  it('Anthropic API Key 能识别', () => {
    const r = detectKey('sk-ant-api' + 'b'.repeat(40))
    expect(r.detected).toBe(true)
    expect(r.pattern?.provider).toBe('Anthropic')
  })

  it('GitHub PAT 能识别', () => {
    const r = detectKey('ghp_' + 'c'.repeat(36))
    expect(r.detected).toBe(true)
    expect(r.pattern?.provider).toBe('GitHub')
  })

  it('AWS Access Key 能识别', () => {
    const r = detectKey('AKIA' + 'DEFGHIJKLMNOPQRS')
    expect(r.detected).toBe(true)
    expect(r.pattern?.provider).toBe('AWS')
  })

  it('SSH 私钥能识别', () => {
    const txt = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCA...\n-----END RSA PRIVATE KEY-----'
    const r = detectKey(txt)
    expect(r.detected).toBe(true)
    expect(r.pattern?.name).toContain('ssh')
  })

  it('JWT Token 能识别', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTYifQ.signaturepart'
    const r = detectKey(jwt)
    expect(r.detected).toBe(true)
  })

  it('PostgreSQL 连接串能识别', () => {
    const r = detectKey('postgres://user:pass@localhost:5432/mydb')
    expect(r.detected).toBe(true)
    expect(r.pattern?.suggestedType).toBe('database')
  })

  it('空或过短文本不识别', () => {
    expect(detectKey('').detected).toBe(false)
    expect(detectKey('abc').detected).toBe(false)
  })

  it('mightContainSensitive 能快速判断', () => {
    expect(mightContainSensitive('ghp_' + 'x'.repeat(36))).toBe(true)
    expect(mightContainSensitive('nothing special')).toBe(false)
  })

  it('detectAllKeys 返回多个不重叠匹配', () => {
    const text = `Here is a GitHub PAT: ghp_${'a'.repeat(36)} and AWS: AKIA${'B'.repeat(16)}`
    const { results } = detectAllKeys(text)
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  describe('误报修复（τ2 回归）', () => {
    it('【BUG-FP-1】36 字符 sk-xxx 识别为 openai_api_key（不是 vercel）', () => {
      const text = 'sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
      const r = detectKey(text)
      expect(r.detected).toBe(true)
      expect(r.pattern?.name).toBe('openai_api_key')
    })

    it('【BUG-FP-2】40 位纯数字不识别为 aws_secret', () => {
      const text = '1234567890123456789012345678901234567890'
      const { results } = detectAllKeys(text)
      const names = results.map((r) => r.pattern?.name)
      expect(names).not.toContain('aws_secret_key')
    })

    it('【BUG-FP-2】真实 AWS secret + 上下文关键词被识别', () => {
      const secret = 'abCD1234efGH5678ijKL9012mnOP3456qrST7890'
      const { results } = detectAllKeys(`AWS_SECRET=${secret}`)
      const names = results.map((r) => r.pattern?.name)
      expect(names).toContain('aws_secret_key')
    })

    it('【BUG-FP-3】32 位 hex（无 Azure 上下文）不识别为 azure_subscription', () => {
      const hex32 = 'a'.repeat(32)
      const { results } = detectAllKeys(`git commit ${hex32}`)
      const names = results.map((r) => r.pattern?.name)
      expect(names).not.toContain('azure_subscription_key')
    })

    it('【BUG-FP-3】32 位 hex + Ocp-Apim-Subscription-Key 上下文被识别', () => {
      const hex32 = 'abcdef0123456789abcdef0123456789'
      const { results } = detectAllKeys(`Ocp-Apim-Subscription-Key: ${hex32}`)
      const names = results.map((r) => r.pattern?.name)
      expect(names).toContain('azure_subscription_key')
    })

    it('带 vercel_pat_ 前缀的 token 正确识别为 vercel_token', () => {
      const token = 'vercel_pat_' + 'X'.repeat(32)
      const r = detectKey(token)
      expect(r.detected).toBe(true)
      expect(r.pattern?.name).toBe('vercel_token')
    })
  })
})
