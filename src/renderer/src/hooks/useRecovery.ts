/**
 * useRecovery (TASK-071)
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  RecoveryPhraseSetupResult,
  RecoveryResetResult,
  RecoveryStatus,
  RecoveryVerifyChallenge,
  RecoveryVerifyInput,
  RecoveryVerifyMode
} from '../../../types/recovery'

interface RecoveryAPIShape {
  status: () => Promise<{ success: boolean; data?: RecoveryStatus }>
  setup: () => Promise<{ success: boolean; data?: RecoveryPhraseSetupResult }>
  challenge: (
    mnemonic: string[],
    mode: RecoveryVerifyMode
  ) => Promise<{ success: boolean; data?: RecoveryVerifyChallenge }>
  verify: (
    input: RecoveryVerifyInput
  ) => Promise<{ success: boolean; data?: { ok: boolean } }>
  resetPassword: (
    words: string[],
    newPassword: string
  ) => Promise<{ success: boolean; data?: RecoveryResetResult }>
  disable: () => Promise<{ success: boolean }>
}

function getApi(): RecoveryAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint13?: { recovery?: RecoveryAPIShape } }
    }
  ).api
  return api?.sprint13?.recovery ?? null
}

export interface UseRecoveryState {
  status: RecoveryStatus | null
  loading: boolean
  refresh: () => Promise<void>
  setup: () => Promise<string[]>
  challenge: (
    mnemonic: string[],
    mode: RecoveryVerifyMode
  ) => Promise<RecoveryVerifyChallenge | null>
  verify: (input: RecoveryVerifyInput) => Promise<boolean>
  resetPassword: (
    words: string[],
    newPassword: string
  ) => Promise<RecoveryResetResult>
  disable: () => Promise<void>
}

export function useRecovery(): UseRecoveryState {
  const [status, setStatus] = useState<RecoveryStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const api = getApi()
    if (!api) return
    setLoading(true)
    try {
      const r = await api.status()
      if (r.success && r.data) setStatus(r.data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setup = useCallback(async (): Promise<string[]> => {
    const api = getApi()
    if (!api) return []
    const r = await api.setup()
    await refresh()
    return r.success && r.data?.success ? r.data.mnemonic : []
  }, [refresh])

  const challenge = useCallback(
    async (
      mnemonic: string[],
      mode: RecoveryVerifyMode
    ): Promise<RecoveryVerifyChallenge | null> => {
      const api = getApi()
      if (!api) return null
      const r = await api.challenge(mnemonic, mode)
      return r.success && r.data ? r.data : null
    },
    []
  )

  const verify = useCallback(
    async (input: RecoveryVerifyInput): Promise<boolean> => {
      const api = getApi()
      if (!api) return false
      const r = await api.verify(input)
      return Boolean(r.success && r.data?.ok)
    },
    []
  )

  const resetPassword = useCallback(
    async (
      words: string[],
      newPassword: string
    ): Promise<RecoveryResetResult> => {
      const api = getApi()
      if (!api) return { success: false, error: 'API 未挂载' }
      const r = await api.resetPassword(words, newPassword)
      return r.data ?? { success: false, error: '未知错误' }
    },
    []
  )

  const disable = useCallback(async () => {
    const api = getApi()
    if (!api) return
    await api.disable()
    await refresh()
  }, [refresh])

  return {
    status,
    loading,
    refresh,
    setup,
    challenge,
    verify,
    resetPassword,
    disable
  }
}
