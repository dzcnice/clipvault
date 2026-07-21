/**
 * 导入 IPC 处理器（B-5 拆分自 data-handlers）
 *
 * 职责：
 * - 通过 dialog 选择 JSON/CSV 文件
 * - JSON 加密模式时二次提示导出密码
 * - 把 CC 巨大的 IMPORT_DATA 拆为 importCategories/importCredentials/importClipboardHistory
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { IPC_CHANNELS, ApiResponse } from '../../types'
import {
  getCredentialById,
  createCredential
} from '../../db/credential-store'
import { createSnippet } from '../../db/clipboard-store'
import { listCategories, createCategory } from '../../db/category-store'
import {
  parseJsonImport,
  parseCredentialsCsv,
  parseClipboardCsv,
  validateCredentials,
  validateClipboardItems,
  detectImportFormat,
  isEncryptedExport,
  decryptImportedData
} from '../../utils/import'
import { wrapUnlockedHandler } from './utils'
import { logger } from '../utils/logger'
import type { ExportData } from '../../utils/export'

export interface ImportStats {
  credentials?: { total: number; imported: number; skipped: number }
  clipboardItems?: { total: number; imported: number; skipped: number }
  categories?: { total: number; imported: number; skipped: number }
}

export interface ImportResult {
  success: boolean
  message: string
  stats?: ImportStats
  /** 如果为 true，渲染端需要向用户询问导出密码后再调一次 `data:import-decrypt` */
  needPassword?: boolean
  /** 上一步选中的文件路径，二次调用时带回 */
  filePath?: string
}

/** B-5 子函数：导入分类 */
export function importCategories(
  data: ExportData
): ImportStats['categories'] | undefined {
  if (!data.categories || data.categories.length === 0) return undefined
  const stats = { total: data.categories.length, imported: 0, skipped: 0 }
  for (const cat of data.categories) {
    try {
      const existing = listCategories().find((c) => c.name === cat.name)
      if (existing) {
        stats.skipped++
        continue
      }
      createCategory({
        name: cat.name,
        parentId: cat.parentId,
        icon: cat.icon,
        color: cat.color
      })
      stats.imported++
    } catch (err) {
      logger.error('[import] category skipped:', err)
      stats.skipped++
    }
  }
  return stats
}

/** B-5 子函数：导入凭证 */
export function importCredentials(
  data: ExportData
): ImportStats['credentials'] | undefined {
  if (!data.credentials || data.credentials.length === 0) return undefined
  const stats = { total: data.credentials.length, imported: 0, skipped: 0 }
  for (const cred of data.credentials) {
    try {
      // 跳过脱敏（value 为空）的记录
      if (!cred.value) {
        stats.skipped++
        continue
      }
      const existing = getCredentialById(cred.id)
      if (existing) {
        stats.skipped++
        continue
      }
      createCredential({
        name: cred.name,
        type: cred.type,
        value: cred.value,
        description: cred.description,
        categoryId: cred.categoryId,
        tags: cred.tags,
        metadata: cred.metadata
      })
      stats.imported++
    } catch (err) {
      logger.error('[import] credential skipped:', err)
      stats.skipped++
    }
  }
  return stats
}

/** B-5 子函数：导入剪贴板（历史记录忽略，仅 snippet 入库） */
export function importClipboardHistory(
  data: ExportData
): ImportStats['clipboardItems'] | undefined {
  if (!data.clipboardItems || data.clipboardItems.length === 0) return undefined
  const stats = { total: data.clipboardItems.length, imported: 0, skipped: 0 }
  for (const item of data.clipboardItems) {
    try {
      if (!item.isSnippet) {
        stats.skipped++ // 非片段忽略
        continue
      }
      const fallbackName =
        item.snippetName || item.content?.slice(0, 20) || 'untitled'
      createSnippet({
        name: fallbackName,
        content: item.content || ''
      })
      stats.imported++
    } catch (err) {
      logger.error('[import] clipboard snippet skipped:', err)
      stats.skipped++
    }
  }
  return stats
}

