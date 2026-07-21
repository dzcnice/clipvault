/**
 * 密钥拦截 IPC（原 Sprint4 中的 key-intercept 部分）
 * v3 个人版：分享包裹已下线，仅保留密钥拦截安装。
 */

import type { BrowserWindow } from 'electron'
import { installKeyIntercept } from '../clipboard/key-intercept'
import { logger } from '../utils/logger'

export function registerSprint4IPC(mainWindow: BrowserWindow | null): void {
  installKeyIntercept(mainWindow)
  logger.info('[IPC] key-intercept installed')
}
