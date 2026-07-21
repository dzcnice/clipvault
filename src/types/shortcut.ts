/**
 * 快捷键相关类型（主进程 / 渲染进程共享）
 *
 * 与 src/main/shortcuts/types.ts 的定义保持一致；后者是内部实现细节，
 * 本文件是跨进程可见的公共契约。
 */

export type ShortcutCommandId =
  | 'window.toggle'
  | 'search.focus'
  | 'credential.new'
  | 'clipboard.pasteRecent'
  | 'hud.toggle'

export interface ShortcutRecord {
  commandId: ShortcutCommandId
  label: string
  defaultAccelerator: string
  currentAccelerator: string
  isDefault: boolean
  isRegistered: boolean
}
