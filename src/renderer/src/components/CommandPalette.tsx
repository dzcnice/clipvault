/**
 * 全局命令面板（C-1）
 *
 * 触发：Ctrl/Cmd + K 或 Ctrl+Shift+P，或 shortcut:action 事件
 * 功能：
 * - 导航到各页面
 * - 快速复制最近的剪贴板项
 * - 打开设置
 * - 隐藏到托盘
 * 搜索：模糊匹配（复用 src/utils/fuzzy-search）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// doOpen 用到 useCallback；activeIdx/setActiveIdx/keyword 保留
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { fuzzySearch } from '@/utils/fuzzy-search'
import { logger } from '../utils/logger'

interface Command {
  id: string
  label: string
  subtitle?: string
  keywords?: string
  action: () => void | Promise<void>
}

type Subscriber = (open: boolean) => void
let subscribers: Subscriber[] = []

/** 外部打开命令面板：用于快捷键触发 */
export function openCommandPalette(): void {
  subscribers.forEach((sub) => sub(true))
}

export default function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()

  // 统一的"打开面板"动作：兼顾清空关键词、聚焦输入框
  const doOpen = useCallback((next: boolean) => {
    setOpen(next)
    if (next) {
      setKeyword('')
      setActiveIdx(0)
      // 下一帧再 focus（确保 input 已挂载）
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [])

  // 注册 open/close 订阅
  useEffect(() => {
    const sub: Subscriber = (v) => doOpen(v)
    subscribers.push(sub)
    return () => {
      subscribers = subscribers.filter((s) => s !== sub)
    }
  }, [doOpen])

  // 键盘快捷键：Ctrl+K / Ctrl+Shift+P
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => {
          const next = !v
          if (next) {
            setKeyword('')
            setActiveIdx(0)
            requestAnimationFrame(() => inputRef.current?.focus())
          }
          return next
        })
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setOpen((v) => {
          const next = !v
          if (next) {
            setKeyword('')
            setActiveIdx(0)
            requestAnimationFrame(() => inputRef.current?.focus())
          }
          return next
        })
      }
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const commands = useMemo<Command[]>(() => {
    return [
      {
        id: 'nav:clipboard',
        label: '转到 · 剪贴板历史',
        subtitle: '/clipboard',
        keywords: 'clipboard history paste 剪贴板',
        action: () => navigate('/clipboard')
      },
      {
        id: 'nav:credentials',
        label: '转到 · 密钥管理',
        subtitle: '/credentials',
        keywords: 'credential key password vault 密钥',
        action: () => navigate('/credentials')
      },
      {
        id: 'nav:snippets',
        label: '转到 · 快速片段',
        subtitle: '/snippets',
        keywords: 'snippet template 片段',
        action: () => navigate('/snippets')
      },
      {
        id: 'nav:settings',
        label: '打开设置',
        subtitle: '/settings',
        keywords: 'settings preferences 设置',
        action: () => navigate('/settings')
      },
      {
        id: 'clipboard:paste-recent',
        label: '粘贴最近一条剪贴板',
        subtitle: 'recent clipboard',
        keywords: 'paste recent clipboard 粘贴 最近',
        action: async () => {
          const res = await window.api.clipboard.getHistory({ limit: 1 })
          const item = res.data?.items?.[0]
          if (item) {
            await window.api.clipboard.copyItem(item.id)
          }
        }
      },
      {
        id: 'window:hide',
        label: '隐藏到托盘',
        subtitle: 'hide to tray',
        keywords: 'hide tray 隐藏 托盘',
        action: () => {
          // 主进程 close 默认最小化到托盘，而非退出
          window.api.window.close()
        }
      }
    ]
  }, [navigate])

  const filtered = useMemo(() => {
    if (!keyword.trim()) return commands.map((c) => ({ item: c, score: 0, matches: [] }))
    return fuzzySearch(
      commands,
      keyword,
      (c) => [c.label, c.keywords || ''],
      20
    )
  }, [keyword, commands])

  const activate = useCallback(
    async (cmd: Command) => {
      setOpen(false)
      try {
        await cmd.action()
      } catch (err) {
        logger.error('[command-palette] action failed:', err)
      }
    },
    []
  )

  if (!open) return null

  const portalTarget = document.body
  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center z-[9999] pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      data-testid="command-palette"
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-card w-full max-w-xl mx-4 overflow-hidden"
        style={{ borderRadius: '12px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b" style={{ borderColor: 'var(--glass-border)' }}>
          <input
            ref={inputRef}
            type="text"
            className="glass-input w-full"
            placeholder="输入命令… (↑↓ 选择，Enter 执行，Esc 关闭)"
            value={keyword}
            aria-label="命令搜索"
            data-testid="command-palette-input"
            onChange={(e) => {
              setKeyword(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const cmd = filtered[activeIdx]?.item
                if (cmd) activate(cmd)
              }
            }}
          />
        </div>
        <ul
          role="listbox"
          aria-label="可用命令"
          className="max-h-[50vh] overflow-y-auto"
        >
          {filtered.length === 0 && (
            <li
              className="p-4 text-center text-sm"
              style={{ color: 'var(--text-tertiary)' }}
            >
              未匹配到命令
            </li>
          )}
          {filtered.map(({ item: cmd }, idx) => (
            <li
              key={cmd.id}
              role="option"
              aria-selected={idx === activeIdx}
              tabIndex={0}
              className="px-4 py-2 cursor-pointer flex items-center justify-between"
              style={{
                background:
                  idx === activeIdx ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: 'var(--text-primary)'
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => activate(cmd)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  activate(cmd)
                }
              }}
            >
              <span className="text-sm">{cmd.label}</span>
              {cmd.subtitle && (
                <span
                  className="text-xs"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {cmd.subtitle}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    portalTarget
  )
}
