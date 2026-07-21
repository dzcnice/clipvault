/**
 * HUD (Heads-Up Display) 类型定义（v2.0 Sprint 6）
 *
 * HUD = Alt+Space 召唤的命令面板独立窗口
 */

/** HUD IPC 通道名 */
export const HUD_CHANNELS = {
  /** 主 -> 渲染：HUD 显示 */
  HUD_SHOWN: 'hud:shown',
  /** 主 -> 渲染：HUD 隐藏 */
  HUD_HIDDEN: 'hud:hidden',
  /** 渲染 -> 主：请求隐藏 HUD */
  HUD_HIDE: 'hud:hide',
  /** 渲染 -> 主：请求跳转主窗口路由并隐藏 HUD */
  HUD_NAVIGATE: 'hud:navigate',
  /** 渲染 -> 主：切换 HUD 可见性 */
  HUD_TOGGLE: 'hud:toggle'
} as const

export type HudChannel = (typeof HUD_CHANNELS)[keyof typeof HUD_CHANNELS]

/** HUD 命令类别 */
export type HudCommandCategory =
  | 'search'
  | 'navigate'
  | 'action'

/** 单条命令定义 */
export interface HudCommand {
  /** 命令唯一 ID */
  id: string
  /** 展示标题 */
  title: string
  /** 副标题/提示 */
  subtitle?: string
  /** 类别 */
  category: HudCommandCategory
  /** 关键词（用于 cmdk 过滤） */
  keywords?: string[]
  /** 图标名（lucide-react） */
  icon?: string
  /** 快捷键显示 */
  shortcut?: string
  /** 执行函数（返回 void 或 Promise） */
  perform: () => void | Promise<void>
}

/** 命令注册源：静态清单或异步工厂 */
export interface HudCommandSource {
  id: string
  label: string
  list: () => HudCommand[] | Promise<HudCommand[]>
}
