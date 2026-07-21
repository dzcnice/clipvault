/**
 * key-patterns 正则抽样测试
 */

import { describe, it, expect } from 'vitest'
import { KEY_PATTERNS, getPatternByName, getAllProviders } from './key-patterns'

describe('key-patterns', () => {
  it('KEY_PATTERNS 数组非空', () => {
    expect(KEY_PATTERNS.length).toBeGreaterThan(10)
  })

  it('getPatternByName 能取到已知模式', () => {
    const p = getPatternByName('openai_api_key')
    expect(p).toBeDefined()
    expect(p?.provider).toBe('OpenAI')
  })

  it('getPatternByName 对未知名称返回 undefined', () => {
    expect(getPatternByName('nonexistent')).toBeUndefined()
  })

  it('getAllProviders 至少包含几个常见家族', () => {
    const providers = getAllProviders()
    expect(providers).toContain('OpenAI')
    expect(providers).toContain('GitHub')
    expect(providers).toContain('AWS')
  })

  it('OpenAI key 正则能匹配长度合规的 key', () => {
    const p = getPatternByName('openai_api_key')!
    expect(p.pattern.test('sk-' + 'x'.repeat(48))).toBe(true)
    expect(p.pattern.test('sk-short')).toBe(false)
  })

  it('GitHub PAT 正则严格匹配 36 位字符', () => {
    const p = getPatternByName('github_pat')!
    expect(p.pattern.test('ghp_' + 'a'.repeat(36))).toBe(true)
    // 35 字符长度应该不匹配（36 是正则要求）
    expect(p.pattern.test('ghp_' + 'a'.repeat(10))).toBe(false)
  })

  it('【BUG-FP-1】vercel_token 只锚定 vercel_pat_/vercel_auth_ 前缀，不再误抢 sk- 前缀', () => {
    const p = getPatternByName('vercel_token')!
    // 真实 Vercel token 格式应能命中
    expect(p.pattern.test('vercel_pat_' + 'A'.repeat(32))).toBe(true)
    expect(p.pattern.test('vercel_auth_' + 'B'.repeat(32))).toBe(true)
    // 旧的误报：36 字符 sk-xxx 不应再命中 vercel
    expect(p.pattern.test('sk-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')).toBe(false)
    // 普通 24 字符纯字母数字也不应命中
    expect(p.pattern.test('A'.repeat(24))).toBe(false)
  })

  it('【BUG-FP-2】aws_secret_key 要求混合字母数字，40 位纯数字不匹配', () => {
    const p = getPatternByName('aws_secret_key')!
    // 40 位纯数字不匹配
    expect(p.pattern.test('1'.repeat(40))).toBe(false)
    // 40 位纯字母不匹配
    expect(p.pattern.test('a'.repeat(40))).toBe(false)
    // 真正的 AWS secret（混合字母数字）匹配
    expect(p.pattern.test('abCD1234efGH5678ijKL9012mnOP3456qrST7890')).toBe(true)
  })

  it('【BUG-FP-2】aws_secret_key 必须配合 requiresContext', () => {
    const p = getPatternByName('aws_secret_key')!
    expect(p.requiresContext).toBeDefined()
    expect(p.requiresContext!.length).toBeGreaterThan(0)
  })

  it('【BUG-FP-3】azure_subscription_key 配合 requiresContext', () => {
    const p = getPatternByName('azure_subscription_key')!
    expect(p.requiresContext).toBeDefined()
    expect(p.requiresContext).toContain('Ocp-Apim-Subscription-Key')
  })
})
