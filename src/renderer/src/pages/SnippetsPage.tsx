/**
 * 快速片段 · 像素壳
 */

import { useState } from 'react'
import { Copy, Loader2, Pencil, Plus, Scissors, Trash2 } from 'lucide-react'
import { useSnippets } from '../hooks/useClipboard'
import SnippetForm from '../components/SnippetForm'
import { useConfirm } from '../components/ConfirmDialog'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { showPixelToast } from '../components/PixelToast'
import type { ClipboardItem, CreateSnippetInput, UpdateSnippetInput } from '@/types'

export default function SnippetsPage(): JSX.Element {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClipboardItem | null>(null)
  const confirm = useConfirm()
  const { ctx } = useWorkspace()
  const {
    snippets,
    loading,
    error,
    createSnippet,
    updateSnippet,
    copySnippet,
    deleteSnippet
  } = useSnippets({ workspace: ctx })

  const handleFormSubmit = async (
    input: CreateSnippetInput | UpdateSnippetInput
  ): Promise<void> => {
    if ('id' in input && input.id) {
      await updateSnippet(input as UpdateSnippetInput)
    } else {
      await createSnippet(input as CreateSnippetInput)
    }
    setIsFormOpen(false)
    setEditing(null)
  }

  const handleCopy = async (snippet: ClipboardItem): Promise<void> => {
    const ok = await copySnippet(snippet.id)
    showPixelToast(ok ? '已复制（变量已展开）' : '复制失败')
  }

  const handleDelete = async (snippet: ClipboardItem): Promise<void> => {
    const ok = await confirm({
      title: '删除片段',
      message: `确定删除「${snippet.snippetName}」？`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    })
    if (ok) await deleteSnippet(snippet.id)
  }

  return (
    <div className="cv-page">
      <div className="cv-page-inner">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="cv-kicker mb-1">背包</p>
            <h1 className="cv-page-title">快速片段</h1>
            <p className="cv-page-desc">
              常用文本模板。支持 {'{date}'} {'{time}'} {'{datetime}'} {'{year}'} {'{clip}'}
            </p>
          </div>
          <button
            type="button"
            className="cv-btn cv-btn-primary text-xs"
            onClick={() => {
              setEditing(null)
              setIsFormOpen(true)
            }}
          >
            <Plus size={14} strokeWidth={2.5} />
            新建片段
          </button>
        </header>

        {loading && snippets.length === 0 && !error ? (
          <div className="cv-empty">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--primary)' }} />
            <span className="font-body text-sm">加载中…</span>
          </div>
        ) : error && snippets.length === 0 ? (
          <div className="cv-empty" style={{ color: 'var(--destructive)' }}>
            {error}
          </div>
        ) : snippets.length === 0 ? (
          <div className="cv-empty">
            <div className="cv-icon-slot !h-16 !w-16" style={{ background: 'var(--primary-soft)' }}>
              <Scissors size={28} strokeWidth={2} />
            </div>
            <p className="font-pixel text-base font-bold">还没有片段</p>
            <p className="font-body max-w-xs text-sm text-muted-foreground">
              把常用签名、命令、回复存成模板，复制时自动展开日期和时间。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {snippets.map((snippet) => (
              <article key={snippet.id} className="cv-panel flex flex-col p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="truncate font-medium">{snippet.snippetName}</h3>
                  {snippet.snippetShortcut ? (
                    <span className="cv-badge shrink-0 font-mono text-[10px]">
                      {snippet.snippetShortcut}
                    </span>
                  ) : null}
                </div>
                <p className="mb-3 min-h-[3rem] font-mono text-[12px] leading-relaxed text-muted-foreground line-clamp-3">
                  {snippet.preview}
                </p>
                {snippet.tags.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {snippet.tags.map((tag) => (
                      <span key={tag} className="cv-badge text-[10px]">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-auto flex items-center justify-between border-t-2 border-[var(--line)] pt-3">
                  <span className="font-mono-num text-[11px] text-muted-foreground">
                    用过 {snippet.useCount} 次
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="cv-btn cv-btn-ghost p-2"
                      title="复制"
                      onClick={() => void handleCopy(snippet)}
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      className="cv-btn cv-btn-ghost p-2"
                      title="编辑"
                      onClick={() => {
                        setEditing(snippet)
                        setIsFormOpen(true)
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="cv-btn cv-btn-ghost p-2"
                      title="删除"
                      onClick={() => void handleDelete(snippet)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {isFormOpen ? (
        <SnippetForm
          snippet={editing}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setIsFormOpen(false)
            setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}
