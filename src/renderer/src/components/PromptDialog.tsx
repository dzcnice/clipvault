/**
 * PromptDialog - 替换 window.prompt 的异步对话框
 *
 * 用法：
 *   const { prompt } = usePromptDialog()
 *   const value = await prompt({ title: '...', message: '...', placeholder: '...' })
 *
 * - 通过 PromptDialogProvider 提供全局单例
 * - 返回 Promise<string | null>（null 表示取消）
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

export interface PromptOptions {
  title?: string
  message?: ReactNode
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  inputType?: 'text' | 'password'
}

type PromptFn = (opts: PromptOptions) => Promise<string | null>

interface PendingRequest extends PromptOptions {
  id: number
  resolve: (v: string | null) => void
}

const PromptContext = createContext<PromptFn | null>(null)

export function PromptDialogProvider({
  children
}: PropsWithChildren): JSX.Element {
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [value, setValue] = useState('')
  const idRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const prompt = useCallback<PromptFn>((opts) => {
    return new Promise<string | null>((resolve) => {
      idRef.current += 1
      setValue(opts.defaultValue ?? '')
      setPending({ id: idRef.current, resolve, ...opts })
    })
  }, [])

  const handleClose = useCallback(
    (result: string | null) => {
      if (!pending) return
      pending.resolve(result)
      setPending(null)
      setValue('')
    },
    [pending]
  )

  useEffect(() => {
    if (!pending) return
    // 聚焦输入框
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [pending, handleClose])

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      {pending &&
        createPortal(
          <div
            className="fixed inset-0 flex items-center justify-center z-[9999]"
            style={{ background: 'rgba(0,0,0,0.35)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
          >
            <form
              className="glass-card p-6 w-full max-w-md mx-4"
              style={{ borderRadius: '16px' }}
              onSubmit={(e) => {
                e.preventDefault()
                handleClose(value)
              }}
            >
              {pending.title && (
                <h3
                  id="prompt-title"
                  className="text-lg font-semibold mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {pending.title}
                </h3>
              )}
              {pending.message && (
                <div
                  className="text-sm mb-3"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {pending.message}
                </div>
              )}
              <input
                ref={inputRef}
                type={pending.inputType ?? 'text'}
                className="w-full px-3 py-2 rounded border"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderColor: 'rgba(0,0,0,0.1)',
                  color: 'var(--text-primary)'
                }}
                placeholder={pending.placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  type="button"
                  className="glass-btn px-4 py-2"
                  onClick={() => handleClose(null)}
                >
                  {pending.cancelText || '取消'}
                </button>
                <button
                  type="submit"
                  className="glass-btn glass-btn-primary px-4 py-2"
                >
                  {pending.confirmText || '确认'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </PromptContext.Provider>
  )
}

/** 获取 prompt 函数；未被 Provider 包裹时降级为 window.prompt */
export function usePromptDialog(): PromptFn {
  const ctx = useContext(PromptContext)
  if (ctx) return ctx
  return (opts) =>
    Promise.resolve(
      window.prompt(
        typeof opts.message === 'string'
          ? opts.message
          : opts.title ?? '请输入',
        opts.defaultValue ?? ''
      )
    )
}
