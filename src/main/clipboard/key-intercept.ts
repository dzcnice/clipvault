/**
 * 密钥拦截主流程（v3.0 个人本地版）
 *
 * 职责：
 *   1. 订阅 ClipboardMonitor 的 'key-detected' 事件
 *   2. 通过 IPC 通知渲染进程弹窗
 *   3. 用户可选择：存入本地凭证库 / 取消
 *   4. shareAsCredential 在个人版等同 saveLocalOnly（无团队）
 */

import type { BrowserWindow } from 'electron'
import { ipcMain } from 'electron'
import { getClipboardMonitor } from './monitor'
import { IPC_CHANNELS } from '../../types'
import { logger } from '../utils/logger'

export interface KeyInterceptPromptPayload {
  /** 唯一 promptId（用于回应配对） */
  promptId: string
  /** 命中的密钥类型（来自 key-detector） */
  detectedKeyType: string
  /** 原始内容（敏感，渲染端只做脱敏预览） */
  content: string
  /** 触发时的剪贴板内容类型 */
  contentType: string
}

export interface KeyInterceptDecision {
  promptId: string
  action: 'shareAsCredential' | 'saveLocalOnly' | 'cancel'
}

/** 待回应的 prompt 集合 */
const pending = new Map<
  string,
  { resolve: (d: KeyInterceptDecision) => void; timer: NodeJS.Timeout }
>()

let installed = false

/**
 * 启动密钥拦截主流程。
 * 由 sprint4-registry 调用，main window 必须存在以便 send。
 */
export function installKeyIntercept(mainWindow: BrowserWindow | null): void {
  if (installed) return
  installed = true

  const monitor = getClipboardMonitor()

  monitor.on(
    'key-detected',
    (payload: { content: string; detectedKeyType: string; type: string }) => {
      if (!mainWindow || mainWindow.isDestroyed()) return

      const promptId = `kip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const data: KeyInterceptPromptPayload = {
        promptId,
        detectedKeyType: payload.detectedKeyType,
        content: payload.content,
        contentType: payload.type
      }
      logger.info(
        `[KeyIntercept] hit ${payload.detectedKeyType}, prompting ${promptId}`
      )

      // 60s 超时自动 cancel，避免泄漏
      const timer = setTimeout(() => {
        const entry = pending.get(promptId)
        if (entry) {
          entry.resolve({ promptId, action: 'cancel' })
          pending.delete(promptId)
          logger.warn(`[KeyIntercept] prompt ${promptId} timeout → cancel`)
        }
      }, 60_000)

      pending.set(promptId, {
        resolve: () => {
          /* renderer-driven */
        },
        timer
      })

      try {
        mainWindow.webContents.send(IPC_CHANNELS.KEY_INTERCEPT_PROMPT, data)
      } catch (err) {
        logger.error('[KeyIntercept] send prompt failed', err)
        clearTimeout(timer)
        pending.delete(promptId)
      }
    }
  )

  // 渲染→主：用户决定
  ipcMain.on(
    IPC_CHANNELS.KEY_INTERCEPT_DECISION,
    (_event, decision: KeyInterceptDecision) => {
      const entry = pending.get(decision.promptId)
      if (!entry) {
        logger.warn(`[KeyIntercept] unknown promptId ${decision.promptId}`)
        return
      }
      clearTimeout(entry.timer)
      pending.delete(decision.promptId)
      logger.info(
        `[KeyIntercept] decision ${decision.promptId} → ${decision.action}`
      )
    }
  )

  logger.info('[KeyIntercept] installed (personal-local)')
}

/** 测试辅助：清理状态 */
export function _resetKeyInterceptForTests(): void {
  for (const [, entry] of pending) clearTimeout(entry.timer)
  pending.clear()
  installed = false
}
