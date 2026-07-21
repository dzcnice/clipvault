/**
 * fuzzy-search 基础匹配测试
 */

import { describe, it, expect } from 'vitest'
import { fuzzyMatch, fuzzySearch, highlightMatches } from './fuzzy-search'

describe('fuzzy-search', () => {
  it('完全匹配得最高分', () => {
    const r = fuzzyMatch('hello', 'hello')
    expect(r?.score).toBeGreaterThanOrEqual(1000)
  })

  it('包含匹配（开头）得分高于（中间）', () => {
    const start = fuzzyMatch('abc', 'abcxyz')
    const middle = fuzzyMatch('abc', 'xyzabcxyz')
    expect(start!.score).toBeGreaterThan(middle!.score)
  })

  it('空模式返回 score=0', () => {
    const r = fuzzyMatch('', 'anything')
    expect(r?.score).toBe(0)
  })

  it('匹配不到时返回 null', () => {
    expect(fuzzyMatch('xyz', 'abcdef')).toBeNull()
  })

  it('fuzzySearch 能在对象列表中排序', () => {
    const items = [
      { name: 'github-token' },
      { name: 'openai-key' },
      { name: 'stripe-secret' }
    ]
    const results = fuzzySearch(items, 'github', (i) => i.name)
    expect(results[0]!.item.name).toBe('github-token')
  })

  it('highlightMatches 能返回分段结构', () => {
    const parts = highlightMatches('hello world', [{ start: 6, end: 11 }])
    expect(parts).toHaveLength(2)
    expect(parts[0]!.highlighted).toBe(false)
    expect(parts[1]!.highlighted).toBe(true)
    expect(parts[1]!.text).toBe('world')
  })
})
