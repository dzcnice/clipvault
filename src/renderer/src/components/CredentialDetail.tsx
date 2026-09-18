/**
 * 凭证详情 · 像素壳
 */

import { useEffect, useState } from 'react'
import type { Credential } from '@/types'
import { getCredentialTypeMeta } from '@/types'
import CredentialTOTPSection from './CredentialTOTPSection'
import { showPixelToast } from './PixelToast'
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Star,
  Trash2
} from 'lucide-react'

interface CredentialDetailProps {
  credential: Credential
  onCopy: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleFavorite?: () => void
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN')
}

function maskValue(value: string): string {
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`
}

export default function CredentialDetail({
  credential,
  onCopy,
  onEdit,
  onDelete,
  onToggleFavorite
}: CredentialDetailProps): JSX.Element {
  const [showValue, setShowValue] = useState(false)
  const [maskDefault, setMaskDefault] = useState(true)

  useEffect(() => {
    setShowValue(false)
    void window.api.prefs?.get?.().then((res) => {
      if (res.success && res.data && typeof res.data.maskSecretsByDefault === 'boolean') {
        setMaskDefault(res.data.maskSecretsByDefault)
        setShowValue(!res.data.maskSecretsByDefault)
      }
    })
  }, [credential.id])

  const url =
    credential.metadata.endpoint ||
    credential.metadata.custom?.url ||
    (credential.metadata.host ? `https://${credential.metadata.host}` : '')

  const revealed = !maskDefault && showValue ? true : showValue

  return (
    <div className="flex h-full flex-col">
      <header className="border-b-2 border-[var(--line)] px-6 py-5">
        <p className="cv-kicker mb-1">钥匙</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-pixel text-lg font-bold">
              <span className="truncate">{credential.name}</span>
              {credential.isFavorite ? (
                <Star size={16} className="shrink-0 fill-current" style={{ color: 'var(--primary)' }} />
              ) : null}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {getCredentialTypeMeta(credential.type).label}
              {credential.metadata.provider ? ` · ${credential.metadata.provider}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {onToggleFavorite ? (
              <button
                type="button"
                className="cv-btn cv-btn-ghost p-2"
                title={credential.isFavorite ? '取消收藏' : '收藏'}
                onClick={onToggleFavorite}
              >
                <Star size={14} className={credential.isFavorite ? 'fill-current' : ''} />
              </button>
            ) : null}
            {credential.metadata.username ? (
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                onClick={() => {
                  void window.api.credential.copy(credential.id, { field: 'username' }).then((r) => {
                    if (r.success) showPixelToast('已复制用户名')
                    else showPixelToast(r.error || '复制用户名失败')
                  })
                }}
              >
                <Copy size={14} />
                用户名
              </button>
            ) : null}
            {credential.metadata.username ? (
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                disabled={credential.decryptError}
                onClick={() => {
                  void window.api.credential.copy(credential.id, {
                    sequence: 'username_then_value',
                    delayMs: 800
                  })
                }}
              >
                用户名→密码
              </button>
            ) : null}
            {url ? (
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                onClick={() => {
                  void window.open(url, '_blank', 'noopener,noreferrer')
                }}
              >
                <ExternalLink size={14} />
                打开
              </button>
            ) : null}
            <button
              type="button"
              className="cv-btn cv-btn-primary text-xs"
              disabled={credential.decryptError}
              onClick={onCopy}
            >
              <Copy size={14} />
              复制
            </button>
            <button
              type="button"
              className="cv-btn cv-btn-secondary text-xs"
              disabled={credential.decryptError}
              onClick={() => {
                void (async () => {
                  try {
                    await window.api.window?.minimize?.()
                    await new Promise((r) => setTimeout(r, 120))
                    const res = await window.api.credential.copy(credential.id, {
                      field: 'value',
                      thenPaste: true
                    })
                    if (!res.success) showPixelToast(res.error || '操作失败')
                  } catch {
                    /* ignore */
                  }
                })()
              }}
            >
              复制并粘贴
            </button>
            <button type="button" className="cv-btn cv-btn-secondary text-xs" onClick={onEdit}>
              <Pencil size={14} />
              编辑
            </button>
            <button type="button" className="cv-btn cv-btn-danger p-2" onClick={onDelete} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {credential.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {credential.tags.map((tag) => (
              <span key={tag} className="cv-badge">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <section>
          <div className="mb-2 text-xs font-medium text-muted-foreground">密钥值</div>
          {credential.decryptError ? (
            <div className="cv-panel p-4 text-sm" style={{ color: 'var(--destructive)' }} role="alert">
              <div className="font-medium">此凭证已损坏，无法解密</div>
              <div className="mt-1 text-xs text-muted-foreground">
                请从备份导入
                {credential.decryptErrorMessage ? `（${credential.decryptErrorMessage}）` : ''}
              </div>
            </div>
          ) : (
            <div className="relative">
              <pre className="cv-panel overflow-x-auto p-4 pr-24 font-mono text-[12px] leading-relaxed">
                {revealed ? credential.value : maskValue(credential.value)}
              </pre>
              <button
                type="button"
                className="cv-btn cv-btn-ghost absolute right-2 top-2 text-[11px] !px-2 !py-1"
                onClick={() => setShowValue((v) => !v)}
              >
                {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
                {revealed ? '隐藏' : '显示'}
              </button>
            </div>
          )}
        </section>

        <CredentialTOTPSection credentialId={credential.id} />

        {credential.description ? (
          <section>
            <div className="mb-2 text-xs font-medium text-muted-foreground">描述</div>
            <p className="text-sm">{credential.description}</p>
          </section>
        ) : null}

        {Object.keys(credential.metadata).length > 0 ? (
          <section>
            <div className="mb-2 text-xs font-medium text-muted-foreground">详细信息</div>
            <dl className="cv-panel divide-y divide-[var(--line-soft)] text-sm">
              {credential.metadata.provider ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">服务</dt>
                  <dd>{credential.metadata.provider}</dd>
                </div>
              ) : null}
              {credential.metadata.endpoint ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">端点</dt>
                  <dd className="truncate">{credential.metadata.endpoint}</dd>
                </div>
              ) : null}
              {credential.metadata.host ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">主机</dt>
                  <dd>{credential.metadata.host}</dd>
                </div>
              ) : null}
              {credential.metadata.port ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">端口</dt>
                  <dd className="font-mono-num">{credential.metadata.port}</dd>
                </div>
              ) : null}
              {credential.metadata.database ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">数据库</dt>
                  <dd>{credential.metadata.database}</dd>
                </div>
              ) : null}
              {credential.metadata.username ? (
                <div className="flex justify-between gap-4 px-4 py-2.5">
                  <dt className="text-muted-foreground">用户名</dt>
                  <dd>{credential.metadata.username}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        <section>
          <div className="mb-2 text-xs font-medium text-muted-foreground">使用统计</div>
          <div className="cv-panel grid grid-cols-2 gap-4 p-4 text-sm">
            <div>
              <div className="text-muted-foreground">使用次数</div>
              <div className="font-mono-num text-lg">{credential.useCount}</div>
            </div>
            <div>
              <div className="text-muted-foreground">最后使用</div>
              <div>{credential.lastUsedAt ? formatDate(credential.lastUsedAt) : '从未使用'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">创建</div>
              <div>{formatDate(credential.createdAt)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">更新</div>
              <div>{formatDate(credential.updatedAt)}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
