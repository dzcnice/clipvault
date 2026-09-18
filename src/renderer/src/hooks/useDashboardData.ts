/**
 * Dashboard 数据聚合 hook（v2.0 Sprint 5 · TASK-027）
 *
 * 每 30s 自动刷新；各卡片独立 loading/error 状态。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardItem, Credential, WorkspaceContext } from '@/types'
import { CredentialSortBy, SortDirection } from '@/types'

interface CardState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export interface DashboardData {
  todayClips: CardState<{ count: number; items: ClipboardItem[] }>
  recentCredentials: CardState<{ items: Credential[]; total: number }>
  snippets: CardState<{ total: number }>
}

const initial = <T,>(): CardState<T> => ({ data: null, loading: true, error: null })

const ONE_DAY = 24 * 60 * 60 * 1000

export function useDashboardData(
  pollMs: number = 30_000,
  workspace: WorkspaceContext = 'personal'
): {
  data: DashboardData
  refreshAll: () => Promise<void>
} {
  const [todayClips, setTodayClips] = useState<DashboardData['todayClips']>(initial())
  const [recentCredentials, setRecentCredentials] =
    useState<DashboardData['recentCredentials']>(initial())
  const [snippets, setSnippets] = useState<DashboardData['snippets']>(initial())
  const mounted = useRef(true)

  // v2.1 · 以 ref 承载 workspace，避免各 load 回调的依赖抖动
  const workspaceRef = useRef<WorkspaceContext>(workspace)
  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  const loadTodayClips = useCallback(async (): Promise<void> => {
    try {
      const res = await window.api.clipboard.getHistory({
        filter: { startTime: Date.now() - ONE_DAY },
        limit: 8,
        workspace: workspaceRef.current
      })
      if (!mounted.current) return
      if (res.success && res.data) {
        setTodayClips({
          data: { count: res.data.total, items: res.data.items.slice(0, 5) },
          loading: false,
          error: null
        })
      } else {
        setTodayClips({ data: null, loading: false, error: res.error ?? '加载失败' })
      }
    } catch (err) {
      if (!mounted.current) return
      setTodayClips({ data: null, loading: false, error: String(err) })
    }
  }, [])

  const loadRecentCredentials = useCallback(async (): Promise<void> => {
    try {
      const res = await window.api.credential.list({
        sortBy: CredentialSortBy.UPDATED_AT,
        sortDir: SortDirection.DESC,
        limit: 5,
        workspace: workspaceRef.current
      })
      if (!mounted.current) return
      if (res.success && res.data) {
        setRecentCredentials({
          data: { items: res.data.items, total: res.data.total },
          loading: false,
          error: null
        })
      } else {
        setRecentCredentials({ data: null, loading: false, error: res.error ?? '加载失败' })
      }
    } catch (err) {
      if (!mounted.current) return
      setRecentCredentials({ data: null, loading: false, error: String(err) })
    }
  }, [])

  const loadSnippets = useCallback(async (): Promise<void> => {
    try {
      const res = await window.api.clipboard.getSnippets({
        workspace: workspaceRef.current
      })
      if (!mounted.current) return
      if (res.success && res.data) {
        setSnippets({
          data: { total: res.data.length },
          loading: false,
          error: null
        })
      } else {
        setSnippets({ data: null, loading: false, error: res.error ?? '加载失败' })
      }
    } catch (err) {
      if (!mounted.current) return
      setSnippets({ data: null, loading: false, error: String(err) })
    }
  }, [])

  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([loadTodayClips(), loadRecentCredentials(), loadSnippets()])
  }, [loadTodayClips, loadRecentCredentials, loadSnippets])

  // ρ3：用 ref 保存最新 refreshAll，interval 只在 pollMs 变化时重建，
  // 避免各 load 回调的引用抖动导致 30s 轮询被频繁清掉重置。
  const refreshAllRef = useRef(refreshAll)
  useEffect(() => {
    refreshAllRef.current = refreshAll
  }, [refreshAll])

  useEffect(() => {
    mounted.current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshAllRef.current()
    const timer = setInterval(() => {
      void refreshAllRef.current()
    }, pollMs)
    return () => {
      mounted.current = false
      clearInterval(timer)
    }
  }, [pollMs])

  // v2.1 · workspace 改变时立即重新拉一次（不等下一个 poll 周期）
  useEffect(() => {
    void refreshAllRef.current()
  }, [workspace])

  return {
    data: { todayClips, recentCredentials, snippets },
    refreshAll
  }
}
