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
  /** 凭证字段（目标形态）：不选 value 时强制脱敏 */
  credentialFields?: {
    value?: boolean
    description?: boolean
    tags?: boolean
    metadata?: boolean
    timestamps?: boolean
  }
  /** 仅导出此时间之后创建的凭证（ms epoch） */
  credentialsSince?: number
  /** 仅导出此时间之后的剪贴板 */
  clipboardSince?: number
}

export function registerExportHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.EXPORT_DIALOG,
    wrapUnlockedHandler(async (_event, options: ExportIpcOptions): Promise<ApiResponse<string>> => {
      try {
        // 生物识别门禁（目标形态）
        const { confirmSensitiveAction } = await import('../biometric/confirm')
        const bio = await confirmSensitiveAction('export', 'ClipVault：确认导出数据')
        if (!bio.ok) {
          return { success: false, error: bio.error || '生物识别未通过' }
        }

        let credentials = options.includeCredentials
          ? listCredentials({}).items
          : undefined
        let clipboardItems = options.includeClipboard
          ? listClipboardHistory(undefined, 5000).items
          : undefined
        const categories = options.includeCategories
          ? listCategories()
          : undefined

        if (credentials && options.credentialsSince) {
          const since = options.credentialsSince
          credentials = credentials.filter((c: { createdAt: number }) => c.createdAt >= since)
        }
        if (clipboardItems && options.clipboardSince) {
          const since = options.clipboardSince
          clipboardItems = clipboardItems.filter(
            (c: { createdAt: number }) => c.createdAt >= since
          )
        }

        // 字段裁剪（目标结构：永远是 Credential 形状，未选字段置空）
        const fields = options.credentialFields
        if (credentials && fields) {
          credentials = credentials.map(
            (c: {
              value: string
              description?: string
              tags: string[]
              metadata: Record<string, unknown>
              createdAt: number
              updatedAt: number
            }) => ({
              ...c,
              value: fields.value === false ? '' : c.value,
              description: fields.description === false ? undefined : c.description,
              tags: fields.tags === false ? [] : c.tags,
              metadata: fields.metadata === false ? {} : c.metadata,
              createdAt: fields.timestamps === false ? 0 : c.createdAt,
              updatedAt: fields.timestamps === false ? 0 : c.updatedAt
            })
          )
        }

        let content: string
        let defaultPath: string

        if (options.format === 'json') {
          const base = createExportData(credentials, clipboardItems, categories)
          const mode: ExportMode = options.jsonMode ?? 'plain'
          // 未勾选 value 时强制 plain 脱敏路径再清一次
          const forceNoValue = fields?.value === false

          if (mode === 'encrypted' && !forceNoValue) {
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
