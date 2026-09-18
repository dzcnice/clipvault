// @vitest-environment jsdom
/**
 * PasswordStrengthMeter 单元测试（debounce + 评分颜色）
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { PasswordStrengthMeter } from './PasswordStrengthMeter'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']
const LABELS = ['极弱', '弱', '中等', '强', '极强']

function mockApi(score: number, feedback: string[] = []): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    password: {
      evaluateStrength: vi.fn(async () => ({
        success: true,
        data: { score, feedback }
      }))
    }
  }
}

describe('PasswordStrengthMeter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('空密码显示 0 分（极弱）', () => {
    mockApi(0)
    const { container } = render(<PasswordStrengthMeter value="" />)
    expect(container.textContent).toContain(LABELS[0])
  })

  it('弱密码显示红色标签（score=1）', async () => {
    mockApi(1)
    const { container } = render(<PasswordStrengthMeter value="123" />)
    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })
    expect(container.textContent).toContain(LABELS[1])
    // 找到文字标签 div（含 LABELS[1]）
    const labelDiv = Array.from(container.querySelectorAll('div')).find(
      (d) => d.children.length === 0 && d.textContent === LABELS[1]
    ) as HTMLElement | undefined
    const styleAttr = (labelDiv?.getAttribute('style') ?? '').replace(/\s/g, '')
    // COLORS[1] = #f97316 = rgb(249,115,22)
    expect(styleAttr).toContain('rgb(249,115,22)')
  })

  it('强密码显示绿色（score=4）', async () => {
    mockApi(4, [])
    const { container } = render(
      <PasswordStrengthMeter value="CorrectHorseBatteryStaple!2024" />
    )
    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })
    expect(container.textContent).toContain(LABELS[4])
    // 标签颜色应为 COLORS[4] (#10b981)
    const labelDiv = Array.from(container.querySelectorAll('div')).find(
      (d) => d.children.length === 0 && d.textContent === LABELS[4]
    ) as HTMLElement | undefined
    const styleAttr = (labelDiv?.getAttribute('style') ?? '').replace(/\s/g, '')
    expect(styleAttr).toContain('rgb(16,185,129)')
  })

  it('debounce 150ms：< 150ms 不触发 api', async () => {
    const ev = vi.fn(async () => ({
      success: true,
      data: { score: 2, feedback: [] }
    }))
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      password: { evaluateStrength: ev }
    }
    render(<PasswordStrengthMeter value="abc" />)
    vi.advanceTimersByTime(100)
    expect(ev).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(60)
      await Promise.resolve()
    })
    expect(ev).toHaveBeenCalledTimes(1)
  })

  it('反馈 > 3 条只渲染前 3 条', async () => {
    mockApi(2, ['a', 'b', 'c', 'd', 'e'])
    const { container } = render(<PasswordStrengthMeter value="abc" />)
    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })
    const items = container.querySelectorAll('ul li')
    expect(items.length).toBeLessThanOrEqual(3)
  })

  it('value 变化取消前一次 pending 评估（最后一次为准）', async () => {
    const ev = vi.fn(async (v: string) => ({
      success: true,
      data: { score: v.length > 5 ? 3 : 1, feedback: [] }
    }))
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      password: { evaluateStrength: ev }
    }
    const { rerender } = render(<PasswordStrengthMeter value="ab" />)
    vi.advanceTimersByTime(100)
    rerender(<PasswordStrengthMeter value="abcdefg" />)
    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })
    // 只触发一次（最后一次）
    expect(ev).toHaveBeenCalledTimes(1)
    expect(ev).toHaveBeenLastCalledWith('abcdefg')
  })

  it('颜色数组长度匹配', () => {
    expect(COLORS).toHaveLength(5)
    expect(LABELS).toHaveLength(5)
  })
})
