/**
 * useHealthReport (Sprint 11 · TASK-059)
 */

import { useCallback, useEffect, useState } from 'react'
import type { HealthReport, HealthReportStatus } from '../../../types/health'

interface Sprint11HealthAPI {
  report: (
    force?: boolean
  ) => Promise<{ success: boolean; data?: HealthReportStatus; error?: string }>
  checkHibp: (
    password: string
  ) => Promise<{
    success: boolean
    data?: { pwned: boolean; count: number }
    error?: string
  }>
}

function getApi(): Sprint11HealthAPI | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint11?: { health?: Sprint11HealthAPI } }
    }
  ).api
  return api?.sprint11?.health ?? null
}

export interface UseHealthReport {
  state: 'idle' | 'loading' | 'ready' | 'session_required' | 'error'
  report: HealthReport | null
  error?: string
  refresh: (force?: boolean) => Promise<void>
  checkHibp: (password: string) => Promise<number>
}

export function useHealthReport(auto = true): UseHealthReport {
  const [state, setState] = useState<UseHealthReport['state']>('idle')
  const [report, setReport] = useState<HealthReport | null>(null)
  const [error, setError] = useState<string | undefined>()

  const refresh = useCallback(async (force = false) => {
    const api = getApi()
    if (!api) {
      setState('error')
      setError('API 未挂载')
      return
    }
    setState('loading')
    // ρ3：补 catch，避免 IPC reject 时 state='loading' 卡死
    try {
      const r = await api.report(force)
      if (!r.success || !r.data) {
        setState('error')
        setError(r.error)
        return
      }
      const status = r.data
      if (status.state === 'ready') {
        setReport(status.report)
        setState('ready')
        setError(undefined)
      } else if (status.state === 'session_required') {
        setState('session_required')
      } else {
        setState('error')
        setError(status.error)
      }
    } catch (err) {
      setState('error')
      setError((err as Error).message ?? 'health.report failed')
    }
  }, [])

  const checkHibp = useCallback(async (password: string): Promise<number> => {
    const api = getApi()
    if (!api) return 0
    try {
      const r = await api.checkHibp(password)
      return r.data?.count ?? 0
    } catch {
      return 0
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (auto) void refresh()
  }, [auto, refresh])

  return { state, report, error, refresh, checkHibp }
}
