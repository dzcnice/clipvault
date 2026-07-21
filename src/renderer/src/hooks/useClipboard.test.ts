// @vitest-environment jsdom
/**
 * useClipboard 单元测试
 *
 * 专门覆盖搜索场景下的 loading 状态转换（fix: 列表 loading 卡死）：
 *   1. 首次加载：loading 从 true → false，items 填充
 *   2. 搜索时 filter 变化：loading 能正确从 false → true → false
 *   3. 快速连续搜索：老请求不覆盖新请求的数据（竞态防护）
 *   4. API 抛错：loading 最终仍会 reset 为 false（不会卡死）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ClipboardItem } from '@/types'
import { useClipboard } from './useClipboard'

function makeItem(id: string, keyword = ''): ClipboardItem {
  return {
    id,
    type: 'text',
    content: `${keyword}-${id}`,
    preview: `${keyword}-${id}`,
    hash: `hash-${id}`,
    size: 10,
    isPinned: false,
    isSnippet: false,
    tags: [],
    useCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  } as ClipboardItem
}

interface DeferredCall {
  resolve: (items: ClipboardItem[], total: number) => void
  reject: (err: Error) => void
  params: unknown
}

function setupApi(): {
  calls: DeferredCall[]
  api: Window['api']
  newItemCallback: { current: ((item: ClipboardItem) => void) | null }
} {
  const calls: DeferredCall[] = []
  const newItemCallback: { current: ((item: ClipboardItem) => void) | null } = {
    current: null
  }
  const api = {
    clipboard: {
      getHistory: vi.fn((params: unknown) => {
        return new Promise((resolve, reject) => {
          calls.push({
            params,
            resolve: (items, total) =>
              resolve({ success: true, data: { items, total } }),
            reject
          })
        })
      }),
      onNewItem: vi.fn((cb: (item: ClipboardItem) => void) => {
        newItemCallback.current = cb
        return () => {
          newItemCallback.current = null
        }
      }),
      deleteItem: vi.fn(),
      pinItem: vi.fn(),
      copyItem: vi.fn(),
      clearHistory: vi.fn(),
      getSnippets: vi.fn(),
      createSnippet: vi.fn()
    }
  }
  ;(window as unknown as { api: unknown }).api = api
  return { calls, api: api as unknown as Window['api'], newItemCallback }
}

describe('useClipboard - loading state transitions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('首次加载：loading 从 true 进入 false 并填充 items', async () => {
    const { calls } = setupApi()
    const { result } = renderHook(() => useClipboard())

    // mount 后立即触发 refresh → loading 应 = true
    expect(result.current.loading).toBe(true)
    expect(result.current.items).toHaveLength(0)

    // 解析第一个请求
    await act(async () => {
      calls[0].resolve([makeItem('a'), makeItem('b')], 2)
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.total).toBe(2)
  })

  it('搜索时切换 filter：loading 正确 false → true → false', async () => {
    const { calls } = setupApi()
    const initialProps = { filter: undefined as { keyword: string } | undefined }
    const { result, rerender } = renderHook(
      ({ filter }) => useClipboard({ filter }),
      { initialProps }
    )

    // 首次加载
    await act(async () => {
      calls[0].resolve([makeItem('a')], 1)
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    // 模拟用户输入搜索词："sk"
    rerender({ filter: { keyword: 'sk' } })

    // filter 变化 → 触发新 refresh → loading 应重新变 true
    await waitFor(() => expect(result.current.loading).toBe(true))

    // API 返回 1 条匹配
    await act(async () => {
      calls[1].resolve([makeItem('sk-1', 'sk')], 1)
    })

    // 关键断言：搜索完成后 loading 应回到 false（bug 场景：会卡在 true）
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.total).toBe(1)
    expect(result.current.items).toHaveLength(1)
  })

  it('快速连续搜索：老请求不覆盖新请求结果（竞态防护）', async () => {
    const { calls } = setupApi()
    const initialProps = { filter: undefined as { keyword: string } | undefined }
    const { result, rerender } = renderHook(
      ({ filter }) => useClipboard({ filter }),
      { initialProps }
    )

    // 等首次加载启动，拿到 call 0
    await waitFor(() => expect(calls.length).toBe(1))

    // 用户快速输入 "s" → "sk"：两次 rerender 触发两次请求
    rerender({ filter: { keyword: 's' } })
    await waitFor(() => expect(calls.length).toBe(2))
    rerender({ filter: { keyword: 'sk' } })
    await waitFor(() => expect(calls.length).toBe(3))

    // 乱序回包：先回"sk"（新），再回"s"（老）
    await act(async () => {
      calls[2].resolve([makeItem('sk-only')], 1)
    })
    await act(async () => {
      calls[1].resolve(
        [makeItem('s-1'), makeItem('s-2'), makeItem('s-3')],
        3
      )
    })

    // 首次加载请求也补上
    await act(async () => {
      calls[0].resolve([], 0)
    })

    // 最终 items 应保持新请求的数据（sk 的 1 条），不被老请求覆盖
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.total).toBe(1)
    expect(result.current.items[0]?.id).toBe('sk-only')
  })

  it('API 抛错时 loading 能 reset 为 false（不卡死）', async () => {
    const { calls } = setupApi()
    const { result } = renderHook(() => useClipboard())

    expect(result.current.loading).toBe(true)

    await act(async () => {
      calls[0].reject(new Error('IPC 炸了'))
      // 等 reject 被 await 吃进去
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    expect(result.current.error).toBe('IPC 炸了')
  })

  it('ρ3 · P1-9：搜索 keyword 激活时，onNewItem 不匹配的新项被忽略（不增 total 不插入）', async () => {
    const { calls, newItemCallback } = setupApi()
    const { result } = renderHook(() =>
      useClipboard({ filter: { keyword: 'sk' } })
    )
    // 首次加载：空
    await waitFor(() => expect(calls.length).toBe(1))
    await act(async () => calls[0].resolve([], 0))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(newItemCallback.current).toBeTruthy()

    // 推送不匹配的新项（content: "hello-a" 不包含 "sk"）
    await act(async () => {
      newItemCallback.current!(makeItem('a', 'hello'))
    })

    // 关键断言：被过滤器挡掉，items 和 total 都不变
    expect(result.current.items).toHaveLength(0)
    expect(result.current.total).toBe(0)

    // 推送匹配的新项（"sk-matched" 包含 "sk"）
    await act(async () => {
      newItemCallback.current!(makeItem('matched', 'sk'))
    })
    expect(result.current.items).toHaveLength(1)
    expect(result.current.total).toBe(1)
  })

  it('相同 filter 引用变化但内容不变时：不会重复无限 refresh', async () => {
    const { calls } = setupApi()
    const { rerender } = renderHook(
      ({ filter }: { filter: { keyword: string } | undefined }) =>
        useClipboard({ filter }),
      { initialProps: { filter: { keyword: 'x' } } }
    )

    await waitFor(() => expect(calls.length).toBe(1))
    await act(async () => calls[0].resolve([], 0))

    // 每次给一个新 object 但 keyword 相同 —— 稳定依赖后不应重复请求
    rerender({ filter: { keyword: 'x' } })
    rerender({ filter: { keyword: 'x' } })
    rerender({ filter: { keyword: 'x' } })

    // 给一点时间让可能的 effect 触发
    await new Promise((r) => setTimeout(r, 50))

    // 请求数保持为 1（filterKey 序列化相同）
    expect(calls.length).toBe(1)
  })
})
