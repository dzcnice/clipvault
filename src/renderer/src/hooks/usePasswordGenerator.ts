/**
 * usePasswordGenerator (Sprint 11 · TASK-058)
 */

import { useCallback, useState } from 'react'
import type {
  StrongPasswordOptsWire,
  PassphraseOptsWire
} from '../../../preload/sprint11-api'

interface Sprint11PasswordAPI {
  generateStrong: (
    opts: StrongPasswordOptsWire
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  generatePassphrase: (
    opts: PassphraseOptsWire
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  generatePIN: (
    length: number
  ) => Promise<{ success: boolean; data?: string; error?: string }>
  evaluateStrength: (
    value: string
  ) => Promise<{
    success: boolean
    data?: { score: number; feedback: string[] }
  }>
}

function getApi(): Sprint11PasswordAPI | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint11?: { password?: Sprint11PasswordAPI } }
    }
  ).api
  return api?.sprint11?.password ?? null
}

export function usePasswordGenerator(): {
  value: string
  loading: boolean
  error?: string
  strong: (opts: StrongPasswordOptsWire) => Promise<string>
  passphrase: (opts: PassphraseOptsWire) => Promise<string>
  pin: (length: number) => Promise<string>
  evaluate: (v: string) => Promise<{ score: number; feedback: string[] }>
} {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const run = useCallback(
    async <T,>(fn: () => Promise<{
      success: boolean
      data?: T
      error?: string
    }>): Promise<T | undefined> => {
      setLoading(true)
      setError(undefined)
      // ρ3：补 catch，避免 IPC 抛错时 UI 显示空字符串但无任何错误反馈
      try {
        const r = await fn()
        if (!r.success) setError(r.error)
        return r.data
      } catch (err) {
        setError((err as Error).message ?? 'generate failed')
        return undefined
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const strong = useCallback(
    async (opts: StrongPasswordOptsWire): Promise<string> => {
      const api = getApi()
      if (!api) {
        setError('API 未挂载')
        return ''
      }
      const s = (await run(() => api.generateStrong(opts))) ?? ''
      setValue(s)
      return s
    },
    [run]
  )

  const passphrase = useCallback(
    async (opts: PassphraseOptsWire): Promise<string> => {
      const api = getApi()
      if (!api) {
        setError('API 未挂载')
        return ''
      }
      const s = (await run(() => api.generatePassphrase(opts))) ?? ''
      setValue(s)
      return s
    },
    [run]
  )

  const pin = useCallback(
    async (length: number): Promise<string> => {
      const api = getApi()
      if (!api) {
        setError('API 未挂载')
        return ''
      }
      const s = (await run(() => api.generatePIN(length))) ?? ''
      setValue(s)
      return s
    },
    [run]
  )

  const evaluate = useCallback(
    async (v: string): Promise<{ score: number; feedback: string[] }> => {
      const api = getApi()
      if (!api) return { score: 0, feedback: [] }
      // ρ3：补 catch，避免 IPC 抛错导致上层未处理异常
      try {
        const r = await api.evaluateStrength(v)
        return r.data ?? { score: 0, feedback: [] }
      } catch {
        return { score: 0, feedback: [] }
      }
    },
    []
  )

  return { value, loading, error, strong, passphrase, pin, evaluate }
}
