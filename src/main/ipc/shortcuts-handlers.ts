/**
 * 快捷键 IPC handlers (TASK-007)
 *
 * - shortcuts:list   返回当前全部快捷键
 * - shortcuts:set    更新某条快捷键 {commandId, accelerator}
 * - shortcuts:reset  重置某条（或全部）到默认值
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../types'
import { shortcutManager } from '../shortcuts'
import type { ShortcutCommandId, ShortcutRecord } from '../shortcuts'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'

interface SetPayload {
  commandId: ShortcutCommandId
  accelerator: string
}

interface ResetPayload {
  commandId?: ShortcutCommandId
}

export function registerShortcutHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_LIST,
    wrapHandler(async (): Promise<{ success: true; data: ShortcutRecord[] }> => {
      return { success: true, data: shortcutManager.list() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_SET,
    wrapHandler(async (_event, payload: SetPayload) => {
      if (!payload || typeof payload.commandId !== 'string') {
        return { success: false, error: 'Invalid payload' }
      }
      const ok = shortcutManager.set(payload.commandId, payload.accelerator ?? '')
      if (!ok) {
        return {
          success: false,
          error: 'Failed to register accelerator (conflict or invalid)',
          data: shortcutManager.list()
        }
      }
      return { success: true, data: shortcutManager.list() }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_RESET,
    wrapHandler(async (_event, payload?: ResetPayload) => {
      const data = shortcutManager.reset(payload?.commandId)
      return { success: true, data }
    })
  )

  logger.info('[IPC] Shortcuts handlers registered')
}
