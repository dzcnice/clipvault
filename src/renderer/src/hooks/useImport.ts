/**
 * useImport (TASK-074 / 075)
 */

import { useCallback, useState } from 'react'
import type {
  GenericCsvMapping,
  ImportParseResult,
  ImportRequest,
  ImportSource
} from '../../../types/import'

interface ImportAPIShape {
  parse: (
    req: ImportRequest
  ) => Promise<{ success: boolean; data?: ImportParseResult; error?: string }>
  commit: (
    items: ImportParseResult['items']
  ) => Promise<{
    success: boolean
    data?: { count: number; skipped: number }
    error?: string
  }>
}

function getApi(): ImportAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { importer?: ImportAPIShape }
    }
  ).api
  return api?.importer ?? null
}

export interface UseImportState {
  busy: boolean
  result: ImportParseResult | null
  error: string | null
  parse: (
    source: ImportSource,
    content: string,
    opts?: { base64?: boolean; password?: string; mapping?: GenericCsvMapping }
  ) => Promise<ImportParseResult | null>
  commit: (
    items: ImportParseResult['items']
  ) => Promise<{ count: number; skipped: number } | null>
  reset: () => void
}

export function useImport(): UseImportState {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parse = useCallback<UseImportState['parse']>(
    async (source, content, opts) => {
      const api = getApi()
      if (!api) {
        setError('API 未挂载')
        return null
      }
      // ρ3 · P1-7：parse 入口先 reset，避免上次成功提示残留；并补 catch
      setBusy(true)
      setError(null)
      setResult(null)
      try {
        const r = await api.parse({
          source,
          content,
          base64: opts?.base64,
          password: opts?.password,
          mapping: opts?.mapping
        })
        if (!r.success) {
          setError(r.error ?? '解析失败')
          return null
        }
        setResult(r.data ?? null)
        return r.data ?? null
      } catch (err) {
        setError((err as Error).message ?? '解析失败')
        return null
      } finally {
        setBusy(false)
      }
    },
    []
  )

  const commit = useCallback<UseImportState['commit']>(async (items) => {
    const api = getApi()
    if (!api) return null
    setBusy(true)
    try {
      const r = await api.commit(items)
      if (!r.success) {
        setError(r.error ?? '导入失败')
        return null
      }
      return {
        count: r.data?.count ?? 0,
        skipped: r.data?.skipped ?? 0
      }
    } catch (err) {
      setError((err as Error).message ?? '导入失败')
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { busy, result, error, parse, commit, reset }
}
