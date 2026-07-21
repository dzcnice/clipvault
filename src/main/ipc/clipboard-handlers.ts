/**
 * 剪贴板相关 IPC 处理器
 *
 * v3.0 个人本地版：仅 personal 工作区，无团队推送 / 文件传输透传。
 */

import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../types'
import * as clipboardStore from '../../db/clipboard-store'
import { getClipboardMonitor, ClipboardChangeEvent } from '../clipboard/monitor'
import { wrapHandler, wrapUnlockedHandler } from './utils'
import { logger } from '../utils/logger'
import { getImagePasteMode } from '../prefs'
import type {
  ClipboardFilter,
  ClipboardItem,
  CreateSnippetInput,
  UpdateSnippetInput,
  ApiResponse,
  WorkspaceContext
} from '../../types'

/** 工作区入参归一化：个人版强制 personal */
function normalizeWorkspace(_ws?: unknown): WorkspaceContext {
  return 'personal'
}

function imageModeLabel(mode: string): string {
  if (mode === 'path') return '路径已写入剪贴板'
  if (mode === 'image') return '图片已写入剪贴板'
  return '图片+路径已写入剪贴板'
}

/** 注册剪贴板相关的 IPC 处理器 */
export function registerClipboardHandlers(mainWindow: BrowserWindow): void {
  const monitor = getClipboardMonitor()

  // 监听剪贴板变化，保存到数据库并通知渲染进程（始终 personal）
  monitor.on('change', async (event: ClipboardChangeEvent) => {
    try {
      const item = await clipboardStore.addClipboardItem(
        {
          type: event.type,
          content: event.content,
          imageData: event.imageData,
          filePath: event.filePath
        },
        event.detectedKeyType,
        'personal'
      )

      if (item && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CLIPBOARD_NEW_ITEM, item)
      }

      // 截图/图片：按用户偏好写回系统剪贴板（both / path / image）
      if (item && item.type === 'image' && item.imagePath && item.imageData) {
        try {
          const mode = getImagePasteMode()
          monitor.writeImagePaste(item.imageData, item.imagePath, mode)
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard:image-paste-mode', {
              mode,
              path: item.imagePath,
              label: imageModeLabel(mode)
            })
          }
        } catch (err) {
          logger.warn('[IPC] auto image paste failed:', err)
        }
      }
    } catch (error) {
      logger.error('[IPC] Error saving clipboard item:', error)
    }
  })

  // 获取剪贴板历史（v2.1 · 支持 workspace 过滤，缺省 personal）
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_GET_HISTORY,
    wrapHandler(async (
      _event,
      params: {
        filter?: ClipboardFilter
        limit?: number
        offset?: number
        workspace?: WorkspaceContext
      }
    ): Promise<ApiResponse<{ items: ClipboardItem[]; total: number }>> => {
      try {
        const workspace = normalizeWorkspace(params?.workspace)
        const result = clipboardStore.listClipboardHistory(
          params?.filter,
          params?.limit,
          params?.offset,
          workspace
        )
        return { success: true, data: result }
      } catch (error) {
        logger.error('[IPC] Error getting clipboard history:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 清空剪贴板历史
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_CLEAR_HISTORY,
    wrapHandler(async (): Promise<ApiResponse<number>> => {
      try {
        const count = clipboardStore.clearClipboardHistory()
        return { success: true, data: count }
      } catch (error) {
        logger.error('[IPC] Error clearing clipboard history:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 删除单个剪贴板项
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_DELETE_ITEM,
    wrapHandler(async (_event, id: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = clipboardStore.deleteClipboardItem(id)
        return { success, data: success }
      } catch (error) {
        logger.error('[IPC] Error deleting clipboard item:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 切换置顶状态
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_PIN_ITEM,
    wrapHandler(async (_event, id: string): Promise<ApiResponse<boolean>> => {
      try {
        const isPinned = clipboardStore.toggleClipboardPin(id)
        return { success: true, data: isPinned }
      } catch (error) {
        logger.error('[IPC] Error toggling pin:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 复制剪贴板项到系统剪贴板
  // 可选 mode：图片项可指定 both | path | image；缺省走全局偏好
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_COPY_ITEM,
    wrapHandler(async (
      _event,
      id: string,
      opts?: { mode?: 'both' | 'path' | 'image' }
    ): Promise<ApiResponse<boolean>> => {
      try {
        const item = clipboardStore.getClipboardItemById(id)
        if (!item) {
          return { success: false, error: '记录不存在' }
        }

        if (item.type === 'text' || item.type === 'html') {
          monitor.writeText(item.content || '')
        } else if (item.type === 'image') {
          const mode = opts?.mode ?? getImagePasteMode()
          if (mode === 'path') {
            if (!item.imagePath) {
              return { success: false, error: '无本地路径' }
            }
            monitor.writeText(monitor.formatPathText(item.imagePath))
          } else if (item.imageData && item.imagePath && mode === 'both') {
            monitor.writeImagePaste(item.imageData, item.imagePath, 'both')
          } else if (item.imageData) {
            monitor.writeImage(item.imageData)
          } else {
            return { success: false, error: '图片数据不可用' }
          }
        }

        clipboardStore.recordClipboardUsage(id)
        return { success: true, data: true }
      } catch (error) {
        logger.error('[IPC] Error copying clipboard item:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  /**
   * 复制图片磁盘路径为「纯文本」到系统剪贴板。
   * 用途：在终端 / CLI 里直接 Ctrl+V 得到绝对路径，无需先另存到文件夹。
   * 返回 data = 路径字符串。
   */
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_COPY_PATH,
    wrapHandler(async (_event, id: string): Promise<ApiResponse<string>> => {
      try {
        const path = clipboardStore.getClipboardImagePath(id)
        if (!path) {
          return {
            success: false,
            error: '该记录没有可复制的本地路径（仅截图/图片历史支持）'
          }
        }
        // 路径原样写入文本；Windows 终端粘贴可直接给 CLI 用
        monitor.writeText(path)
        clipboardStore.recordClipboardUsage(id)
        return { success: true, data: path }
      } catch (error) {
        logger.error('[IPC] Error copying clipboard path:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 创建快速片段（v2.1 · 支持 workspace，缺省 personal）
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_CREATE_SNIPPET,
    wrapHandler(async (
      _event,
      input: CreateSnippetInput & { workspace?: WorkspaceContext }
    ): Promise<ApiResponse<ClipboardItem>> => {
      try {
        const workspace = normalizeWorkspace(input.workspace)
        const snippet = clipboardStore.createSnippet(input, workspace)
        return { success: true, data: snippet }
      } catch (error) {
        logger.error('[IPC] Error creating snippet:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 更新快速片段
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_UPDATE_SNIPPET,
    wrapHandler(async (_event, input: UpdateSnippetInput): Promise<ApiResponse<ClipboardItem>> => {
      try {
        const snippet = clipboardStore.updateSnippet(input)
        if (!snippet) {
          return { success: false, error: '片段不存在' }
        }
        return { success: true, data: snippet }
      } catch (error) {
        logger.error('[IPC] Error updating snippet:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 获取所有快速片段（v2.1 · 支持 workspace 过滤，缺省 personal）
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_GET_SNIPPETS,
    wrapHandler(async (
      _event,
      params?: { workspace?: WorkspaceContext }
    ): Promise<ApiResponse<ClipboardItem[]>> => {
      try {
        const workspace = normalizeWorkspace(params?.workspace)
        const snippets = clipboardStore.getSnippets(workspace)
        return { success: true, data: snippets }
      } catch (error) {
        logger.error('[IPC] Error getting snippets:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // v3.0：团队推送已下线；保留通道返回明确错误，避免旧 preload 崩溃
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_PUSH_TO_TEAM,
    wrapUnlockedHandler(async (): Promise<ApiResponse<{ id: string }>> => {
      return { success: false, error: '个人本地版不支持团队推送' }
    })
  )

  // 获取监听器状态
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_MONITOR_STATUS,
    wrapHandler(async (): Promise<ApiResponse<{ isRunning: boolean; interval: number }>> => {
      try {
        const status = monitor.getStatus()
        return { success: true, data: status }
      } catch (error) {
        logger.error('[IPC] Error getting monitor status:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 切换监听器状态
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_TOGGLE_MONITOR,
    wrapHandler(async (_event, enabled: boolean): Promise<ApiResponse<boolean>> => {
      try {
        if (enabled) {
          monitor.start()
        } else {
          monitor.stop()
        }
        return { success: true, data: enabled }
      } catch (error) {
        logger.error('[IPC] Error toggling monitor:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 启动剪贴板监听
  monitor.start()

  logger.info('[IPC] Clipboard handlers registered')
}
