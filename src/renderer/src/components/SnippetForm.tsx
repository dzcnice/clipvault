/**
 * 快速片段表单 · 支持编辑 + 变量 chips
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import type { ClipboardItem, CreateSnippetInput, UpdateSnippetInput } from '@/types'

const VARS = [
  { token: '{date}', tip: '今天日期 YYYY-MM-DD' },
  { token: '{time}', tip: '当前时间 HH:mm:ss' },
  { token: '{datetime}', tip: '日期+时间' },
  { token: '{year}', tip: '年份' },
  { token: '{clip}', tip: '当前剪贴板文本' }
]

interface SnippetFormProps {
  snippet?: ClipboardItem | null
  onSubmit: (input: CreateSnippetInput | UpdateSnippetInput) => Promise<void>
  onCancel: () => void
}

export default function SnippetForm({
  snippet,
  onSubmit,
  onCancel
}: SnippetFormProps): JSX.Element {
  const [name, setName] = useState(snippet?.snippetName || '')
  const [content, setContent] = useState(snippet?.content || '')
  const [shortcut, setShortcut] = useState(snippet?.snippetShortcut || '')
  const [tagsInput, setTagsInput] = useState((snippet?.tags ?? []).join(', '))
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

      if (snippet?.id) {
        await onSubmit({
          id: snippet.id,
          name: name.trim(),
          content: content.trim(),
          shortcut: shortcut.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined
        })
      } else {
        await onSubmit({
          name: name.trim(),
          content: content.trim(),
          shortcut: shortcut.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const insertVar = (token: string): void => {
    setContent((c) => c + token)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(43,36,56,0.35)] p-4 animate-fadeIn">
      <div className="cv-panel w-full max-w-lg">
        <div className="flex items-center justify-between border-b-2 border-[var(--line)] px-5 py-3">
          <h3 className="font-pixel text-sm font-bold">
            {snippet ? '编辑片段' : '新建片段'}
          </h3>
          <button type="button" className="cv-btn cv-btn-ghost p-2" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              名称 *
            </label>
            <input
              type="text"
              className="w-full border-2 border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm"
              placeholder="例如：邮箱签名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {errors.name ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--destructive)' }}>
                {errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              内容 *
            </label>
            <textarea
              className="min-h-[140px] w-full border-2 border-[var(--line)] bg-[var(--input)] px-3 py-2 font-mono text-sm"
              placeholder="要保存的文本…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            {errors.content ? (
              <p className="mt-1 text-xs" style={{ color: 'var(--destructive)' }}>
                {errors.content}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {VARS.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  className="cv-btn cv-btn-ghost font-mono text-[11px] !px-2 !py-0.5"
                  title={v.tip}
                  onClick={() => insertVar(v.token)}
                >
                  {v.token}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {content.length} 字 · 点击变量插入，复制时自动展开
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              全局热键（可选）
            </label>
            <input
              type="text"
              className="w-full border-2 border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm"
              placeholder="CommandOrControl+Alt+1"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Electron accelerator 才会注册全局键；普通别名只用于搜索。
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              标签（逗号分隔）
            </label>
            <input
              type="text"
              className="w-full border-2 border-[var(--line)] bg-[var(--input)] px-3 py-2 text-sm"
              placeholder="工作, 签名"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="cv-btn cv-btn-secondary" onClick={onCancel} disabled={submitting}>
              取消
            </button>
            <button type="submit" className="cv-btn cv-btn-primary" disabled={submitting}>
              {submitting ? '保存中…' : snippet ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
