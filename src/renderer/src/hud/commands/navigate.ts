/**
 * 导航类命令 · v3 个人本地版
 *
 * 通过 IPC 触发主进程 hud:navigate → 主窗口 focus + 渲染侧 HashRouter 跳转。
 */

import {
  LayoutDashboard,
  KeyRound,
  Clipboard,
  Scissors,
  Activity,
  Settings,
  ShieldCheck,
  SunMoon
} from 'lucide-react'
import type { HudCommand, HudCommandSource } from '../types'

interface HudAPILike {
  navigate: (path: string) => Promise<{ success: boolean }>
  hide: () => Promise<{ success: boolean }>
}

function getApi(): HudAPILike | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { api?: { hud?: HudAPILike } }).api
  return api?.hud ?? null
}

function nav(path: string): () => Promise<void> {
  return async () => {
    const api = getApi()
    if (api) {
      await api.navigate(path)
    }
  }
}

export function buildNavigateCommands(): HudCommand[] {
  return [
    {
      id: 'nav.dashboard',
      title: '打开概览',
      subtitle: 'Dashboard',
      category: 'navigate',
      keywords: ['dashboard', '概览', '仪表盘', '主页', 'home'],
      Icon: LayoutDashboard,
      perform: nav('/dashboard')
    },
    {
      id: 'nav.credentials',
      title: '打开凭证',
      subtitle: 'Credentials',
      category: 'navigate',
      keywords: ['credential', '凭证', '密码', 'password', '钥匙'],
      Icon: KeyRound,
      perform: nav('/credentials')
    },
    {
      id: 'nav.clipboard',
      title: '打开剪贴板',
      subtitle: 'Clipboard',
      category: 'navigate',
      keywords: ['clipboard', '剪贴板', '历史'],
      Icon: Clipboard,
      perform: nav('/clipboard')
    },
    {
      id: 'nav.snippets',
      title: '打开片段',
      subtitle: 'Snippets',
      category: 'navigate',
      keywords: ['snippet', '片段', '模板', '常用'],
      Icon: Scissors,
      perform: nav('/snippets')
    },
    {
      id: 'nav.health',
      title: '打开健康检查',
      subtitle: 'Health',
      category: 'navigate',
      keywords: ['health', '健康', '弱密码', '泄露'],
      Icon: Activity,
      perform: nav('/health')
    },
    {
      id: 'nav.settings',
      title: '打开设置',
      subtitle: 'Settings',
      category: 'navigate',
      keywords: ['settings', '设置', '配置'],
      Icon: Settings,
      perform: nav('/settings')
    },
    {
      id: 'action.ensure-open',
      title: '重新打开保险库',
      subtitle: '系统钥匙串会话校验',
      category: 'action',
      keywords: ['vault', '保险库', '解锁', 'ensure', 'open', '会话'],
      Icon: ShieldCheck,
      perform: async () => {
        try {
          const anyWin = window as unknown as {
            api?: { vault?: { ensureOpen: () => Promise<unknown> } }
          }
          await anyWin.api?.vault?.ensureOpen?.()
        } finally {
          const api = getApi()
          await api?.hide()
        }
      }
    },
    {
      id: 'action.toggle-theme',
      title: '切换主题',
      subtitle: '浅色 / 深色',
      category: 'action',
      keywords: ['theme', '主题', 'dark', 'light', '夜间'],
      Icon: SunMoon,
      perform: async () => {
        try {
          const root = document.documentElement
          const current = root.getAttribute('data-theme') ?? 'light'
          const next = current === 'dark' ? 'light' : 'dark'
          root.setAttribute('data-theme', next)
          root.style.colorScheme = next
          try {
            window.localStorage.setItem('clipvault.theme.mode', next)
          } catch {
            /* ignore */
          }
        } finally {
          const api = getApi()
          await api?.hide()
        }
      }
    }
  ]
}

export const navigateSource: HudCommandSource = {
  id: 'navigate',
  label: '导航与操作',
  list: () => buildNavigateCommands()
}
