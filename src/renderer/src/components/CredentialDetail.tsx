/**
 * 凭证详情组件 - 液态玻璃风格
 */

import { useEffect, useState } from 'react'
import type { Credential } from '@/types'
import { getCredentialTypeMeta } from '@/types'
import CredentialTOTPSection from './CredentialTOTPSection'

/** 图标组件 */
const CopyIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
  </svg>
)

const EditIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
)

const TrashIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

const EyeIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const EyeOffIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
)

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
  </svg>
)

// B-7：typeNames 旧硬编码已移除，统一走 getCredentialTypeMeta

interface CredentialDetailProps {
  credential: Credential
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite?: () => void
}

export default function CredentialDetail({
  credential,
  onCopy,
  onEdit,
  onDelete,
  onToggleFavorite
}: CredentialDetailProps): JSX.Element {
  const [showValue, setShowValue] = useState(false)

  useEffect(() => {
    setShowValue(false)
  }, [credential.id])

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  const maskValue = (value: string): string => {
    if (value.length <= 8) {
      return '••••••••'
    }
    return value.substring(0, 4) + '••••••••' + value.substring(value.length - 4)
  }

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2
              className="text-xl font-semibold flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {credential.name}
              {credential.isFavorite && (
                <span style={{ color: 'var(--morandi-pink)' }}>
                  <StarIcon filled />
                </span>
              )}
            </h2>
            <p className="mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {getCredentialTypeMeta(credential.type).label}
              {credential.metadata.provider && ` · ${credential.metadata.provider}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onToggleFavorite ? (
              <button
                type="button"
                onClick={onToggleFavorite}
                className="glass-btn glass-btn-secondary glass-btn-icon"
                title={credential.isFavorite ? '取消收藏' : '收藏'}
                style={{ color: credential.isFavorite ? 'var(--morandi-pink)' : undefined }}
              >
                <StarIcon filled={!!credential.isFavorite} />
              </button>
            ) : null}
            <button
              onClick={onCopy}
              disabled={credential.decryptError}
              title={credential.decryptError ? '凭证已损坏，无法复制' : '复制密钥值'}
              className="glass-btn glass-btn-primary flex items-center gap-2"
              style={credential.decryptError ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              <CopyIcon />
              <span>复制</span>
            </button>
            <button onClick={onEdit} className="glass-btn glass-btn-secondary flex items-center gap-2">
              <EditIcon />
              <span>编辑</span>
            </button>
            <button onClick={onDelete} className="glass-btn glass-btn-danger glass-btn-icon">
              <TrashIcon />
            </button>
          </div>
        </div>

        {/* 标签 */}
        {credential.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {credential.tags.map((tag) => (
              <span key={tag} className="glass-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="divider mx-6" />

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 密钥值 */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            密钥值
          </label>
          {credential.decryptError ? (
            // BUG-CRED-3：密文解密失败；UI 显式告警，避免把空串当真值误用
            <div
              className="code-block break-all"
              style={{
                color: '#dc6464',
                borderColor: 'rgba(220, 100, 100, 0.4)',
                background: 'rgba(220, 100, 100, 0.08)'
              }}
              role="alert"
              aria-label="凭证已损坏"
            >
              <div className="font-medium mb-1">此凭证已损坏，无法解密</div>
              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                请从备份导入。
                {credential.decryptErrorMessage
                  ? `（${credential.decryptErrorMessage}）`
                  : ''}
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="code-block pr-20 break-all">
                {showValue ? credential.value : maskValue(credential.value)}
              </div>
              <button
                onClick={() => setShowValue(!showValue)}
                className="absolute top-2 right-2 glass-btn glass-btn-sm flex items-center gap-1.5"
              >
                {showValue ? <EyeOffIcon /> : <EyeIcon />}
                <span className="text-xs">{showValue ? '隐藏' : '显示'}</span>
              </button>
            </div>
          )}
        </div>

        {/* TOTP（Q2 P3：TOTPRing 挂载） */}
        <CredentialTOTPSection credentialId={credential.id} />

        {/* 描述 */}
        {credential.description && (
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              描述
            </label>
            <p style={{ color: 'var(--text-primary)' }}>{credential.description}</p>
          </div>
        )}

        {/* 元数据 */}
        {Object.keys(credential.metadata).length > 0 && (
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              详细信息
            </label>
            <div className="glass p-4 space-y-3" style={{ borderRadius: '12px' }}>
              {credential.metadata.provider && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>服务提供商</span>
                  <span style={{ color: 'var(--text-primary)' }}>{credential.metadata.provider}</span>
                </div>
              )}
              {credential.metadata.endpoint && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>API 端点</span>
                  <span className="truncate ml-4" style={{ color: 'var(--text-primary)' }}>{credential.metadata.endpoint}</span>
                </div>
              )}
              {credential.metadata.host && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>主机</span>
                  <span style={{ color: 'var(--text-primary)' }}>{credential.metadata.host}</span>
                </div>
              )}
              {credential.metadata.port && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>端口</span>
                  <span style={{ color: 'var(--text-primary)' }}>{credential.metadata.port}</span>
                </div>
              )}
              {credential.metadata.database && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>数据库</span>
                  <span style={{ color: 'var(--text-primary)' }}>{credential.metadata.database}</span>
                </div>
              )}
              {credential.metadata.username && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-tertiary)' }}>用户名</span>
                  <span style={{ color: 'var(--text-primary)' }}>{credential.metadata.username}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 统计信息 */}
        <div>
          <label
            className="block text-sm font-medium mb-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            使用统计
          </label>
          <div className="glass p-4 grid grid-cols-2 gap-4" style={{ borderRadius: '12px' }}>
            <div>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>使用次数</span>
              <p className="text-lg font-medium" style={{ color: 'var(--morandi-green-dark)' }}>{credential.useCount}</p>
            </div>
            <div>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>最后使用</span>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {credential.lastUsedAt ? formatDate(credential.lastUsedAt) : '从未使用'}
              </p>
            </div>
            <div>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>创建时间</span>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatDate(credential.createdAt)}</p>
            </div>
            <div>
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>更新时间</span>
              <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{formatDate(credential.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
