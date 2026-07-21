/**
 * 系统级 IPC：版本、防火墙、本地偏好、图片目录选择
 */

import { ipcMain, shell, app, dialog, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../types'
import type { ApiResponse } from '../../types'
import { wrapHandler } from './utils'
import { logger } from '../utils/logger'
import {
  getPrefs,
  setPrefs,
  resolveImagesDir,
  getDefaultImagesDir,
  ensureImagesDirWritable,
  normalizeImagesDir,
  type ClipVaultPrefs
} from '../prefs'

export function registerSystemHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_GET_VERSION,
    wrapHandler(async (): Promise<ApiResponse<{ version: string; builtAt: string }>> => {
      return {
        success: true,
        data: {
          version: app.getVersion(),
          builtAt: new Date().toISOString()
        }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_OPEN_FIREWALL_SETTINGS,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      if (process.platform !== 'win32') {
        return { success: false, error: 'unsupported platform' }
      }
      try {
        const err = await shell.openPath('control firewall.cpl')
        if (err) {
          logger.warn(`[system] openPath firewall returned error: ${err}`)
          return { success: false, error: err }
        }
        return { success: true, data: true }
      } catch (err) {
        logger.warn(`[system] openFirewallSettings threw: ${(err as Error).message}`)
        return { success: false, error: (err as Error).message }
      }
    })
  )

  ipcMain.handle(
    IPC_CHANNELS.PREFS_GET,
    wrapHandler(
      async (): Promise<
        ApiResponse<
          ClipVaultPrefs & {
            resolvedImagesDir: string
            defaultImagesDir: string
          }
        >
      > => {
        const prefs = getPrefs()
        return {
          success: true,
          data: {
            ...prefs,
            resolvedImagesDir: resolveImagesDir(),
            defaultImagesDir: getDefaultImagesDir()
          }
        }
      }
    )
  )

  ipcMain.handle(
    IPC_CHANNELS.PREFS_SET,
    wrapHandler(
      async (
        _event,
        partial: Partial<ClipVaultPrefs>
      ): Promise<
        ApiResponse<
          ClipVaultPrefs & {
            resolvedImagesDir: string
            defaultImagesDir: string
            imageMigrate?: {
              scanned: number
              moved: number
              updated: number
              failed: number
              skipped: number
            }
          }
        >
      > => {
        const prevDir = resolveImagesDir()
        const patch: Partial<ClipVaultPrefs> = {}
        if (partial?.imagePasteMode) {
          patch.imagePasteMode = partial.imagePasteMode
        }
        if (typeof partial?.autoClearTtlMs === 'number') {
          patch.autoClearTtlMs = partial.autoClearTtlMs
        }
        if (typeof partial?.hideAfterCopy === 'boolean') {
          patch.hideAfterCopy = partial.hideAfterCopy
        }
        if (typeof partial?.minClipboardLength === 'number') {
          patch.minClipboardLength = partial.minClipboardLength
        }
        if (typeof partial?.onboardingTipsSeen === 'boolean') {
          patch.onboardingTipsSeen = partial.onboardingTipsSeen
        }
        let willMigrate = false
        let targetDir: string | null = null
        if (partial && 'imagesDir' in partial) {
          if (partial.imagesDir === null || partial.imagesDir === '') {
            patch.imagesDir = null
            targetDir = getDefaultImagesDir()
            willMigrate = prevDir !== targetDir
          } else {
            const dir = normalizeImagesDir(partial.imagesDir)
            if (!dir) {
              return { success: false, error: '请选择有效的绝对路径目录' }
            }
            const check = ensureImagesDirWritable(dir)
            if (!check.ok) {
              return {
                success: false,
                error: `目录不可写：${check.error ?? '未知错误'}`
              }
            }
            patch.imagesDir = dir
            targetDir = dir
            willMigrate = prevDir !== dir
          }
        }
        const next = setPrefs(patch)
        let imageMigrate:
          | {
              scanned: number
              moved: number
              updated: number
              failed: number
              skipped: number
            }
          | undefined
        if (willMigrate && targetDir) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { migrateClipboardImagePaths } = require('../storage/image-store') as {
              migrateClipboardImagePaths: (d: string) => {
                scanned: number
                moved: number
                updated: number
                failed: number
                skipped: number
              }
            }
            imageMigrate = migrateClipboardImagePaths(targetDir)
            logger.info(
              `[prefs] image migrate → ${targetDir}: moved=${imageMigrate.moved} failed=${imageMigrate.failed}`
            )
          } catch (err) {
            logger.warn('[prefs] image migrate failed:', err)
          }
        }
        return {
          success: true,
          data: {
            ...next,
            resolvedImagesDir: resolveImagesDir(),
            defaultImagesDir: getDefaultImagesDir(),
            imageMigrate
          }
        }
      }
    )
  )

  /** 弹出系统文件夹选择器，选定后写入 prefs.imagesDir，并尝试迁移历史截图 */
  ipcMain.handle(
    IPC_CHANNELS.PREFS_PICK_IMAGES_DIR,
    wrapHandler(
      async (
        event
      ): Promise<
        ApiResponse<
          ClipVaultPrefs & {
            resolvedImagesDir: string
            defaultImagesDir: string
            imageMigrate?: {
              scanned: number
              moved: number
              updated: number
              failed: number
              skipped: number
            }
          }
        >
      > => {
        const prevDir = resolveImagesDir()
        const win = BrowserWindow.fromWebContents(event.sender)
        const opts: Electron.OpenDialogOptions = {
          title: '选择截图存储文件夹',
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: prevDir
        }
        const result = win
          ? await dialog.showOpenDialog(win, opts)
          : await dialog.showOpenDialog(opts)
        if (result.canceled || !result.filePaths[0]) {
          return { success: false, error: '已取消' }
        }
        const dir = normalizeImagesDir(result.filePaths[0])
        if (!dir) {
          return { success: false, error: '无效目录' }
        }
        const check = ensureImagesDirWritable(dir)
        if (!check.ok) {
          return {
            success: false,
            error: `目录不可写：${check.error ?? '未知错误'}`
          }
        }
        const next = setPrefs({ imagesDir: dir })
        let imageMigrate:
          | {
              scanned: number
              moved: number
              updated: number
              failed: number
              skipped: number
            }
          | undefined
        if (prevDir !== dir) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { migrateClipboardImagePaths } = require('../storage/image-store') as {
              migrateClipboardImagePaths: (d: string) => {
                scanned: number
                moved: number
                updated: number
                failed: number
                skipped: number
              }
            }
            imageMigrate = migrateClipboardImagePaths(dir)
          } catch (err) {
            logger.warn('[prefs] pick dir migrate failed:', err)
          }
        }
        return {
          success: true,
          data: {
            ...next,
            resolvedImagesDir: resolveImagesDir(),
            defaultImagesDir: getDefaultImagesDir(),
            imageMigrate
          }
        }
      }
    )
  )

  /** 在资源管理器中打开当前图片目录 */
  ipcMain.handle(
    IPC_CHANNELS.PREFS_OPEN_IMAGES_DIR,
    wrapHandler(async (): Promise<ApiResponse<boolean>> => {
      const dir = resolveImagesDir()
      const check = ensureImagesDirWritable(dir)
      if (!check.ok) {
        return { success: false, error: check.error ?? '目录不可用' }
      }
      const err = await shell.openPath(dir)
      if (err) {
        return { success: false, error: err }
      }
      return { success: true, data: true }
    })
  )

  logger.info('[IPC] System handlers registered')
}
