/**
 * 快捷键管理框架类型定义（v2.0 TASK-007）
 */

/** 命令 ID：稳定的字符串标识符，用作数据库主键 */
export type ShortcutCommandId =
  | 'window.toggle'
  | 'search.focus'
  | 'credential.new'
  | 'clipboard.pasteRecent'
  | 'hud.toggle'

/** 单个命令定义 */
export interface ShortcutCommand {
  id: ShortcutCommandId
  /** 默认 accelerator（Electron 格式，如 'CommandOrControl+Space'） */
  defaultAccelerator: string
  /** 国际化 label key（暂时允许中文硬编码） */
  label: string
  /** 执行处理器（Manager 注入运行时依赖） */
  handler: (ctx: ShortcutContext) => void
}

/** 注册运行时上下文 */
export interface ShortcutContext {
  commandId: ShortcutCommandId
}

/** 对外暴露的快捷键记录（IPC 序列化友好） */
export interface ShortcutRecord {
  commandId: ShortcutCommandId
  label: string
  defaultAccelerator: string
  currentAccelerator: string
  isDefault: boolean
  /** 当前是否成功注册到系统 */
  isRegistered: boolean
}
