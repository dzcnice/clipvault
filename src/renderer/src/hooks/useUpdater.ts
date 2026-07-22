/**
 * useUpdater (TASK-072)
 *
 * 绑定 window.api.sprint14.updater —— API 未挂载时安全降级为 idle。
 */

import { useCallback, useEffect, useState } from 'react'
import type {
  UpdateChannel,
  UpdateInfoPayload,
  UpdaterDiagnostics,
  UpdaterEvent,
  UpdaterStatus
} from '../../../types/updater'

interface UpdaterAPIShape {
  check: () => Promise<{ success: boolean; data?: UpdateInfoPayload | null }>
  download: () => Promise<{ success: boolean; error?: string }>
  quitAndInstall: () => Promise<{ success: boolean }>
  setChannel: (
    channel: UpdateChannel
  ) => Promise<{ success: boolean; error?: string }>
  getState: () => Promise<{
    success: boolean
    data?: UpdaterEvent & { channel: UpdateChannel }
  }>
  getDiagnostics?: () => Promise<{
    success: boolean
    data?: UpdaterDiagnostics
  }>
  openReleasePage?: () => Promise<{ success: boolean }>
  onEvent: (cb: (ev: UpdaterEvent) => void) => () => void
}

function getApi(): UpdaterAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (
    window as unknown as {
      api?: { sprint14?: { updater?: UpdaterAPIShape } }
    }
  ).api
  return api?.sprint14?.updater ?? null
}

export interface UseUpdaterState {
  status: UpdaterStatus
  info: UpdateInfoPayload | null
  progress: UpdaterEvent['progress'] | null
  error: string | null
  channel: UpdateChannel
  check: () => Promise<UpdateInfoPayload | null>
  download: () => Promise<boolean>
  quitAndInstall: () => Promise<void>
  setChannel: (c: UpdateChannel) => Promise<void>
  getDiagnostics: () => Promise<UpdaterDiagnostics | null>
  openReleasePage: () => Promise<void>
}

export function useUpdater(): UseUpdaterState {
  const [status, setStatus] = useState<UpdaterStatus>('idle')
  const [info, setInfo] = useState<UpdateInfoPayload | null>(null)
  const [progress, setProgress] = useState<UpdaterEvent['progress'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannelState] = useState<UpdateChannel>('stable')

  useEffect(() => {
    const api = getApi()
    if (!api) return
    // ρ3：补 catch，避免 IPC 抛错静默失败
    void api
      .getState()
      .then((r) => {
        if (r.success && r.data) {
          setStatus(r.data.status)
          setInfo(r.data.info ?? null)
          setProgress(r.data.progress ?? null)
          setError(r.data.error ?? null)
          setChannelState(r.data.channel)
        }
      })
      .catch((err) => {
        setError((err as Error).message ?? 'getState failed')
      })
    const off = api.onEvent((ev) => {
      setStatus(ev.status)
      if (ev.info) setInfo(ev.info)
      if (ev.progress) setProgress(ev.progress)
      setError(ev.error ?? null)
    })
    return off
  }, [])

  const check = useCallback(async (): Promise<UpdateInfoPayload | null> => {
    const api = getApi()
    if (!api) return null
    try {
      const r = await api.check()
      return r.data ?? null
    } catch (err) {
      setError((err as Error).message ?? 'check failed')
      return null
    }
  }, [])

  const download = useCallback(async (): Promise<boolean> => {
    const api = getApi()
    if (!api) return false
    try {
      const r = await api.download()
      return r.success
    } catch (err) {
      setError((err as Error).message ?? 'download failed')
      return false
    }
  }, [])

  const quitAndInstall = useCallback(async (): Promise<void> => {
    const api = getApi()
    if (!api) return
    try {
      await api.quitAndInstall()
    } catch (err) {
      setError((err as Error).message ?? 'quitAndInstall failed')
    }
  }, [])

  const setChannel = useCallback(async (c: UpdateChannel): Promise<void> => {
    const api = getApi()
    if (!api) return
    try {
      const r = await api.setChannel(c)
      if (r.success) setChannelState(c)
    } catch (err) {
      setError((err as Error).message ?? 'setChannel failed')
    }
  }, [])

  const getDiagnostics = useCallback(async (): Promise<UpdaterDiagnostics | null> => {
    const api = getApi()
    if (!api?.getDiagnostics) return null
    try {
      const r = await api.getDiagnostics()
      return r.success ? (r.data ?? null) : null
    } catch {
      return null
    }
  }, [])

  const openReleasePage = useCallback(async (): Promise<void> => {
    const api = getApi()
    if (!api?.openReleasePage) {
      window.open('https://github.com/dzcnice/clipvault/releases', '_blank')
      return
    }
    try {
      await api.openReleasePage()
    } catch {
      window.open('https://github.com/dzcnice/clipvault/releases', '_blank')
    }
  }, [])

  return {
    status,
    info,
    progress,
    error,
    channel,
    check,
    download,
    quitAndInstall,
    setChannel,
    getDiagnostics,
    openReleasePage
  }
}
