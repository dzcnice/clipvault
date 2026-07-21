/**
 * 凭证/密钥类型定义
 * KR 1.1: 密钥数据模型设计
 */

/** 凭证类型枚举 */
export enum CredentialType {
  /** API 密钥 */
  API_KEY = 'api_key',
  /** 数据库凭证 */
  DATABASE = 'database',
  /** SSH 密钥 */
  SSH_KEY = 'ssh_key',
  /** SSL/TLS 证书 */
  CERTIFICATE = 'certificate',
  /** Bearer Token */
  TOKEN = 'token',
  /** 用户名密码 */
  PASSWORD = 'password',
  /** 其他 */
  OTHER = 'other'
}

/** 凭证基础接口 */
export interface Credential {
  /** 唯一标识 */
  id: string
  /** 名称 */
  name: string
  /** 类型 */
  type: CredentialType
  /** 值（敏感数据）
   *
   * 注意：若 decryptError=true，value 恒为 ''，调用方应显示"此凭证已损坏"
   * 而非把空串当作真实值使用。
   */
  value: string
  /** 描述 */
  description?: string
  /** 所属分类ID */
  categoryId?: string
  /** 标签列表 */
  tags: string[]
  /** 元数据（根据类型不同存储不同信息） */
  metadata: CredentialMetadata
  /** 创建时间 */
  createdAt: number
  /** 更新时间 */
  updatedAt: number
  /** 最后使用时间 */
  lastUsedAt?: number
  /** 使用次数 */
  useCount: number
  /** 是否收藏 */
  isFavorite: boolean
  /**
   * BUG-CRED-3：解密失败标志
   *
   * - true：DEK 错误 / 密文损坏 / 认证标签不匹配；value 为占位空串不可信
   * - false / undefined：正常解密（value 为真实值，可能为空串但是真实空串）
   *
   * 调用方（列表/详情/复制）看到 true 时应显示"此凭证已损坏，请导入备份"
   * 而不要把空值当真实凭证复制给用户。
   */
  decryptError?: boolean
  /** BUG-CRED-3：解密错误的简要描述（仅在 decryptError=true 时有意义） */
  decryptErrorMessage?: string
}

/** 凭证元数据 - 根据类型存储额外信息 */
export interface CredentialMetadata {
  /** API Key: 服务提供商 */
  provider?: string
  /** API Key: 关联的 API 端点 */
  endpoint?: string
  /** Database: 主机地址 */
  host?: string
  /** Database: 端口 */
  port?: number
  /** Database: 数据库名 */
  database?: string
  /** Database: 用户名 */
  username?: string
  /** SSH: 主机地址 */
  sshHost?: string
  /** SSH: 端口 */
  sshPort?: number
  /** SSH: 用户名 */
  sshUser?: string
  /** Certificate: 过期时间 */
  expiresAt?: number
  /** Certificate: 颁发者 */
  issuer?: string
  /** 自定义字段 */
  custom?: Record<string, string>
}

/** 创建凭证的输入 */
export interface CreateCredentialInput {
  name: string
  type: CredentialType
  value: string
  description?: string
  categoryId?: string
  tags?: string[]
  metadata?: Partial<CredentialMetadata>
}

/** 更新凭证的输入 */
export interface UpdateCredentialInput {
  id: string
  name?: string
  type?: CredentialType
  value?: string
  description?: string
  categoryId?: string
  tags?: string[]
  metadata?: Partial<CredentialMetadata>
  isFavorite?: boolean
}

/** 凭证查询过滤条件 */
export interface CredentialFilter {
  /** 搜索关键词（名称、描述） */
  keyword?: string
  /** 类型过滤 */
  type?: CredentialType
  /** 分类ID */
  categoryId?: string
  /** 标签 */
  tags?: string[]
  /** 仅收藏 */
  favoritesOnly?: boolean
}

/** 凭证排序方式 */
export enum CredentialSortBy {
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  LAST_USED = 'lastUsedAt',
  USE_COUNT = 'useCount'
}

/** 排序方向 */
export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}
