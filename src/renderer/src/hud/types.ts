/**
 * HUD 渲染侧类型（v2.0 Sprint 6）
 */

import type { LucideIcon } from 'lucide-react'

export type HudCommandCategory =
  | 'search'
  | 'navigate'
  | 'action'
  | 'credential'
  | 'clipboard'
  | 'snippet'

export interface HudCommand {
  id: string
  title: string
  subtitle?: string
  category: HudCommandCategory
  keywords?: string[]
  Icon?: LucideIcon
  shortcut?: string
  perform: () => void | Promise<void>
}

/** 注册源：允许静态或动态 */
export interface HudCommandSource {
  id: string
  label: string
  list: () => HudCommand[] | Promise<HudCommand[]>
}
