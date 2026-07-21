/**
 * useCredentialAudit (TASK-070)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CredentialAuditEntry,
  CredentialAuditListParams,
  CredentialAuditListResult,
  RecordAuditInput
} from '../../../types/audit'

interface AuditAPIShape {
  record: (input: RecordAuditInput) => Promise<{ success: boolean }>
  list: (
    params?: CredentialAuditListParams
  ) => Promise<{ success: boolean; data?: CredentialAuditListResult }>
  exportCsv: (
    params?: CredentialAuditListParams
  ) => Promise<{ success: boolean; data?: string }>
  clear: (credentialId?: string) => Promise<{ success: boolean; data?: number }>
}

function getApi(): AuditAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint13?: { audit?: AuditAPIShape } }
    }
  ).api
  return api?.sprint13?.audit ?? null
}

export interface UseCredentialAuditState {
  items: CredentialAuditEntry[]
  total: number
  loading: boolean
  reload: (params?: CredentialAuditListParams) => Promise<void>
  exportCsv: (params?: CredentialAuditListParams) => Promise<string | null>
  record: (input: RecordAuditInput) => Promise<void>
  clear: (credentialId?: string) => Promise<void>
}

export function useCredentialAudit(
  initialParams?: CredentialAuditListParams
): UseCredentialAuditState {
  const [items, setItems] = useState<CredentialAuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // 竞态防护：快速连续查询时老请求不会覆盖新请求的数据
  const requestTokenRef = useRef(0)

  const reload = useCallback(
    async (params?: CredentialAuditListParams): Promise<void> => {
      const api = getApi()
      if (!api) return
      const myToken = ++requestTokenRef.current
      setLoading(true)
      try {
        const r = await api.list(params ?? initialParams ?? {})
        if (myToken !== requestTokenRef.current) return
        if (r.success && r.data) {
          setItems(r.data.items)
          setTotal(r.data.total)
        }
      } catch {
        // API 抛错也要保证 loading 重置，避免 UI 卡死
      } finally {
        if (myToken === requestTokenRef.current) {
          setLoading(false)
        }
      }
    },
    [initialParams]
  )

  useEffect(() => {
    void reload()
  }, [reload])

  const exportCsv = useCallback(
    async (params?: CredentialAuditListParams): Promise<string | null> => {
      const api = getApi()
      if (!api) return null
      const r = await api.exportCsv(params ?? initialParams ?? {})
      return r.success ? r.data ?? null : null
    },
    [initialParams]
  )

  const record = useCallback(async (input: RecordAuditInput): Promise<void> => {
    const api = getApi()
    if (!api) return
    await api.record(input)
  }, [])

  const clear = useCallback(
    async (credentialId?: string): Promise<void> => {
      const api = getApi()
      if (!api) return
      await api.clear(credentialId)
      await reload()
    },
    [reload]
  )

  return { items, total, loading, reload, exportCsv, record, clear }
}
