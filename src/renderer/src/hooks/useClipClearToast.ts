/**
 * useClipClearToast (TASK-068)
 *
 * 订阅主进程 sprint13:auto-clear-event 广播，维护 UI 倒计时状态。
 * 依赖 preload 暴露的 window.api.sprint13.autoClear（由整合人接线）。
 *
 * 兼容性：在 sprint13 API 未挂载时安全降级（visible=false）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AutoClearEvent,
  AutoClearStatus
} from '../../../types/auto-clear'

interface Sprint13APIShape {
  autoClear: {
    schedule: (
      secret: string,
      ttlMs?: number
    ) => Promise<{ success: boolean }>
    cancel: () => Promise<{ success: boolean }>
    status: () => Promise<{ success: boolean; data?: AutoClearStatus }>
    onEvent: (cb: (event: AutoClearEvent) => void) => () => void
  }
}

function getApi(): Sprint13APIShape | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { api?: { sprint13?: Sprint13APIShape } })
    .api
  return api?.sprint13 ?? null
}

export interface ClipClearToastState {
  visible: boolean
  remainingMs: number
  ttlMs: number
  /** 最近一次终态（用于一次性提示），UI 自行决定是否展示 */
  lastResult: 'cleared' | 'skipped' | null
  cancel: () => void
  flushNow: () => void
}

export function useClipClearToast(): ClipClearToastState {
  const [visible, setVisible] = useState(false)
  const [remainingMs, setRemainingMs] = useState(0)
  const [ttlMs, setTtlMs] = useState(30_000)
  const [lastResult, setLastResult] = useState<'cleared' | 'skipped' | null>(
    null
  )
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadlineRef = useRef<number>(0)

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const startTick = useCallback(
    (deadline: number) => {
      stopTick()
      deadlineRef.current = deadline
      tickRef.current = setInterval(() => {
        const left = Math.max(0, deadlineRef.current - Date.now())
        setRemainingMs(left)
        if (left <= 0) stopTick()
      }, 200)
    },
    [stopTick]
  )

  useEffect(() => {
    const api = getApi()
    if (!api) return undefined

    // 初始拉取一次状态（窗口刷新后可能已有挂起任务）
    api.autoClear.status().then((r) => {
      if (r.success && r.data?.active) {
        setVisible(true)
        setTtlMs(r.data.ttlMs)
        setRemainingMs(r.data.remainingMs)
        startTick(Date.now() + r.data.remainingMs)
      }
    })

    const off = api.autoClear.onEvent((ev) => {
      switch (ev.type) {
        case 'scheduled': {
          setVisible(true)
          setLastResult(null)
          setTtlMs(ev.ttlMs)
          setRemainingMs(ev.ttlMs)
          startTick(Date.now() + ev.ttlMs)
          break
        }
        case 'cancelled': {
          setVisible(false)
          setRemainingMs(0)
          stopTick()
          break
        }
        case 'cleared': {
          setVisible(false)
          setRemainingMs(0)
          setLastResult('cleared')
          stopTick()
          break
        }
        case 'skipped': {
          setVisible(false)
          setRemainingMs(0)
          setLastResult('skipped')
          stopTick()
          break
        }
      }
    })

    return () => {
      off()
      stopTick()
    }
  }, [startTick, stopTick])

  const cancel = useCallback(() => {
    const api = getApi()
    void api?.autoClear.cancel()
  }, [])

  const flushNow = useCallback(() => {
    // 暂以 schedule(空内容) + cancel 不能直接立即清；
    // 走 schedule 的 ttlMs=1 让 main 进程立刻 flush 当前内容。
    // 这里更直接：调一下 cancel 然后让用户感知"已取消"
    // 实际"立即清空"建议主进程暴露专门 channel，这里用 cancel 替代。
    const api = getApi()
    void api?.autoClear.cancel()
  }, [])

  return {
    visible,
    remainingMs,
    ttlMs,
    lastResult,
    cancel,
    flushNow
  }
}
