/**
 * 工作区上下文 · v3 个人本地版
 *
 * 运行时固定 `personal`。类型仍保留 `'team'` 字面量，仅用于：
 * - 读取历史库中可能存在的 team 行（不写入新数据）
 * - 兼容旧调用方入参（IPC 会强制归一化为 personal）
 *
 * 跨进程契约：主进程 / preload / 渲染进程共享。
 */

/** 工作区：运行时仅 personal；team 为历史兼容 */
export type WorkspaceContext = 'personal' | 'team'

/** 单团队元数据（与 team_info 表 1:1 映射） */
export interface TeamInfo {
  /** 单例 id，恒为 1 */
  id: number
  /** 团队名称 */
  name: string
  /** 图标（emoji） */
  iconEmoji: string
  /** 主色（hex） */
  accentColor: string
  /** Owner 设备 ID */
  ownerDeviceId: string
  /** 创建时间（ms） */
  createdAt: number
}

/** 文件传输方向 */
export type FileTransferDirection = 'send' | 'recv'

/** 文件传输状态机（与 file_transfers.status 一致） */
export type FileTransferStatus =
  | 'pending'
  | 'offering'
  | 'transferring'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'rejected'

/** 文件传输记录（与 file_transfers 表 1:1 映射） */
export interface FileTransfer {
  /** 传输 ID（UUID） */
  id: string
  /** 方向：发送 / 接收 */
  direction: FileTransferDirection
  /** 对端设备 ID */
  peerDeviceId: string
  /** 对端显示名快照（发起时的名字，后续对端改名不影响历史） */
  peerDisplayName?: string
  /** 文件名 */
  fileName: string
  /** 文件大小（字节） */
  fileSize: number
  /** 文件 SHA-256 hex（传完后写入） */
  fileHash?: string
  /** MIME 类型（可空） */
  mimeType?: string
  /** 状态 */
  status: FileTransferStatus
  /** 已传输字节数 */
  bytesTransferred: number
  /** 本地路径（发送时为源路径 / 接收时为保存位置） */
  localPath?: string
  /** 错误信息（失败 / 取消时填） */
  errorMessage?: string
  /** 开始时间（ms） */
  startedAt: number
  /** 结束时间（ms），终态才有 */
  endedAt?: number
}
