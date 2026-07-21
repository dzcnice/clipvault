/**
 * 快速片段表单组件 - 液态玻璃风格
 */

import { useState } from 'react'
import type { CreateSnippetInput } from '@/types'

/** 关闭图标 */
const CloseIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)

interface SnippetFormProps {
  onSubmit: (input: CreateSnippetInput) => Promise<void>
  onCancel: () => void
}

export default function SnippetForm({
  onSubmit,
  onCancel
}: SnippetFormProps): JSX.Element {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [shortcut, setShortcut] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!name.trim()) {
      newErrors.name = '请输入片段名称'
    }
    if (!content.trim()) {
      newErrors.content = '请输入片段内容'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()

    if (!validate()) return

    setSubmitting(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t)

      await onSubmit({
        name: name.trim(),
        content: content.trim(),
        shortcut: shortcut.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50 animate-fadeIn">
      <div
        className="glass w-full max-w-lg mx-4 animate-scaleIn"
        style={{ borderRadius: '20px' }}
      >
        {/* 表单头部 */}
        <div className="px-6 py-4 flex items-center justify-between">
          <h3
            className="text-lg font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            新建快速片段
          </h3>
          <button
            onClick={onCancel}
            className="glass-btn glass-btn-icon"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="divider mx-6" />

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 名称 */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              片段名称 <span style={{ color: '#dc6464' }}>*</span>
            </label>
            <input
              type="text"
              className={`glass-input ${errors.name ? 'glass-input-error' : ''}`}
              placeholder="例如：常用邮箱签名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name && (
              <p className="text-sm mt-1" style={{ color: '#dc6464' }}>{errors.name}</p>
            )}
          </div>

          {/* 内容 */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              片段内容 <span style={{ color: '#dc6464' }}>*</span>
            </label>
            <textarea
              className={`glass-input min-h-[150px] font-mono text-sm ${errors.content ? 'glass-input-error' : ''}`}
              placeholder="输入您要保存的文本内容..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {errors.content && (
              <p className="text-sm mt-1" style={{ color: '#dc6464' }}>{errors.content}</p>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {content.length} 个字符
            </p>
          </div>

          {/* 快捷键 */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              快捷标识（可选）
            </label>
            <input
              type="text"
              className="glass-input"
              placeholder="例如：sig1, email, addr"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              设置一个简短的标识，方便快速查找
            </p>
          </div>

          {/* 标签 */}
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              标签（可选）
            </label>
            <input
              type="text"
              className="glass-input"
              placeholder="多个标签用逗号分隔"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="glass-btn"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="glass-btn glass-btn-primary"
              disabled={submitting}
            >
              {submitting ? '创建中...' : '创建片段'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
