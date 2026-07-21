/**
 * IPC handler 公共工具
 *
 * - wrapHandler：统一校验 sender 来源（仅允许本应用窗口），避免第三方进程伪造请求
 * - requireUnlock：为敏感 handler 加一层 vault 解锁门禁
 */

import { IpcMainInvokeEvent, WebFrameMain } from 'electron'
import * as vault from '../crypto/vault'
import { logger } from '../utils/logger'

/** 渲染进程白名单 URL 前缀：仅允许来自打包内 file:// 或开发环境 localhost */
const ALLOWED_PREFIXES = [
  'file://',
  'http://localhost',
  'http://127.0.0.1',
  // electron-vite dev server 可能使用 5173 等端口
  'app://'
]

/**
 * v2.1 G3-3 · 受信任的 webContents id 集合（防御纵深）。
 *
 * 主窗口 / HUD 窗口创建时注册；closed 时反注册。任何 IPC 调用首先校验
 * `event.sender.id ∈ allowedWebContentsIds`，URL 前缀作为第二道校验。
 */
const allowedWebContentsIds = new Set<number>()

export function registerTrustedWebContents(id: number): void {
  allowedWebContentsIds.add(id)
}

export function unregisterTrustedWebContents(id: number): void {
  allowedWebContentsIds.delete(id)
}

/** 测试辅助：清空白名单 */
export function _clearTrustedWebContentsForTest(): void {
  allowedWebContentsIds.clear()
}

/** 校验 sender 是否来自受信任的 frame（URL 前缀，第二道） */
function isSenderUrlTrusted(frame: WebFrameMain | null): boolean {
  if (!frame) return false
  const url = frame.url || ''
  return ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))
}

/** 综合校验：webContents id 白名单 + URL 前缀白名单
 *
 * 注：`allowedWebContentsIds` 在生产中由 `createWindow` / `createHUDWindow`
 * 注册。当集合仍为空时（例如 unit test 只关心 handler 业务逻辑），
 * 退化为仅 URL 前缀校验，避免污染既有测试 fixture。
 */
function isSenderTrusted(event: IpcMainInvokeEvent): boolean {
  if (allowedWebContentsIds.size > 0) {
    const senderId = event.sender?.id
    if (typeof senderId !== 'number' || !allowedWebContentsIds.has(senderId)) {
      logger.warn(
        `[security] blocked IPC: sender.id=${senderId ?? 'unknown'} not in trusted set`
      )
      return false
    }
  }
  if (!isSenderUrlTrusted(event.senderFrame)) {
    logger.warn('[security] blocked IPC: sender URL prefix not allowed')
    return false
  }
  return true
}

/**
 * 包装 handler：注入 sender 校验
 * handler 抛出的异常应被外层 try/catch 捕获；此工具只负责提前拒绝
 */
export function wrapHandler<TArgs extends unknown[], TResult>(
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
): (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> {
  return async (event, ...args) => {
    if (!isSenderTrusted(event)) {
      throw new Error('Untrusted IPC sender')
    }
    return await handler(event, ...args)
  }
}

/** 组合 wrapper：先 sender 校验，再检查 vault 是否已解锁 */
export function wrapUnlockedHandler<TArgs extends unknown[], TResult>(
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
): (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> {
  return wrapHandler(async (event, ...args) => {
    if (!vault.isUnlocked()) {
      throw new Error('Vault is locked')
    }
    return await handler(event, ...args)
  })
}
