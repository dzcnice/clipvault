// @vitest-environment jsdom
/**
 * ρ3 · P1-6：useTOTP 切换 credentialId 时陈旧 IPC 响应被丢弃
 *
 * 安全问题：切换凭证时旧 generate 请求仍可能返回 → 若直接 setState 会把
 * 上一个凭证的 OTP 码显示在新凭证上，用户可能复制错码登录失败。
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTOTP } from './useTOTP'

interface DeferredCall {
  credentialId: string | undefined
  resolve: (code: string, remainingMs: number) => void
  reject: (err: Error) => void
}

function setupApi(): { calls: DeferredCall[] } {
  const calls: DeferredCall[] = []
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    totp: {
        generate: vi.fn((payload: { credentialId?: string }) => {
          return new Promise((resolve, reject) => {
            calls.push({
              credentialId: payload.credentialId,
              resolve: (code, remainingMs) =>
                resolve({
                  success: true,
                  data: { code, remainingMs, periodMs: 30000 }
                }),
              reject
            })
          })
        })
    }
  }
  return { calls }
}

describe('useTOTP request token', () => {
  // 注意：不用 fake timers（会阻塞 renderHook 的 microtask 调度）。
  // interval 虽然是真 timer，但测试只关注首次 refresh 的响应行为。

  it('切换 credentialId 时旧请求回包被丢弃，不污染新凭证的 code', async () => {
    const { calls } = setupApi()
    const { result, rerender } = renderHook(
      ({ cid }: { cid: string }) => useTOTP(cid),
      { initialProps: { cid: 'cred-A' } }
    )

    // 第一次渲染触发 generate({credentialId: 'cred-A'})
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1))
    expect(calls[0]?.credentialId).toBe('cred-A')

    // 切换到 cred-B
    rerender({ cid: 'cred-B' })
    await waitFor(() =>
      expect(calls.some((c) => c.credentialId === 'cred-B')).toBe(true)
    )
    const lastCall = [...calls]
      .reverse()
      .find((c) => c.credentialId === 'cred-B')!

    // 乱序回包：先回 cred-B（新），再回 cred-A（旧）
    await act(async () => {
      lastCall.resolve('BBBBBB', 25000)
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.code).toBe('BBBBBB'))

    // 旧请求迟到回包 "AAAAAA" —— 应被 token 过滤丢弃
    await act(async () => {
      calls[0]!.resolve('AAAAAA', 20000)
      await Promise.resolve()
    })

    // code 保持新凭证的值
    expect(result.current.code).toBe('BBBBBB')
  })

  it('空 credentialId 不调用 api', () => {
    const { calls } = setupApi()
    renderHook(() => useTOTP(undefined))
    expect(calls).toHaveLength(0)
  })

  it('catch IPC 抛错后设置 error 状态', async () => {
    const { calls } = setupApi()
    const { result } = renderHook(() => useTOTP('cred-X'))
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1))
    await act(async () => {
      calls[0]!.reject(new Error('IPC boom'))
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.error).toBe('IPC boom'))
  })
})