/** B-5 子函数：统一协调导入 */
function runImport(data: ExportData): ImportStats {
  const stats: ImportStats = {}
  const credStats = importCredentials(data)
  if (credStats) stats.credentials = credStats
  const clipStats = importClipboardHistory(data)
  if (clipStats) stats.clipboardItems = clipStats
  const catStats = importCategories(data)
  if (catStats) stats.categories = catStats
  return stats
}

/** 注册导入相关的 IPC handler */
export function registerImportHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(
    IPC_CHANNELS.IMPORT_DATA,
    wrapUnlockedHandler(async (
      _event,
      payload?: { filePath?: string; password?: string }
    ): Promise<ApiResponse<ImportResult>> => {
      try {
        let filePath = payload?.filePath
        if (!filePath) {
          const result = await dialog.showOpenDialog(mainWindow, {
            title: '导入数据',
            filters: [
              { name: '支持的文件', extensions: ['json', 'csv'] },
              { name: 'JSON 文件', extensions: ['json'] },
              { name: 'CSV 文件', extensions: ['csv'] }
            ],
            properties: ['openFile']
          })
          if (result.canceled || result.filePaths.length === 0) {
            return { success: false, error: '导入已取消' }
          }
          filePath = result.filePaths[0]
        }
        if (!filePath) {
          return { success: false, error: '未选择导入文件' }
        }

        const content = readFileSync(filePath, 'utf-8')
        const format = detectImportFormat(content)

        if (format === 'unknown') {
          return { success: false, error: '无法识别的文件格式' }
        }

        if (format === 'json') {
          let data = parseJsonImport(content)
          if (!data) {
            return { success: false, error: '无效的 JSON 数据' }
          }
          if (isEncryptedExport(data)) {
            if (!payload?.password) {
              // 告知渲染端需要二次输入密码
              return {
                success: true,
                data: {
                  success: false,
                  message: '该导出文件已加密，请输入导出密码后重试',
                  needPassword: true,
                  filePath
                }
              }
            }
            try {
              data = decryptImportedData(data, payload.password)
            } catch (err) {
              return {
                success: false,
                error: (err as Error).message
              }
            }
          }
          const stats = runImport(data)
          const totalImported =
            (stats.credentials?.imported || 0) +
            (stats.clipboardItems?.imported || 0) +
            (stats.categories?.imported || 0)
          return {
            success: true,
            data: {
              success: true,
              message: `成功导入 ${totalImported} 条记录`,
              stats
            }
          }
        }

        // CSV 格式
        const stats: ImportStats = {}
        const csvCredentials = parseCredentialsCsv(content)
        if (csvCredentials.length > 0) {
          const { valid } = validateCredentials(csvCredentials)
          const credStats = {
            total: csvCredentials.length,
            imported: 0,
            skipped: csvCredentials.length - valid.length
          }
          for (const cred of valid) {
            try {
              createCredential({
                name: cred.name!,
                type: cred.type!,
                value: cred.value!,
                description: cred.description,
                tags: cred.tags
              })
              credStats.imported++
            } catch (err) {
              logger.error('[import] csv credential skipped:', err)
              credStats.skipped++
            }
          }
          stats.credentials = credStats
        } else {
          const csvClipboardItems = parseClipboardCsv(content)
          if (csvClipboardItems.length > 0) {
            const { valid } = validateClipboardItems(csvClipboardItems)
            const clipStats = {
              total: csvClipboardItems.length,
              imported: 0,
              skipped: csvClipboardItems.length - valid.length
            }
            for (const item of valid) {
              try {
                if (item.isSnippet) {
                  const fallbackName =
                    item.snippetName || item.content?.slice(0, 20) || 'untitled'
                  createSnippet({
                    name: fallbackName,
                    content: item.content!
                  })
                  clipStats.imported++
                } else {
                  clipStats.skipped++
                }
              } catch (err) {
                logger.error('[import] csv snippet skipped:', err)
                clipStats.skipped++
              }
            }
            stats.clipboardItems = clipStats
          }
        }

        const totalImported =
          (stats.credentials?.imported || 0) +
          (stats.clipboardItems?.imported || 0) +
          (stats.categories?.imported || 0)

        return {
          success: true,
          data: {
            success: true,
            message: `成功导入 ${totalImported} 条记录`,
            stats
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '导入失败'
        logger.error('[Import] failed:', error)
        return { success: false, error: message }
      }
    })
  )
}
