/**
 * shortcuts 子目录内部导出（供同目录内部使用）。
 *
 * 外部消费者请从 `src/main/shortcuts.ts` 导入，避免重复注册 app 生命周期监听。
 */

export { shortcutManager } from './manager'
export type { ShortcutCommandId, ShortcutRecord, ShortcutCommand } from './types'
