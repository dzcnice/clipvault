/**
 * 凭证表单 · 像素对话框壳 + 清晰表单
 */

import { useState } from 'react'
import type { Credential, CreateCredentialInput } from '@/types'
import { CredentialType, CREDENTIAL_TYPE_OPTIONS } from '@/types'
import { X } from 'lucide-react'

interface CredentialFormProps {
  credential?: Credential | null
  onSubmit: (input: CreateCredentialInput) => Promise<void>
  onCancel: () => void
}

export default function CredentialForm({
  credential,
  onSubmit,
  onCancel
}: CredentialFormProps): JSX.Element {
  const [name, setName] = useState(credential?.name || '')
  const [type, setType] = useState<CredentialType>(
    credential?.type ?? CredentialType.API_KEY
  )
  const [value, setValue] = useState(credential?.value || '')
  const [description, setDescription] = useState(credential?.description || '')
  const [provider, setProvider] = useState(credential?.metadata.provider || '')
  const [tagsInput, setTagsInput] = useState(credential?.tags.join(', ') || '')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = '请输入名称'
    if (!value.trim()) next.value = '请输入密钥值'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await onSubmit({
        name: name.trim(),
        type,
        value: value.trim(),
        description: description.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        metadata: provider ? { provider: provider.trim() } : undefined
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(43,36,56,0.4)] p-4 animate-fadeIn">
      <div className="cv-panel w-full max-w-lg overflow-hidden animate-scaleIn" role="dialog" aria-modal="true">
        <div
          className="flex items-center justify-between border-b-2 border-[var(--line)] px-5 py-3"
          style={{ background: 'var(--surface-2)' }}
        >
          <div>
            <p className="cv-kicker mb-0.5">钥匙</p>
            <h3 className="font-pixel text-base font-bold text-foreground">
              {credential ? '编辑凭证' : '新建凭证'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="cv-btn cv-btn-secondary !p-1.5"
            aria-label="关闭"
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3.5 p-5 font-body">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              名称 *
            </label>
            <input
              type="text"
              className="cv-input"
              placeholder="例如：OpenAI API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {errors.name ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--destructive)' }}>
                {errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">类型</label>
            <select
              className="cv-input"
              value={type}
              onChange={(e) => setType(e.target.value as CredentialType)}
            >
              {CREDENTIAL_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              密钥值 *
            </label>
            <textarea
              className="cv-input min-h-[100px] font-mono text-sm"
              placeholder="粘贴密钥…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            {errors.value ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--destructive)' }}>
                {errors.value}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                提供商
              </label>
              <input
                type="text"
                className="cv-input"
                placeholder="OpenAI"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">标签</label>
              <input
                type="text"
                className="cv-input"
                placeholder="prod, api"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">描述</label>
            <input
              type="text"
              className="cv-input"
              placeholder="可选"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="cv-btn cv-btn-secondary" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="cv-btn cv-btn-primary" disabled={submitting}>
              {submitting ? '…' : credential ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
