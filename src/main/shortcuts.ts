/**
 * 快捷键模块入口（v2.0 TASK-007）
 *
 * 实现拆分到 `./shortcuts/` 子目录：
 *   - shortcuts/manager.ts   核心 Manager 类
 *   - shortcuts/registry.ts  默认命令清单
 *   - shortcuts/types.ts     类型定义
 *
 * 本文件保留 v1 的公开入口签名（initGlobalShortcuts / unregisterAllShortcuts），
 * 以便 src/main/index.ts 无需改动。
 */

import type { BrowserWindow } from 'electron'
import { app } from 'electron'
import { shortcutManager } from './shortcuts/manager'

export { shortcutManager } from './shortcuts/manager'
export type { ShortcutCommandId, ShortcutRecord } from './shortcuts/types'

/** 旧 API：初始化全局快捷键（保持向后兼容） */
export function initGlobalShortcuts(window: BrowserWindow): void {
  shortcutManager.init(window)
}

/** 旧 API：注销全部（保持向后兼容） */
export function unregisterAllShortcuts(): void {
  shortcutManager.unregisterAll()
}

/** 兼容 v1 的 ShortcutConfig 类型（仅 IPC 向后兼容用） */
export interface ShortcutConfig {
  toggleWindow: string
  quickSearch: string
  newCredential: string
  pasteRecent: string
}

// 应用退出时清理
app.on('will-quit', () => {
  unregisterAllShortcuts()
})
