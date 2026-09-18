/**
 * 类型定义统一导出 · v3.0 个人本地版
 */

export * from './credential'
export * from './category'
export * from './clipboard'
export * from './credential-types'
export * from './shortcut'
export * from './workspace'

/** IPC 通道名称常量（仅个人核心能力） */
export const IPC_CHANNELS = {
  // 凭证
  CREDENTIAL_CREATE: 'credential:create',
  CREDENTIAL_UPDATE: 'credential:update',
  CREDENTIAL_DELETE: 'credential:delete',
  CREDENTIAL_GET: 'credential:get',
  CREDENTIAL_LIST: 'credential:list',
  CREDENTIAL_COPY: 'credential:copy',

  // 分类
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',
  CATEGORY_LIST: 'category:list',
  CATEGORY_TREE: 'category:tree',

  // 剪贴板
  CLIPBOARD_GET_HISTORY: 'clipboard:getHistory',
  CLIPBOARD_CLEAR_HISTORY: 'clipboard:clearHistory',
  CLIPBOARD_DELETE_ITEM: 'clipboard:deleteItem',
  CLIPBOARD_DELETE_ITEMS: 'clipboard:deleteItems',
  CLIPBOARD_DELETE_OLDER: 'clipboard:deleteOlder',
  CLIPBOARD_BATCH_PIN: 'clipboard:batchPin',
  CLIPBOARD_PIN_ITEM: 'clipboard:pinItem',
  CLIPBOARD_COPY_ITEM: 'clipboard:copyItem',
  /** 复制图片磁盘路径为文本（便于终端/CLI 粘贴） */
  CLIPBOARD_COPY_PATH: 'clipboard:copyPath',
  /** 列表项缩略图（小 JPEG Data URL） */
  CLIPBOARD_GET_THUMBNAIL: 'clipboard:getThumbnail',
  CLIPBOARD_CREATE_SNIPPET: 'clipboard:createSnippet',
  CLIPBOARD_UPDATE_SNIPPET: 'clipboard:updateSnippet',
  CLIPBOARD_GET_SNIPPETS: 'clipboard:getSnippets',
  CLIPBOARD_MONITOR_STATUS: 'clipboard:monitorStatus',
  CLIPBOARD_TOGGLE_MONITOR: 'clipboard:toggleMonitor',
  CLIPBOARD_NEW_ITEM: 'clipboard:newItem',
  /** 兼容旧 preload：个人版固定返回错误 */
  CLIPBOARD_PUSH_TO_TEAM: 'clipboard:push-to-team',

  // 标签
  TAG_LIST: 'tag:list',
  TAG_DELETE: 'tag:delete',

  // 导入导出
  IMPORT_DATA: 'data:import',
  EXPORT_DIALOG: 'data:exportDialog',

  // Vault
  VAULT_IS_INITIALIZED: 'vault:is-initialized',
  VAULT_IS_UNLOCKED: 'vault:is-unlocked',
  VAULT_SETUP: 'vault:setup',
  VAULT_SETUP_SAFESTORAGE: 'vault:setup-safestorage',
  VAULT_UNLOCK: 'vault:unlock',
  VAULT_LOCK: 'vault:lock',
  VAULT_CHANGE_PASSWORD: 'vault:change-password',
  VAULT_GET_MODE: 'vault:get-mode',
  VAULT_LOCKED_EVENT: 'vault:locked',
  VAULT_OS_SUPPORTED: 'vault:os-supported',
  /** v3.1：启动时自动打开 / 创建无密码 vault */
  VAULT_ENSURE_OPEN: 'vault:ensure-open',
  /** v3.1：旧主密码 vault 一次性迁移到 safeStorage */
  VAULT_MIGRATE_TO_SAFE: 'vault:migrate-to-safe',

  // 日志
  LOG_RENDERER_ERROR: 'log:renderer-error',

  // 备份
  BACKUP_CREATE: 'backup:create',
  BACKUP_LIST: 'backup:list',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_DELETE: 'backup:delete',

  // 窗口
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE_ALWAYS_ON_TOP: 'window:toggleAlwaysOnTop',
  WINDOW_GET_STATE: 'window:get-state',
  WINDOW_STATE_EVENT: 'window:state-event',

  // 系统
  APP_GET_AUTO_LAUNCH: 'app:getAutoLaunch',
  APP_SET_AUTO_LAUNCH: 'app:setAutoLaunch',
  SYSTEM_GET_VERSION: 'system:get-version',

  // 快捷键
  SHORTCUTS_LIST: 'shortcuts:list',
  SHORTCUTS_SET: 'shortcuts:set',
  SHORTCUTS_RESET: 'shortcuts:reset',

  // 本地偏好（截图粘贴模式、图片目录等）
  PREFS_GET: 'prefs:get',
  PREFS_SET: 'prefs:set',
  PREFS_PICK_IMAGES_DIR: 'prefs:pick-images-dir',
  PREFS_OPEN_IMAGES_DIR: 'prefs:open-images-dir',

  // 密钥拦截
  KEY_INTERCEPT_PROMPT: 'key-intercept:prompt',
  KEY_INTERCEPT_DECISION: 'key-intercept:decision'
} as const

/** API 响应包装 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/** 分页参数 */
export interface PaginationParams {
  page: number
  pageSize: number
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
