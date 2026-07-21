/**
 * 剪贴板类型定义
 * KR 2.1: 系统剪贴板监听
 * KR 2.2: 历史记录与快速片段
 */

/** 剪贴板内容类型 */
export enum ClipboardContentType {
  /** 纯文本 */
  TEXT = 'text',
  /** 图片 */
  IMAGE = 'image',
  /** 富文本/HTML */
  HTML = 'html',
  /** 文件路径 */
  FILE = 'file'
}

/** 剪贴板历史记录项 */
export interface ClipboardItem {
  /** 唯一标识 */
  id: string
  /** 内容类型 */
  type: ClipboardContentType
  /** 文本内容（TEXT/HTML类型） */
  content?: string
  /** 图片数据（base64，IMAGE类型，展示用） */
  imageData?: string
  /**
   * 图片落盘绝对路径（IMAGE 类型；存于 userData/images）
   * 用于「复制路径」贴到终端 / CLI，无需再手动另存
   */
  imagePath?: string
  /** 文件路径（FILE类型） */
  filePath?: string
  /** 预览文本（截断后的内容，用于列表显示） */
  preview: string
  /** 内容哈希（用于去重） */
  hash: string
  /** 内容大小（字节） */
  size: number
  /** 来源应用（如果能获取） */
  sourceApp?: string
  /** 是否置顶 */
  isPinned: boolean
  /** 是否为快速片段 */
  isSnippet: boolean
  /** 快速片段名称 */
  snippetName?: string
  /** 快速片段快捷键 */
  snippetShortcut?: string
  /** 标签 */
  tags: string[]
  /** 检测到的密钥类型（智能识别） */
  detectedKeyType?: string
  /** 创建时间 */
  createdAt: number
  /** 最后使用时间 */
  lastUsedAt?: number
  /** 使用次数 */
  useCount: number
}

/** 创建剪贴板记录输入 */
export interface CreateClipboardItemInput {
  type: ClipboardContentType
  content?: string
  imageData?: string
  filePath?: string
  sourceApp?: string
}

/** 创建快速片段输入 */
export interface CreateSnippetInput {
  content: string
  name: string
  shortcut?: string
  tags?: string[]
}

/** 更新快速片段输入 */
export interface UpdateSnippetInput {
  id: string
  content?: string
  name?: string
  shortcut?: string
  tags?: string[]
  isPinned?: boolean
}

/** 剪贴板历史查询过滤 */
export interface ClipboardFilter {
  /** 搜索关键词 */
  keyword?: string
  /** 内容类型 */
  type?: ClipboardContentType
  /** 仅显示置顶 */
  pinnedOnly?: boolean
  /** 仅显示快速片段 */
  snippetsOnly?: boolean
  /** 检测到的密钥类型 */
  detectedKeyType?: string
  /** 标签过滤 */
  tags?: string[]
  /** 时间范围 - 开始 */
  startTime?: number
  /** 时间范围 - 结束 */
  endTime?: number
}

/** 剪贴板监听器状态 */
export interface ClipboardMonitorState {
  /** 是否正在监听 */
  isRunning: boolean
  /** 监听间隔（毫秒） */
  interval: number
  /** 最后检查时间 */
  lastCheckAt?: number
  /** 错误信息 */
  error?: string
}

/** 剪贴板设置 */
export interface ClipboardSettings {
  /** 是否启用监听 */
  enabled: boolean
  /** 监听间隔（毫秒） */
  pollInterval: number
  /** 最大历史记录数 */
  maxHistorySize: number
  /** 是否保存图片 */
  saveImages: boolean
  /** 图片最大尺寸（KB） */
  maxImageSize: number
  /** 是否启用智能识别 */
  enableSmartDetection: boolean
  /** 排除的应用列表 */
  excludedApps: string[]
}

/** 默认剪贴板设置 */
export const DEFAULT_CLIPBOARD_SETTINGS: ClipboardSettings = {
  enabled: true,
  pollInterval: 500,
  maxHistorySize: 500,
  saveImages: true,
  maxImageSize: 5120, // 5MB
  enableSmartDetection: true,
  excludedApps: []
}
