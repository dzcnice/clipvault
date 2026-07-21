/**
 * useShortcuts：v2.0 Sprint 1 预留 hook（TASK-007）
 *
 * v2 Sprint 7 的 TASK-039 会在设置页实现真实 UI。
 * 当前仅提供查询 / 更新 / 重置三个方法和 records 状态。
 */

import { useCallback, useEffect, useState } from 'react'
import type { ShortcutCommandId, ShortcutRecord } from '@/types'

export interface UseShortcutsReturn {
  records: ShortcutRecord[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setAccelerator: (commandId: ShortcutCommandId, accelerator: string) => Promise<boolean>
  reset: (commandId?: ShortcutCommandId) => Promise<void>
}

export function useShortcuts(): UseShortcutsReturn {
  const [records, setRecords] = useState<ShortcutRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    // ρ3：补 catch + setError，避免 IPC 失败时 records 为空且用户无法感知
    try {
      const res = await window.api.shortcuts.list()
      setRecords(res.data ?? [])
      setError(null)
    } catch (err) {
      setError((err as Error).message ?? 'shortcuts.list failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const setAccelerator = useCallback(
    async (commandId: ShortcutCommandId, accelerator: string): Promise<boolean> => {
      try {
        const res = await window.api.shortcuts.set({ commandId, accelerator })
        if (res.data) setRecords(res.data)
        return res.success === true
      } catch (err) {
        setError((err as Error).message ?? 'shortcuts.set failed')
        return false
      }
    },
    []
  )

  const reset = useCallback(async (commandId?: ShortcutCommandId): Promise<void> => {
    try {
      const res = await window.api.shortcuts.reset({ commandId })
      if (res.data) setRecords(res.data)
    } catch (err) {
      setError((err as Error).message ?? 'shortcuts.reset failed')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { records, loading, error, refresh, setAccelerator, reset }
}
