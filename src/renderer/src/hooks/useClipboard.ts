/**
 * 剪贴板管理 React Hook
 *
 * 修复（TASK-loading-fix）：
 *   1. filter 对象引用不稳定问题 → 序列化为 JSON key 作为依赖
 *   2. 加入 cancelled flag 防止异步竞态（快速切换搜索词时老请求覆盖新请求）
 *   3. refresh 始终走 try/catch/finally，保证 loading 最终 reset
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  ClipboardItem,
  ClipboardFilter,
  CreateSnippetInput,
  WorkspaceContext
} from '@/types'

/**
 * ρ3 · P1-9：onNewItem 推送项与过滤器匹配判断
 * 过滤激活时若新项不匹配，不插入列表也不增 total，避免"搜索 sk- 突然冒出无关项"。
 */
function matchesFilter(item: ClipboardItem, f: ClipboardFilter): boolean {
  if (f.keyword && f.keyword.trim().length > 0) {
    const kw = f.keyword.toLowerCase()
    const content = (item.content ?? '').toLowerCase()
    if (!content.includes(kw)) return false
  }
  if (f.type && item.type !== f.type) return false
  if (f.pinnedOnly && !item.isPinned) return false
  if (f.snippetsOnly && !item.isSnippet) return false
  if (f.detectedKeyType && item.detectedKeyType !== f.detectedKeyType) return false
  if (f.startTime && typeof item.createdAt === 'number' && item.createdAt < f.startTime) return false
  if (f.endTime && typeof item.createdAt === 'number' && item.createdAt > f.endTime) return false
  if (f.tags && f.tags.length > 0) {
    const tags = item.tags ?? []
    if (!f.tags.every((t) => tags.includes(t))) return false
  }
  return true
}

interface UseClipboardOptions {
  filter?: ClipboardFilter
  limit?: number
  /** v3：固定 personal；入参保留兼容，IPC 层强制 personal */
  workspace?: WorkspaceContext
}

interface UseClipboardReturn {
  items: ClipboardItem[]
  total: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  deleteItem: (id: string) => Promise<boolean>
  pinItem: (id: string) => Promise<boolean>
  copyItem: (id: string, opts?: { mode?: 'both' | 'path' | 'image' }) => Promise<boolean>
  clearHistory: () => Promise<number>
}

