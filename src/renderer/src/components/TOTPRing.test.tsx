// @vitest-environment jsdom
/**
 * TOTPRing 单元测试
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { TOTPRing } from './TOTPRing'

function setupApi(code: string, remainingMs: number, periodMs = 30000): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    sprint11: {
      totp: {
        generate: vi.fn(async () => ({
          success: true,
          data: { code, remainingMs, periodMs }
        }))
      }
    }
  }
}

describe('TOTPRing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('初始占位显示 ------', () => {
    setupApi('123456', 25000)
    const { container } = render(<TOTPRing credentialId="cred-1" />)
    // 未完成 refresh 之前显示占位
    expect(container.textContent).toContain('------')
  })

  it('异步 refresh 后渲染 6 位 code', async () => {
    setupApi('123456', 25000)
    const { container } = render(<TOTPRing credentialId="cred-1" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('123456')
  })

  it('剩余 < 5s 时颜色为红色(#ef4444)', async () => {
    setupApi('111222', 3000)
    const { container } = render(<TOTPRing credentialId="cred-2" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const circles = container.querySelectorAll('circle')
    // 第二个 circle 是动态 stroke
    const stroke = circles[1]?.getAttribute('stroke')
    expect(stroke).toBe('#ef4444')
  })

  it('剩余 >= 5s 时颜色为绿色(#10b981)', async () => {
    setupApi('111222', 20000)
    const { container } = render(<TOTPRing credentialId="cred-3" />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const circles = container.querySelectorAll('circle')
    expect(circles[1]?.getAttribute('stroke')).toBe('#10b981')
  })

  it('stroke-dashoffset 随 remainingMs 变化', async () => {
    setupApi('111222', 15000, 30000)
    const { container } = render(<TOTPRing credentialId="cred-4" size={96} strokeWidth={6} />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const circles = container.querySelectorAll('circle')
    const offset = Number(circles[1]?.getAttribute('stroke-dashoffset'))
    // ratio=0.5 -> offset = circumference * 0.5
    const radius = (96 - 6) / 2
    const circumference = 2 * Math.PI * radius
    expect(offset).toBeCloseTo(circumference * 0.5, 1)
  })

  it('无 credentialId 不调用 api', () => {
    const gen = vi.fn()
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      sprint11: { totp: { generate: gen } }
    }
    render(<TOTPRing credentialId="" />)
    expect(gen).not.toHaveBeenCalled()
  })
})
