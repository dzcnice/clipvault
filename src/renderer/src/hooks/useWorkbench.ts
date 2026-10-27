import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiResponse } from '@/types'
import type { WorkbenchSnapshot } from '@/types/workbench'
import { showPixelToast } from '../components/PixelToast'

export async function unwrap<T>(response: Promise<ApiResponse<T>>): Promise<T> {
  const result = await response
  if (!result.success) throw new Error(result.error || '操作失败，请重试')
  return result.data as T
}
export function useWorkbench(): {
  data: WorkbenchSnapshot | null; error: string; loading: boolean; busy: boolean
  refresh: () => Promise<void>; act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined>
} {
  const [data, setData] = useState<WorkbenchSnapshot | null>(null), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const revision = useRef(0), alive = useRef(true), acting = useRef(false)
  const refresh = useCallback(async () => {
    const current = ++revision.current
    try { const result = await unwrap(window.api.workbench.snapshot()); if (alive.current && current === revision.current) { setData(result); setError('') } }
    catch (error) { if (alive.current && current === revision.current) setError(error instanceof Error ? error.message : '无法连接本地工作台') }
    finally { if (alive.current && current === revision.current) setLoading(false) }
  }, [])
  useEffect(() => { alive.current = true; void refresh(); const off = window.api.workbench.onChanged(() => { void refresh() }); return () => { alive.current = false; off() } }, [refresh])
  const act = async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
    if (acting.current) return undefined
    acting.current = true; setBusy(true); setError('')
    try { const value = await action(); if (success) showPixelToast(success); await refresh(); return value }
    catch (error) { if (alive.current) setError(error instanceof Error ? error.message : '操作失败，请重试'); return undefined }
    finally { acting.current = false; if (alive.current) setBusy(false) }
  }
  return { data, error, loading, busy, refresh, act }
}
