/**
 * useTOTP (Sprint 11 · TASK-057)
 *
 * 轮询主进程 totp generate（每秒一次），返回当前码 + 倒计时。
 *
 * ρ3：引入 requestToken 机制（见 P1-6）。credentialId 切换或组件 unmount 时
 * bump token，所有未完成请求 setState 前先比对；陈旧请求直接丢弃，避免把
 * "上一个凭证的 OTP 码" 短暂显示在新凭证上（安全问题：用户误复制旧码登录失败）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TOTPCode, TOTPConfig } from '../../../types/totp'
import { logger } from '../utils/logger'

interface Sprint11TOTPAPI {
  generate: (payload: {
    credentialId?: string
    config?: TOTPConfig
  }) => Promise<{ success: boolean; data?: TOTPCode; error?: string }>
}

function getApi(): Sprint11TOTPAPI | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint11?: { totp?: Sprint11TOTPAPI } }
    }
  ).api
  return api?.sprint11?.totp ?? null
}

export interface UseTOTPState {
  code: string
  remainingMs: number
  periodMs: number
  loading: boolean
  error?: string
  refresh: () => Promise<void>
}

export function useTOTP(credentialId?: string): UseTOTPState {
  const [code, setCode] = useState('')
  const [remainingMs, setRemainingMs] = useState(30000)
  const [periodMs, setPeriodMs] = useState(30000)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const lastGenRef = useRef(0)
  // ρ3：请求序列 token。credentialId 切换 / unmount 时 ++；所有 setState
  // 前先比对 myToken === requestTokenRef.current，不匹配直接丢弃。
  const requestTokenRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!credentialId) return
    const api = getApi()
    if (!api) {
      setError('API 未挂载')
      return
    }
    const myToken = ++requestTokenRef.current
    setLoading(true)
    try {
      const r = await api.generate({ credentialId })
      if (myToken !== requestTokenRef.current) return
      if (r.success && r.data) {
        setCode(r.data.code)
        setRemainingMs(r.data.remainingMs)
        setPeriodMs(r.data.periodMs)
        setError(undefined)
        lastGenRef.current = Date.now()
      } else {
        setError(r.error ?? 'generate failed')
      }
    } catch (err) {
      if (myToken !== requestTokenRef.current) return
      logger.error('[useTOTP] generate failed:', err)
      setError((err as Error).message ?? 'generate failed')
    } finally {
      if (myToken === requestTokenRef.current) {
        setLoading(false)
      }
    }
  }, [credentialId])

  useEffect(() => {
    if (!credentialId) return
    void refresh()
    // 每秒本地倒计时 + 每 10s 重新取码
    const tick = setInterval(() => {
      setRemainingMs((ms) => Math.max(0, ms - 1000))
    }, 1000)
    const regen = setInterval(() => {
      void refresh()
    }, 10_000)
    return (): void => {
      clearInterval(tick)
      clearInterval(regen)
      // 切换凭证 / unmount：bump token 丢弃所有未完成请求
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestTokenRef.current++
    }
  }, [credentialId, refresh])

  return { code, remainingMs, periodMs, loading, error, refresh }
}
