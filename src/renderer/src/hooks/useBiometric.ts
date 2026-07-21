/**
 * useBiometric (TASK-067)
 *
 * 基于 window.api.sprint13.biometric 包装；API 未挂载时安全降级。
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  BiometricAvailability,
  BiometricEnrollResult,
  BiometricUnlockResult
} from '../../../types/biometric'

interface BiometricAPIShape {
  availability: () => Promise<{ success: boolean; data?: BiometricAvailability }>
  enroll: (
    password: string
  ) => Promise<{ success: boolean; data?: BiometricEnrollResult; error?: string }>
  unlock: () => Promise<{
    success: boolean
    data?: BiometricUnlockResult
    error?: string
  }>
  disable: () => Promise<{ success: boolean }>
}

function getApi(): BiometricAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint13?: { biometric?: BiometricAPIShape } }
    }
  ).api
  return api?.sprint13?.biometric ?? null
}

export interface UseBiometricState {
  availability: BiometricAvailability | null
  loading: boolean
  refresh: () => Promise<void>
  enroll: (password: string) => Promise<BiometricEnrollResult>
  unlock: () => Promise<BiometricUnlockResult>
  disable: () => Promise<void>
}

export function useBiometric(): UseBiometricState {
  const [availability, setAvailability] = useState<BiometricAvailability | null>(
    null
  )
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const api = getApi()
    if (!api) return
    setLoading(true)
    try {
      const r = await api.availability()
      if (r.success && r.data) setAvailability(r.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const enroll = useCallback(
    async (password: string): Promise<BiometricEnrollResult> => {
      const api = getApi()
      if (!api) return { success: false, error: 'API 未挂载' }
      const r = await api.enroll(password)
      await refresh()
      return r.data ?? { success: false, error: r.error ?? '未知错误' }
    },
    [refresh]
  )

  const unlock = useCallback(async (): Promise<BiometricUnlockResult> => {
    const api = getApi()
    if (!api) return { success: false, error: 'API 未挂载' }
    const r = await api.unlock()
    return r.data ?? { success: false, error: r.error ?? '未知错误' }
  }, [])

  const disable = useCallback(async () => {
    const api = getApi()
    if (!api) return
    await api.disable()
    await refresh()
  }, [refresh])

  return { availability, loading, refresh, enroll, unlock, disable }
}
