/**
 * 凭证类型的统一元数据（B-7）
 *
 * 单一真相来源：label / icon。取消 CredentialForm、CredentialDetail、
 * CredentialList 三处的重复硬编码。
 */

import { CredentialType } from './credential'

export interface CredentialTypeMeta {
  label: string
  icon: string
}

/**
 * 注意：icon 字段为 emoji/unicode，避免额外引入 SVG 资产
 * 如未来改为 lucide/heroicons，此处替换即可，调用方不用动
 */
export const CREDENTIAL_TYPES: Record<CredentialType, CredentialTypeMeta> = {
  [CredentialType.API_KEY]: { label: 'API 密钥', icon: '🔑' },
  [CredentialType.DATABASE]: { label: '数据库凭证', icon: '🗄️' },
  [CredentialType.SSH_KEY]: { label: 'SSH 密钥', icon: '🖥️' },
  [CredentialType.CERTIFICATE]: { label: 'SSL/TLS 证书', icon: '📜' },
  [CredentialType.TOKEN]: { label: 'Token', icon: '🎫' },
  [CredentialType.PASSWORD]: { label: '账号密码', icon: '🔒' },
  [CredentialType.OTHER]: { label: '其他', icon: '📦' }
}

/** 所有可选项（渲染下拉框、筛选器用） */
export const CREDENTIAL_TYPE_OPTIONS: Array<{
  value: CredentialType
  label: string
  icon: string
}> = (Object.keys(CREDENTIAL_TYPES) as CredentialType[]).map((v) => ({
  value: v,
  ...CREDENTIAL_TYPES[v]
}))

export function getCredentialTypeMeta(type: CredentialType): CredentialTypeMeta {
  return CREDENTIAL_TYPES[type] ?? CREDENTIAL_TYPES[CredentialType.OTHER]
}