export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const [items, setItems] = useState<ClipboardItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { filter, limit = 100, workspace = 'personal' } = options

  // 用 ref 保留最新 filter，避免 refresh 的依赖随每次 render 新对象而变
  const filterRef = useRef<ClipboardFilter | undefined>(filter)
  filterRef.current = filter
  const workspaceRef = useRef<WorkspaceContext>(workspace)
  workspaceRef.current = workspace

  // 把 filter + workspace 序列化成稳定字符串，用它作为 useEffect 依赖
  const filterKey = (filter ? JSON.stringify(filter) : '') + `|${workspace}`

  // 每次调用 refresh 自增 token，回包时若 token 过期则丢弃结果
  const requestTokenRef = useRef(0)

  const refresh = useCallback(async () => {
    const myToken = ++requestTokenRef.current
    setLoading(true)
    setError(null)

    try {
      const response = await window.api.clipboard.getHistory({
        filter: filterRef.current,
        limit,
        workspace: workspaceRef.current
      })

      // 请求已被新请求覆盖，丢弃结果（避免老请求覆盖新数据）
      if (myToken !== requestTokenRef.current) return

      if (response.success && response.data) {
        setItems(response.data.items)
        setTotal(response.data.total)
      } else {
        setError(response.error || '获取剪贴板历史失败')
      }
    } catch (err) {
      if (myToken !== requestTokenRef.current) return
      setError((err as Error).message)
    } finally {
      if (myToken === requestTokenRef.current) {
        setLoading(false)
      }
    }
  }, [limit])

  // 监听新的剪贴板内容
  // 搜索 / 类型过滤激活时，新项若不匹配则不插入列表
  // v3 个人版：始终 personal，直接吸收监控推送
  useEffect(() => {
    const unsubscribe = window.api.clipboard.onNewItem((item) => {
      const currentFilter = filterRef.current
      if (currentFilter && !matchesFilter(item, currentFilter)) {
        // 过滤激活且新项不匹配 → 忽略推送，等用户清掉过滤或 refresh
        return
      }
      setItems((prev) => {
        // 避免重复
        const exists = prev.find((i) => i.id === item.id)
        if (exists) {
          return prev
        }
        // 添加到开头（置顶的保持在前）
        const pinned = prev.filter((i) => i.isPinned)
        const unpinned = prev.filter((i) => !i.isPinned)
        return [...pinned, item, ...unpinned].slice(0, limit)
      })
      setTotal((prev) => prev + 1)
    })

    return () => {
      unsubscribe()
    }
  }, [limit])

  // filter 变化时触发 refresh（依赖稳定字符串而非对象引用）
  useEffect(() => {
    refresh()
    // filterKey 变化 → refresh；refresh 依赖 limit，limit 变 → 也 refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, refresh])

  const deleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await window.api.clipboard.deleteItem(id)
        if (response.success) {
          setItems((prev) => prev.filter((item) => item.id !== id))
          setTotal((prev) => Math.max(0, prev - 1))
          return true
        }
        setError(response.error || '删除失败')
        return false
      } catch (err) {
        setError((err as Error).message)
        return false
      }
    },
    []
  )

  const pinItem = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await window.api.clipboard.pinItem(id)
      if (response.success) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, isPinned: response.data ?? !item.isPinned } : item
          )
        )
        return response.data ?? false
      }
      setError(response.error || '操作失败')
      return false
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }, [])

  const copyItem = useCallback(
    async (
      id: string,
      opts?: { mode?: 'both' | 'path' | 'image' }
    ): Promise<boolean> => {
      try {
        const response = await window.api.clipboard.copyItem(id, opts)
        if (response.success) {
          return true
        }
        setError(response.error || '复制失败')
        return false
      } catch (err) {
        setError((err as Error).message)
        return false
      }
    },
    []
  )

  const clearHistory = useCallback(async (): Promise<number> => {
    try {
      const response = await window.api.clipboard.clearHistory()
      if (response.success) {
        await refresh()
        return response.data ?? 0
      }
      setError(response.error || '清空失败')
      return 0
    } catch (err) {
      setError((err as Error).message)
      return 0
    }
  }, [refresh])

  return {
    items,
    total,
    loading,
    error,
    refresh,
    deleteItem,
    pinItem,
    copyItem,
    clearHistory
  }
}

/**
 * 快速片段管理 Hook
 *
 * v2.1 · workspace 参数决定读写目标工作区；缺省 personal。
 */
export function useSnippets(options: { workspace?: WorkspaceContext } = {}) {
  const { workspace = 'personal' } = options
  const [snippets, setSnippets] = useState<ClipboardItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestTokenRef = useRef(0)
  const workspaceRef = useRef<WorkspaceContext>(workspace)
  workspaceRef.current = workspace

  const refresh = useCallback(async () => {
    const myToken = ++requestTokenRef.current
    setLoading(true)
    setError(null)

    try {
      const response = await window.api.clipboard.getSnippets({
        workspace: workspaceRef.current
      })
      if (myToken !== requestTokenRef.current) return
      if (response.success && response.data) {
        setSnippets(response.data)
      } else {
        setError(response.error || '获取快速片段失败')
      }
    } catch (err) {
      if (myToken !== requestTokenRef.current) return
      setError((err as Error).message)
    } finally {
      if (myToken === requestTokenRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    refresh()
    // 切换 workspace 时触发 refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, workspace])

  const createSnippet = useCallback(
    async (input: CreateSnippetInput): Promise<ClipboardItem | null> => {
      try {
        const response = await window.api.clipboard.createSnippet({
          ...input,
          workspace: workspaceRef.current
        })
        if (response.success && response.data) {
          await refresh()
          return response.data
        }
        setError(response.error || '创建片段失败')
        return null
      } catch (err) {
        setError((err as Error).message)
        return null
      }
    },
    [refresh]
  )

  const copySnippet = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await window.api.clipboard.copyItem(id)
      return response.success
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }, [])

  const deleteSnippet = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await window.api.clipboard.deleteItem(id)
        if (response.success) {
          await refresh()
          return true
        }
        return false
      } catch (err) {
        setError((err as Error).message)
        return false
      }
    },
    [refresh]
  )

  return {
    snippets,
    loading,
    error,
    refresh,
    createSnippet,
    copySnippet,
    deleteSnippet
  }
}
