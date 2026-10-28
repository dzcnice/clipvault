/**
 * 剪贴板相关 IPC 处理器
 *
 * v3.0 个人本地版：仅 personal 工作区，无团队推送 / 文件传输透传。
 */

import { ipcMain, BrowserWindow, clipboard } from 'electron'
import { IPC_CHANNELS, ClipboardContentType } from '../../types'
import * as clipboardStore from '../../db/clipboard-store'
import { getClipboardMonitor, ClipboardChangeEvent } from '../clipboard/monitor'
import { wrapHandler, wrapUnlockedHandler } from './utils'
import { logger } from '../utils/logger'
import { expandSnippetVariables } from '../../utils/snippet-vars'
import { clipboardAutoClear } from '../clipboard/auto-clear'
import { suggestForClipboard } from '../inbox/rules'
import { getHostManager } from '../harness-host/manager'
import { getImagePasteMode, getPrefs, setPrefs } from '../prefs'
import { exportImagePath, cleanupImageExports } from '../storage/image-store'
import { emitCaptured } from '../clipboard/captured'
import { captureScreenRegion } from '../jarvis/capture'
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
  cleanupImageExports()
  const monitor = getClipboardMonitor()
  ipcMain.handle('clipboard:groups', wrapUnlockedHandler(async () => ({ success: true, data: clipboardStore.clipboardGroups() })))
  const queries = new Map<string, AbortController>()

  // 启动时同步 prefs → monitor
  const initialPrefs = getPrefs()
  monitor.updateSettings({
    maxImageSize: initialPrefs.maxImageSizeKb,
    enableSmartDetection: initialPrefs.enableSmartDetection,
    saveImages: initialPrefs.saveImages,
    excludedApps: initialPrefs.excludedApps,
    minClipboardLength: initialPrefs.minClipboardLength
  })

  // 监听剪贴板变化，保存到数据库并通知渲染进程（始终 personal）
  monitor.on('change', async (event: ClipboardChangeEvent) => {
    const generationAtDetect = monitor.getGeneration()
    try {
      const item = await clipboardStore.addClipboardItem(
        {
          type: event.type,
          content: event.content,
          imageData: event.imageData,
          filePath: event.filePath,
          sourceApp: event.sourceApp
        },
        event.detectedKeyType,
        'personal'
      )

      if (item && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.CLIPBOARD_NEW_ITEM, item)
      }
      if (item) {
        try {
          const inboxId = suggestForClipboard(item)
          // L2：仅在项目显式开启时排队后台只读预分析；失败不影响复制本身。
          if (inboxId) void getHostManager().preanalyze(inboxId).catch(() => logger.warn('[inbox] 预分析未能排队'))
        } catch { logger.warn('[inbox] 无法为本次复制生成建议') }
        emitCaptured(item)
      }

      // 截图/图片：按用户偏好写回。落盘期间若用户又复制了别的内容，禁止覆盖。
      if (item && item.type === 'image' && item.imagePath && item.imageData) {
        if (monitor.getGeneration() !== generationAtDetect) {
          logger.info('[IPC] skip image paste, clipboard changed during save')
        } else {
          try {
            const mode = getImagePasteMode()
            const path = mode === 'image' ? '' : exportImagePath(item.imagePath)
            monitor.writeImagePaste(item.imageData, path, mode)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('clipboard:image-paste-mode', {
                mode,
                path,
                label: imageModeLabel(mode)
              })
            }
          } catch (err) {
            logger.warn('[IPC] auto image paste failed:', err)
          }
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
      event,
      params: {
        filter?: ClipboardFilter
        limit?: number
        offset?: number
        workspace?: WorkspaceContext
        requestKey?: 'history-page' | 'hud'
      }
    ): Promise<ApiResponse<{ items: ClipboardItem[]; total: number }>> => {
      const key = `${event.sender.id}:${params?.requestKey === 'hud' ? 'hud' : 'history-page'}`
      queries.get(key)?.abort()
      const controller = new AbortController()
      queries.set(key, controller)
      const abort = (): void => controller.abort()
      event.sender.once('destroyed', abort)
      try {
        const result = await clipboardStore.searchClipboardHistory(
          params?.filter,
          params?.limit,
          params?.offset,
          controller.signal
        )
        return { success: true, data: result }
      } catch (error) {
        if (!controller.signal.aborted) logger.error('[IPC] Error getting clipboard history:', error)
        return { success: false, error: (error as Error).message }
      } finally {
        event.sender.removeListener('destroyed', abort)
        if (queries.get(key) === controller) queries.delete(key)
      }
    })
  )

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_SAVE_SNAPSHOT, wrapUnlockedHandler(async (_event, id: string) => {
    if (typeof id !== 'string' || !id) return { success: false, error: '记录 ID 无效' }
    try {
      return { success: true, data: clipboardStore.saveClipboardSnapshot(id) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }))
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_GET_OCCURRENCES, wrapUnlockedHandler(async (_event, id: string) => {
    if (typeof id !== 'string' || !id) return { success: false, error: '记录 ID 无效' }
    return { success: true, data: clipboardStore.getClipboardOccurrences(id) }
  }))

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
        try {
          const { refreshSnippetHotkeys } = await import('../shortcuts/snippet-hotkeys')
          refreshSnippetHotkeys()
        } catch {
          /* ignore */
        }
        return { success, data: success }
      } catch (error) {
        logger.error('[IPC] Error deleting clipboard item:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 批量删除
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_DELETE_ITEMS,
    wrapHandler(async (_event, ids: string[]): Promise<ApiResponse<number>> => {
      try {
        const n = clipboardStore.deleteClipboardItems(ids ?? [])
        return { success: true, data: n }
      } catch (error) {
        logger.error('[IPC] Error batch deleting clipboard items:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 按时间清理（早于 cutoffMs 的非片段）
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_DELETE_OLDER,
    wrapHandler(
      async (
        _event,
        opts: { olderThanMs: number; keepPinned?: boolean }
      ): Promise<ApiResponse<number>> => {
        try {
          const cutoff = Date.now() - (opts?.olderThanMs ?? 0)
          const n = clipboardStore.deleteClipboardOlderThan(
            cutoff,
            opts?.keepPinned !== false
          )
          return { success: true, data: n }
        } catch (error) {
          logger.error('[IPC] Error delete older clipboard:', error)
          return { success: false, error: (error as Error).message }
        }
      }
    )
  )

  // 批量置顶
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_BATCH_PIN,
    wrapHandler(
      async (
        _event,
        opts: { ids: string[]; pinned: boolean }
      ): Promise<ApiResponse<number>> => {
        try {
          const n = clipboardStore.setClipboardPinned(opts?.ids ?? [], opts?.pinned)
          return { success: true, data: n }
        } catch (error) {
          logger.error('[IPC] Error batch pin:', error)
          return { success: false, error: (error as Error).message }
        }
      }
    )
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
      opts?: { mode?: 'both' | 'path' | 'image'; paste?: boolean }
    ): Promise<ApiResponse<boolean>> => {
      try {
        const item = clipboardStore.getClipboardItemById(id)
        if (!item) {
          return { success: false, error: '记录不存在' }
        }
        if (item.decryptError) return { success: false, error: '此条记录无法解密，原数据已保留；请从有效备份恢复' }

        if (item.isSnippet || item.type === 'text' || item.type === 'html') {
          let text = item.content || ''
          if (item.isSnippet) {
            let clip = ''
            try {
              clip = clipboard.readText()
            } catch {
              clip = ''
            }
            text = expandSnippetVariables(item.content || item.preview || '', { clip })
          }
          monitor.writeText(text)
          if ((item.detectedKeyType || item.category === 'secret' || item.category === 'credential') && getPrefs().autoClearTtlMs > 0) clipboardAutoClear.schedule(text, getPrefs().autoClearTtlMs)
        } else if (item.type === 'file') {
          monitor.writeText(item.filePath || item.content || '')
        } else if (item.type === 'image') {
          const mode = opts?.mode ?? getImagePasteMode()
          if (mode === 'path') {
            if (!item.imagePath) {
              return { success: false, error: '无本地路径' }
            }
            monitor.writeText(monitor.formatPathText(exportImagePath(item.imagePath)))
          } else if (item.imageData && item.imagePath && mode === 'both') {
            monitor.writeImagePaste(item.imageData, exportImagePath(item.imagePath), 'both')
          } else if (item.imageData) {
            monitor.writeImage(item.imageData)
          } else {
            return { success: false, error: '图片数据不可用' }
          }
        }

        clipboardStore.recordClipboardUsage(id)
        if (opts?.paste === true) {
          const { hideHUD } = await import('../hud/manager')
          const { pasteToActiveApp } = await import('../clipboard/paste-active')
          hideHUD(); mainWindow.hide()
          const result = await pasteToActiveApp()
          if (!result.ok) { mainWindow.show(); return { success: false, error: result.error || '粘贴失败，内容已复制' } }
        }
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
        const exported = exportImagePath(path)
        monitor.writeText(monitor.formatPathText(exported))
        clipboardStore.recordClipboardUsage(id)
        return { success: true, data: exported }
      } catch (error) {
        logger.error('[IPC] Error copying clipboard path:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_GET_IMAGE, wrapUnlockedHandler(async (_event, id: string): Promise<ApiResponse<string | null>> => {
    try {
      const imagePath = typeof id === 'string' ? clipboardStore.getClipboardImagePath(id) : null
      if (!imagePath) return { success: true, data: null }
      const { loadThumbnailAsDataUrl } = await import('../storage/image-store')
      return { success: true, data: await loadThumbnailAsDataUrl(imagePath, 1800) }
    } catch (error) { return { success: false, error: (error as Error).message } }
  }))
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_SAVE_PASTED_IMAGE, wrapUnlockedHandler(async (_event, dataUrl: string): Promise<ApiResponse<ClipboardItem>> => {
    try {
      if (typeof dataUrl !== 'string' || dataUrl.length > 28_000_000 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) throw new Error('只支持 30 MB 以内的 PNG / JPEG / WebP / GIF 图片')
      const item = await clipboardStore.addClipboardItem({ type: ClipboardContentType.IMAGE, imageData: dataUrl, sourceApp: 'ClipVault' }, undefined, 'personal')
      if (!item) throw new Error('图片未能保存')
      emitCaptured(item)
      return { success: true, data: item }
    } catch (error) { return { success: false, error: (error as Error).message } }
  }))
  ipcMain.handle(IPC_CHANNELS.JARVIS_CAPTURE, wrapUnlockedHandler(async (): Promise<ApiResponse<string | null>> => {
    try { return { success: true, data: await captureScreenRegion() } } catch (error) { return { success: false, error: (error as Error).message } }
  }))
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_GET_THUMBNAIL,
    wrapHandler(async (_event, id: string): Promise<ApiResponse<string | null>> => {
      try {
        const imagePath = clipboardStore.getClipboardImagePath(id)
        if (!imagePath) return { success: true, data: null }
        const { loadThumbnailAsDataUrl } = await import('../storage/image-store')
        const thumb = await loadThumbnailAsDataUrl(imagePath)
        return { success: true, data: thumb }
      } catch (error) {
        logger.error('[IPC] Error getting thumbnail:', error)
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
        try {
          const { refreshSnippetHotkeys } = await import('../shortcuts/snippet-hotkeys')
          refreshSnippetHotkeys()
        } catch {
          /* ignore */
        }
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
        try {
          const { refreshSnippetHotkeys } = await import('../shortcuts/snippet-hotkeys')
          refreshSnippetHotkeys()
        } catch {
          /* ignore */
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
        setPrefs({ clipboardMonitorEnabled: enabled })
        return { success: true, data: enabled }
      } catch (error) {
        logger.error('[IPC] Error toggling monitor:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 按偏好启动剪贴板监听
  if (initialPrefs.clipboardMonitorEnabled) {
    monitor.start()
  }

  // 片段全局热键：必须动态 import，打包后 require 相对路径会找不到 chunk
  void import('../shortcuts/snippet-hotkeys')
    .then(({ refreshSnippetHotkeys }) => {
      refreshSnippetHotkeys()
    })
    .catch((err) => {
      logger.warn('[IPC] snippet hotkeys init skipped:', err)
    })

  logger.info('[IPC] Clipboard handlers registered')
}
