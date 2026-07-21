/**
 * MainLayout · 像素壳 + 清晰导航文案
 */

import { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import TitleBar from '../components/TitleBar'
import {
  Activity,
  ClipboardList,
  KeyRound,
  LayoutDashboard,
  Scissors,
  Settings,
  type LucideIcon
} from 'lucide-react'

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  hint?: string
}

const PRIMARY_NAV: NavItem[] = [
  { path: '/clipboard', label: '剪贴板', icon: ClipboardList, hint: '历史记录' },
  { path: '/credentials', label: '凭证', icon: KeyRound, hint: '钥匙箱' },
  { path: '/snippets', label: '片段', icon: Scissors, hint: '常用模板' }
]

const SECONDARY_NAV: NavItem[] = [
  { path: '/dashboard', label: '概览', icon: LayoutDashboard },
  { path: '/health', label: '健康', icon: Activity },
  { path: '/settings', label: '设置', icon: Settings }
]

function readVersionInfo(): Promise<{ version: string; builtAt: string } | null> {
  const api = (
    window as unknown as {
      api?: {
        system?: {
          getVersion?: () => Promise<{
            success: boolean
            data?: { version: string; builtAt: string }
          }>
        }
      }
    }
  ).api
  if (!api?.system?.getVersion) return Promise.resolve(null)
  return api.system
    .getVersion()
    .then((res) => (res.success && res.data ? res.data : null))
    .catch(() => null)
}

export default function MainLayout(): JSX.Element {
  const [versionInfo, setVersionInfo] = useState<{
    version: string
    builtAt: string
  } | null>(null)

  useEffect(() => {
    void readVersionInfo().then((info) => {
      if (info) setVersionInfo(info)
    })
  }, [])

  const renderNav = (items: NavItem[]): JSX.Element => (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `cv-sidebar-item ${isActive ? 'cv-sidebar-item-active' : ''}`
            }
            title={item.hint ?? item.label}
          >
            <span className="cv-icon-slot !h-8 !w-8">
              <Icon size={15} strokeWidth={2.25} />
            </span>
            <span className="truncate">{item.label}</span>
          </NavLink>
        )
      })}
    </div>
  )

  return (
    <div className="cv-app-shell">
      <TitleBar />

      <div className="flex min-h-0 flex-1 gap-3 p-3 pt-1">
        <aside className="cv-panel-soft flex w-[15rem] shrink-0 flex-col overflow-hidden">
          <div className="flex items-center gap-3 border-b-2 border-[var(--line)] px-3 py-3">
            <div
              className="cv-icon-slot !h-10 !w-10"
              style={{
                background: 'var(--primary)',
                color: 'var(--primary-foreground)'
              }}
            >
              <KeyRound size={18} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="font-pixel truncate text-[15px] font-bold tracking-wide text-foreground">
                ClipVault
              </div>
              <div className="font-body text-[11px] text-muted-foreground">本地钥匙箱</div>
            </div>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
            <div>
              <div className="cv-kicker mb-2 px-2">背包</div>
              {renderNav(PRIMARY_NAV)}
            </div>
            <div className="cv-divider mx-1" />
            <div>
              <div className="cv-kicker mb-2 px-2">工具</div>
              {renderNav(SECONDARY_NAV)}
            </div>
          </nav>

          <div className="border-t-2 border-[var(--line)] px-3 py-2">
            <p className="font-mono text-[10px] text-muted-foreground">
              v{versionInfo?.version ?? '…'}
            </p>
            <p className="font-body mt-0.5 text-[11px] text-muted-foreground">
              本机存档 · 免登录
            </p>
          </div>
        </aside>

        <main className="cv-panel min-w-0 flex-1 overflow-hidden animate-fadeIn">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
