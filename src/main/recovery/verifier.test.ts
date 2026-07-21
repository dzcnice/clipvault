/**
 * buildChallenge 行为测试（纯逻辑，不依赖 DB）
 */

import { describe, it, expect } from 'vitest'
import { buildChallenge } from './verifier'

const FAKE_24 = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

describe('recovery/verifier buildChallenge', () => {
  it('sequence 模式仅返回 mode', () => {
    const c = buildChallenge(FAKE_24, 'sequence')
    expect(c.mode).toBe('sequence')
    expect(c.pool).toBeUndefined()
  })

  it('pick 模式返回 48 词池且包含全部 24 真词', () => {
    const c = buildChallenge(FAKE_24, 'pick')
    expect(c.mode).toBe('pick')
    expect(c.pool?.length).toBe(48)
    for (const w of FAKE_24) {
      expect(c.pool).toContain(w)
    }
  })

  it('fill 模式生成 5..8 个空位且 masked 长度为 24', () => {
    for (let i = 0; i < 10; i++) {
      const c = buildChallenge(FAKE_24, 'fill')
      expect(c.mode).toBe('fill')
      expect(c.masked?.length).toBe(24)
      const blanks = c.blanks ?? []
      expect(blanks.length).toBeGreaterThanOrEqual(5)
      expect(blanks.length).toBeLessThanOrEqual(8)
      // 空位处 masked 应为 '___'
      for (const idx of blanks) {
        expect(c.masked?.[idx]).toBe('___')
      }
      // 非空位处 masked = 原词
      for (let j = 0; j < 24; j++) {
        if (!blanks.includes(j)) {
          expect(c.masked?.[j]).toBe(FAKE_24[j])
        }
      }
    }
  })

  it('非 24 词输入抛错', () => {
    expect(() => buildChallenge(['a', 'b'], 'pick')).toThrow()
  })
})
