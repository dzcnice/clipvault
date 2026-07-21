// @vitest-environment jsdom
/**
 * useCredentials 单元测试（搜索 loading + 竞态防护）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Credential } from '@/types'
import { useCredentials } from './useCredentials'

function makeCred(id: string): Credential {
  return {
    id,
    name: id,
    type: 'api_key',
    value: 'v-' + id,
    tags: [],
    isFavorite: false,
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now()
  } as Credential
}

interface Pending {
  resolve: (items: Credential[], total: number) => void
  reject: (e: Error) => void
}

function setupApi(): { calls: Pending[] } {
  const calls: Pending[] = []
  const api = {
    credential: {
      list: vi.fn(() => {
        return new Promise((resolve, reject) => {
          calls.push({
            resolve: (items, total) =>
              resolve({ success: true, data: { items, total } }),
            reject
          })
        })
      }),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      copy: vi.fn()
    }
  }
  ;(window as unknown as { api: unknown }).api = api
  return { calls }
}

describe('useCredentials - loading state transitions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('搜索关键词变化时 loading false → true → false，列表被更新', async () => {
    const { calls } = setupApi()
    const { result, rerender } = renderHook(
      ({ filter }: { filter?: { keyword: string } }) =>
        useCredentials({ filter }),
      { initialProps: { filter: undefined } }
    )

    // 首次加载
    expect(result.current.loading).toBe(true)
    await act(async () =>
      calls[0].resolve([makeCred('a'), makeCred('b')], 2)
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.credentials).toHaveLength(2)

    // 搜索 "sk"
    rerender({ filter: { keyword: 'sk' } })
    await waitFor(() => expect(result.current.loading).toBe(true))
    await waitFor(() => expect(calls.length).toBe(2))

    await act(async () => calls[1].resolve([makeCred('sk-x')], 1))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.total).toBe(1)
    expect(result.current.credentials).toHaveLength(1)
    expect(result.current.credentials[0]?.id).toBe('sk-x')
  })

  it('API 抛错：loading 不会卡死在 true', async () => {
    const { calls } = setupApi()
    const { result } = renderHook(() => useCredentials())

    expect(result.current.loading).toBe(true)
    await act(async () => {
      calls[0].reject(new Error('db 炸了'))
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('db 炸了')
  })

  it('稳定 filter 内容：不同引用相同 keyword 不触发重复 refresh', async () => {
    const { calls } = setupApi()
    const { rerender } = renderHook(
      ({ filter }: { filter?: { keyword: string } }) =>
        useCredentials({ filter }),
      { initialProps: { filter: { keyword: 'y' } } }
    )

    await waitFor(() => expect(calls.length).toBe(1))
    await act(async () => calls[0].resolve([], 0))

    // 相同字面量、新引用 × 3
    rerender({ filter: { keyword: 'y' } })
    rerender({ filter: { keyword: 'y' } })
    rerender({ filter: { keyword: 'y' } })
    await new Promise((r) => setTimeout(r, 50))

    expect(calls.length).toBe(1)
  })
})
