/**
 * 导出 IPC 处理器（B-5 拆分自 data-handlers）
 *
 * 特性：
 * - A-1：JSON 导出三段式（纯 JSON 脱敏 / 加密 JSON / CSV）
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { IPC_CHANNELS, ApiResponse } from '../../types'
import { listCredentials } from '../../db/credential-store'
import { listClipboardHistory } from '../../db/clipboard-store'
import { listCategories } from '../../db/category-store'
import {
  createExportData,
  exportToJson,
  exportCredentialsToCsv,
  exportClipboardToCsv,
  generateExportFileName,
  toPlainExport,
  toEncryptedExport,
  type ExportMode
} from '../../utils/export'
import { wrapUnlockedHandler } from './utils'
import { logger } from '../utils/logger'

export interface ExportIpcOptions {
  format: 'json' | 'csv'
  includeCredentials: boolean
  includeClipboard: boolean
  includeCategories: boolean
  /** A-1：JSON 模式下 'plain' 脱敏凭证 value / 'encrypted' 用导出密码加密 */
  jsonMode?: ExportMode
  /** A-1：jsonMode==='encrypted' 时必填 */
  exportPassword?: string
}

export function registerExportHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_DIALOG,
    wrapUnlockedHandler(async (_event, options: ExportIpcOptions): Promise<ApiResponse<string>> => {
      try {
        const credentials = options.includeCredentials
          ? listCredentials({}).items
          : undefined
        const clipboardItems = options.includeClipboard
          ? listClipboardHistory({}).items
          : undefined
        const categories = options.includeCategories
          ? listCategories()
          : undefined

        let content: string
        let defaultPath: string

        if (options.format === 'json') {
          const base = createExportData(credentials, clipboardItems, categories)
          const mode: ExportMode = options.jsonMode ?? 'plain'

          if (mode === 'encrypted') {
            if (!options.exportPassword) {
              return { success: false, error: '加密模式需要提供导出密码' }
            }
            const encrypted = await toEncryptedExport(base, options.exportPassword)
            content = exportToJson(encrypted)
            defaultPath = generateExportFileName('json', 'encrypted')
          } else {
            const plain = toPlainExport(base)
            content = exportToJson(plain)
            defaultPath = generateExportFileName('json')
          }
        } else {
          // CSV 格式只导出凭证或剪贴板
          if (options.includeCredentials && credentials) {
            content = exportCredentialsToCsv(credentials)
            defaultPath = generateExportFileName('csv', 'credentials')
          } else if (options.includeClipboard && clipboardItems) {
            content = exportClipboardToCsv(clipboardItems)
            defaultPath = generateExportFileName('csv', 'clipboard')
          } else {
            return { success: false, error: '没有可导出的数据' }
          }
        }

        const result = await dialog.showSaveDialog(mainWindow, {
          title: '导出数据',
          defaultPath,
          filters: [
            options.format === 'json'
              ? { name: 'JSON 文件', extensions: ['json'] }
              : { name: 'CSV 文件', extensions: ['csv'] }
          ]
        })

        if (result.canceled || !result.filePath) {
          return { success: false, error: '导出已取消' }
        }

        writeFileSync(result.filePath, content, 'utf-8')
        logger.info('[Export] file written:', result.filePath)

        return { success: true, data: result.filePath }
      } catch (error) {
        const message = error instanceof Error ? error.message : '导出失败'
        logger.error('[Export] failed:', error)
        return { success: false, error: message }
      }
    })
  )
}
