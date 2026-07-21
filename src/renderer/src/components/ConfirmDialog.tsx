/**
 * 确认弹窗（B-2）
 *
 * 用法：通过 `useConfirm()` 取得 confirm 函数，返回 Promise<boolean>
 *
 * - 单例：由 ConfirmDialogProvider 维护一个全局 root
 * - 替换 window.confirm：不阻塞渲染线程，样式跟随液态玻璃主题
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

interface PendingRequest extends ConfirmOptions {
  id: number
  resolve: (v: boolean) => void
}

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmDialogProvider({
  children
}: PropsWithChildren): JSX.Element {
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const idRef = useRef(0)

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      idRef.current += 1
      setPending({ id: idRef.current, resolve, ...opts })
    })
  }, [])

  const handleClose = useCallback(
    (result: boolean) => {
      if (!pending) return
      pending.resolve(result)
      setPending(null)
    },
    [pending]
  )

  // Esc / Enter 键支持
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose(false)
      else if (e.key === 'Enter') handleClose(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, handleClose])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center z-[9999]"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div
              className="glass-card p-6 w-full max-w-md mx-4"
              style={{ borderRadius: '16px' }}
            >
              {pending.title && (
                <h3
                  id="confirm-title"
                  className="text-lg font-semibold mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pending.title}
                </h3>
              )}
              <div
                className="text-sm mb-6"
                style={{ color: 'var(--text-secondary)' }}
              >
                {pending.message}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="glass-btn px-4 py-2"
                  aria-label={pending.cancelText || '取消'}
                  onClick={() => handleClose(false)}
                >
                  {pending.cancelText || '取消'}
                </button>
                <button
                  type="button"
                  className={`glass-btn px-4 py-2 ${
                    pending.variant === 'danger'
                      ? 'glass-btn-danger'
                      : 'glass-btn-primary'
                  }`}
                  aria-label={pending.confirmText || '确认'}
                  onClick={() => handleClose(true)}
                  autoFocus
                >
                  {pending.confirmText || '确认'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  )
}

/** 获取 confirm 函数；未被 Provider 包裹时降级为 window.confirm */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (ctx) return ctx
  return (opts) =>
    Promise.resolve(
      window.confirm(typeof opts.message === 'string' ? opts.message : '确认？')
    )
}
