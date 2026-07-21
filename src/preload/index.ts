/**
 * Preload 脚本 - 安全地暴露 API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../types'
import { sprint6API } from './sprint6-api'
import { sprint11API } from './sprint11-api'
import { sprint13API } from './sprint13-api'
import { sprint14API } from './sprint14-api'
import type {
  Credential,
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilter,
  CredentialSortBy,
  SortDirection,
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryTreeNode,
  ClipboardItem,
  ClipboardFilter,
  CreateSnippetInput,
  UpdateSnippetInput,
  ApiResponse,
  Tag,
  ShortcutCommandId,
  ShortcutRecord,
  WorkspaceContext
} from '../types'

// 定义暴露给渲染进程的 API
const api = {
  // ==================== 凭证 API ====================
  credential: {
    /** 创建凭证（个人版固定写入 personal） */
    create: (
      input: CreateCredentialInput & { workspace?: WorkspaceContext }
    ): Promise<ApiResponse<Credential>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_CREATE, input),

    update: (input: UpdateCredentialInput): Promise<ApiResponse<Credential>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_UPDATE, input),

    delete: (id: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_DELETE, id),

    get: (id: string): Promise<ApiResponse<Credential>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_GET, id),

    /** 列表（个人版 workspace 固定 personal） */
    list: (params: {
      filter?: CredentialFilter
      sortBy?: CredentialSortBy
      sortDir?: SortDirection
      limit?: number
      offset?: number
      workspace?: WorkspaceContext
    }): Promise<ApiResponse<{ items: Credential[]; total: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_LIST, params),

    copy: (id: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CREDENTIAL_COPY, id)
  },

  // ==================== 分类 API ====================
  category: {
    create: (input: CreateCategoryInput): Promise<ApiResponse<Category>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, input),

    update: (input: UpdateCategoryInput): Promise<ApiResponse<Category>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, input),

    delete: (id: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, id),

    list: (): Promise<ApiResponse<Category[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST),

    tree: (): Promise<ApiResponse<CategoryTreeNode[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_TREE)
  },

  // ==================== 标签 API ====================
  tag: {
    list: (): Promise<ApiResponse<Tag[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TAG_LIST),

    delete: (name: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TAG_DELETE, name)
  },

  // ==================== 剪贴板 API ====================
  clipboard: {
    /** 历史查询（个人版 workspace 固定 personal） */
    getHistory: (params: {
      filter?: ClipboardFilter
      limit?: number
      offset?: number
      workspace?: WorkspaceContext
    }): Promise<ApiResponse<{ items: ClipboardItem[]; total: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_GET_HISTORY, params),

    clearHistory: (): Promise<ApiResponse<number>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_CLEAR_HISTORY),

    deleteItem: (id: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_DELETE_ITEM, id),

    pinItem: (id: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_PIN_ITEM, id),

    /**
     * 复制到系统剪贴板。
     * 图片可传 mode：both | path | image；缺省走设置里的偏好。
     */
    copyItem: (
      id: string,
      opts?: { mode?: 'both' | 'path' | 'image' }
    ): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_COPY_ITEM, id, opts),

    /** 仅复制图片本地路径文本（终端 / CLI） */
    copyPath: (id: string): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_COPY_PATH, id),

    createSnippet: (
      input: CreateSnippetInput & { workspace?: WorkspaceContext }
    ): Promise<ApiResponse<ClipboardItem>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_CREATE_SNIPPET, input),

    updateSnippet: (input: UpdateSnippetInput): Promise<ApiResponse<ClipboardItem>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_UPDATE_SNIPPET, input),

    getSnippets: (params?: {
      workspace?: WorkspaceContext
    }): Promise<ApiResponse<ClipboardItem[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_GET_SNIPPETS, params),

    /** 个人版不支持团队推送；保留通道避免旧调用崩溃 */
    pushToTeam: (id: string): Promise<ApiResponse<{ id: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_PUSH_TO_TEAM, id),

    getMonitorStatus: (): Promise<ApiResponse<{ isRunning: boolean; interval: number }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_MONITOR_STATUS),

    toggleMonitor: (enabled: boolean): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIPBOARD_TOGGLE_MONITOR, enabled),

    // 监听新的剪贴板内容
    onNewItem: (callback: (item: ClipboardItem) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, item: ClipboardItem): void => {
        callback(item)
      }
      ipcRenderer.on(IPC_CHANNELS.CLIPBOARD_NEW_ITEM, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CLIPBOARD_NEW_ITEM, handler)
      }
    },

    /**
     * v2.1 · U5：订阅主进程 backfill 进度事件
     * payload: { done: number; total: number }
     */
    onBackfillProgress: (
      callback: (p: { done: number; total: number }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { done: number; total: number }
      ): void => {
        callback(payload)
      }
      ipcRenderer.on('clipboard:backfill-progress', handler)
      return () => {
        ipcRenderer.removeListener('clipboard:backfill-progress', handler)
      }
    }
  },

  // ==================== 窗口控制 API ====================
  window: {
    minimize: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),

    maximize: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),

    close: (): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),

    toggleAlwaysOnTop: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_ALWAYS_ON_TOP),

    /** σ2 · P2-7：TitleBar mount 时拉一次真实状态 */
    getState: (): Promise<{ maximized: boolean; alwaysOnTop: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.WINDOW_GET_STATE),

    /** σ2 · P2-7：订阅主进程窗口状态变化（maximize / unmaximize / always-on-top） */
    onStateChange: (
      callback: (state: { maximized: boolean; alwaysOnTop: boolean }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: { maximized: boolean; alwaysOnTop: boolean }
      ): void => {
        callback(state)
      }
      ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_EVENT, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WINDOW_STATE_EVENT, handler)
      }
    }
  },

  // ==================== 数据导入导出 API ====================
  data: {
    export: (options: {
      format: 'json' | 'csv'
      includeCredentials: boolean
      includeClipboard: boolean
      includeCategories: boolean
      /** A-1：JSON 模式 'plain'（脱敏） / 'encrypted'（加密） */
      jsonMode?: 'plain' | 'encrypted'
      /** A-1：加密模式下的导出密码 */
      exportPassword?: string
    }): Promise<ApiResponse<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DIALOG, options),

    import: (payload?: {
      filePath?: string
      password?: string
    }): Promise<ApiResponse<{
      success: boolean
      message: string
      needPassword?: boolean
      filePath?: string
      stats?: {
        credentials?: { total: number; imported: number; skipped: number }
        clipboardItems?: { total: number; imported: number; skipped: number }
        categories?: { total: number; imported: number; skipped: number }
      }
    }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.IMPORT_DATA, payload)
  },

  // ==================== 备份 API ====================
  backup: {
    create: (): Promise<ApiResponse<{ filePath?: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE),

    list: (): Promise<ApiResponse<Array<{
      name: string
      path: string
      size: number
      date: string
    }>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST),

    restore: (backupPath: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, backupPath),

    delete: (backupPath: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DELETE, backupPath)
  },

  // ==================== 应用设置 API ====================
  app: {
    getAutoLaunch: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_GET_AUTO_LAUNCH),

    setAutoLaunch: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_SET_AUTO_LAUNCH, enabled),

    /**
     * v2.1 · U5：通用 busy 事件广播（渲染进程内部）。
     * 任意模块可通过 fireBusy 通知全局进度条当前有任务在跑；
     * GlobalProgressBar 通过 onBusy 订阅。
     * payload: { id?: string; label?: string; progress?: number; done?: boolean }
     */
    onBusy: (
      callback: (p: {
        id?: string
        label?: string
        progress?: number
        done?: boolean
      }) => void
    ): (() => void) => {
      const handler = (evt: Event): void => {
        const detail = (evt as CustomEvent).detail as {
          id?: string
          label?: string
          progress?: number
          done?: boolean
        }
        callback(detail ?? {})
      }
      window.addEventListener('app:busy', handler as EventListener)
      return () => {
        window.removeEventListener('app:busy', handler as EventListener)
      }
    },
    fireBusy: (payload: {
      id?: string
      label?: string
      progress?: number
      done?: boolean
    }): void => {
      try {
        window.dispatchEvent(new CustomEvent('app:busy', { detail: payload }))
      } catch {
        /* ignore */
      }
    }
  },

  // ==================== 快捷键 API ====================
  shortcuts: {
    list: (): Promise<ApiResponse<ShortcutRecord[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHORTCUTS_LIST),
    set: (payload: {
      commandId: ShortcutCommandId
      accelerator: string
    }): Promise<ApiResponse<ShortcutRecord[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHORTCUTS_SET, payload),
    reset: (payload?: {
      commandId?: ShortcutCommandId
    }): Promise<ApiResponse<ShortcutRecord[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SHORTCUTS_RESET, payload)
  },

  // ==================== Vault（主密码）API ====================
  vault: {
    isInitialized: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_IS_INITIALIZED),
    isUnlocked: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_IS_UNLOCKED),
    osSupported: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_OS_SUPPORTED),
    getMode: (): Promise<ApiResponse<string | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_GET_MODE),
    /** v3.1：无密码自动打开 / 创建 */
    ensureOpen: (): Promise<ApiResponse<{ mode: string } | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_ENSURE_OPEN),
    /** v3.1：旧主密码库一次性迁移 */
    migrateToSafe: (password: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_MIGRATE_TO_SAFE, password),
    setup: (password: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_SETUP, password),
    setupSafeStorage: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_SETUP_SAFESTORAGE),
    unlock: (password: string): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_UNLOCK, password),
    lock: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_LOCK),
    changePassword: (
      oldPassword: string,
      newPassword: string
    ): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VAULT_CHANGE_PASSWORD, { oldPassword, newPassword }),
    onLocked: (callback: () => void): (() => void) => {
      const handler = (): void => callback()
      ipcRenderer.on(IPC_CHANNELS.VAULT_LOCKED_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VAULT_LOCKED_EVENT, handler)
    }
  },

  // ==================== 通用事件订阅（P1-4 接线） ====================
  events: {
    on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
        callback(...args)
      }
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  },

  // ==================== 日志上报（ErrorBoundary） ====================
  log: {
    rendererError: (payload: unknown): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC_CHANNELS.LOG_RENDERER_ERROR, payload)
  },

  // ==================== 密钥拦截 ====================
  keyIntercept: {
    onPrompt: (
      callback: (payload: {
        promptId: string
        detectedKeyType: string
        content: string
        contentType: string
      }) => void
    ): (() => void) => {
      const handler = (
        _e: Electron.IpcRendererEvent,
        payload: {
          promptId: string
          detectedKeyType: string
          content: string
          contentType: string
        }
      ): void => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.KEY_INTERCEPT_PROMPT, handler)
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.KEY_INTERCEPT_PROMPT, handler)
    },
    sendDecision: (decision: {
      promptId: string
      action: 'shareAsCredential' | 'saveLocalOnly' | 'cancel'
    }): void => {
      ipcRenderer.send(IPC_CHANNELS.KEY_INTERCEPT_DECISION, decision)
    }
  },

  // ==================== 系统 ====================
  system: {
    openFirewallSettings: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_FIREWALL_SETTINGS),
    getVersion: (): Promise<ApiResponse<{ version: string; builtAt: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_GET_VERSION)
  },

  // ==================== 本地偏好 ====================
  prefs: {
    get: (): Promise<
      ApiResponse<{
        imagePasteMode: 'both' | 'path' | 'image'
        imagesDir: string | null
        resolvedImagesDir: string
        defaultImagesDir: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.PREFS_GET),
    set: (
      partial: Partial<{
        imagePasteMode: 'both' | 'path' | 'image'
        imagesDir: string | null
      }>
    ): Promise<
      ApiResponse<{
        imagePasteMode: 'both' | 'path' | 'image'
        imagesDir: string | null
        resolvedImagesDir: string
        defaultImagesDir: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.PREFS_SET, partial),
    /** 系统对话框选择截图存储目录 */
    pickImagesDir: (): Promise<
      ApiResponse<{
        imagePasteMode: 'both' | 'path' | 'image'
        imagesDir: string | null
        resolvedImagesDir: string
        defaultImagesDir: string
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.PREFS_PICK_IMAGES_DIR),
    /** 在资源管理器打开当前图片目录 */
    openImagesDir: (): Promise<ApiResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PREFS_OPEN_IMAGES_DIR)
  },

  // ==================== HUD + 命令面板 (Sprint 6) ====================
  sprint6: sprint6API,

  // ==================== 凭证增强：TOTP / 密码 / 健康 (Sprint 11) ====================
  sprint11: sprint11API,

  // ==================== 安全：自动清空 / 生物识别 / 审计 / 恢复 (Sprint 13) ====================
  sprint13: sprint13API,

  // ==================== 更新 + 导入 (Sprint 14，不含 webhook UI) ====================
  sprint14: sprint14API
}

// 暴露 API 到渲染进程
contextBridge.exposeInMainWorld('api', api)

// 导出类型供渲染进程使用
export type API = typeof api
