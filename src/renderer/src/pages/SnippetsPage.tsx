/**
 * 快速片段页面 - 液态玻璃风格
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useSnippets } from '../hooks/useClipboard'
import SnippetForm from '../components/SnippetForm'
import { useConfirm } from '../components/ConfirmDialog'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { logger } from '../utils/logger'
import type { ClipboardItem, CreateSnippetInput, UpdateSnippetInput } from '@/types'

/** 文件夹图标 */
const FolderIcon = () => (
  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ color: 'var(--morandi-green)' }}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
  </svg>
)

/** 加号图标 */
const PlusIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
)

/** 复制图标 */
const CopyIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
  </svg>
)

/** 删除图标 */
const TrashIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
)

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

  const handleCreate = (): void => {
    setEditing(null)
    setIsFormOpen(true)
  }

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
    // 优先展开 {date}/{time}/{clip} 等变量后再写入剪贴板
    try {
      const { expandSnippetVariables } = await import('@/utils/snippet-vars')
      let clip = ''
      try {
        clip = await navigator.clipboard.readText()
      } catch {
        clip = ''
      }
      const raw = snippet.content || snippet.preview || ''
      const expanded = expandSnippetVariables(raw, { clip })
      await navigator.clipboard.writeText(expanded)
      logger.info('已复制片段（含变量展开）')
      return
    } catch {
      /* fallback */
    }
    const success = await copySnippet(snippet.id)
    if (success) {
      logger.info('已复制到剪贴板')
    }
  }

  const handleDelete = async (snippet: ClipboardItem): Promise<void> => {
    const ok = await confirm({
      title: '删除快速片段',
      message: `确定要删除片段 "${snippet.snippetName}" 吗？`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    })
    if (ok) {
      await deleteSnippet(snippet.id)
    }
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* 顶部操作栏 */}
      <div
        className="glass p-4 animate-slideUp"
        style={{ borderRadius: '16px' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              快速片段
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              保存常用文本；支持 {'{date}'} {'{time}'} {'{datetime}'} {'{year}'} {'{clip}'} 变量
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="glass-btn glass-btn-primary flex items-center gap-2"
          >
            <PlusIcon />
            <span>新建片段</span>
          </button>
        </div>
      </div>

      {/* 片段列表（渲染分支见 ClipboardPage 注释） */}
      <div
        className="flex-1 overflow-y-auto mt-4 glass p-4 animate-slideUp"
        style={{ borderRadius: '16px', animationDelay: '0.05s' }}
      >
        {loading && snippets.length === 0 && !error ? (
          <div
            className="text-center py-8 flex flex-col items-center gap-3"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : error && snippets.length === 0 ? (
          <div className="text-center py-8" style={{ color: '#dc6464' }}>
            {error}
          </div>
        ) : snippets.length === 0 ? (
          <div
            className="text-center py-12"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <div className="mb-4 flex justify-center">
              <FolderIcon />
            </div>
            <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>
              暂无快速片段
            </p>
            <p className="text-sm mt-2">点击"新建片段"添加常用的文本</p>
          </div>
        ) : (
          <>
            {loading && (
              <div
                data-testid="snippets-refreshing"
                className="mb-3 flex items-center justify-center gap-1.5 text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>刷新中</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {snippets.map((snippet) => (
              <div
                key={snippet.id}
                className="glass-card p-4 group"
              >
                {/* 片段名称 */}
                <div className="flex items-center justify-between mb-3">
                  <h3
                    className="font-medium truncate"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {snippet.snippetName}
                  </h3>
                  {snippet.snippetShortcut && (
                    <span className="glass-tag glass-tag-pink text-xs">
                      {snippet.snippetShortcut}
                    </span>
                  )}
                </div>

                {/* 片段内容预览 */}
                <div className="code-block text-sm truncate-2 mb-3 min-h-[3rem]">
                  {snippet.preview}
                </div>

                {/* 标签 */}
                {snippet.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {snippet.tags.map((tag) => (
                      <span key={tag} className="glass-tag-neutral glass-tag text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 操作区域 */}
                <div className="divider my-3" />

                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    使用 {snippet.useCount} 次
                  </span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      onClick={() => handleCopy(snippet)}
                      className="glass-btn glass-btn-icon glass-btn-sm"
                      title="复制"
                    >
                      <CopyIcon />
                    </button>
                    <button
                      onClick={() => {
                        setEditing(snippet)
                        setIsFormOpen(true)
                      }}
                      className="glass-btn glass-btn-icon glass-btn-sm"
                      title="编辑"
                    >
                      编
                    </button>
                    <button
                      onClick={() => handleDelete(snippet)}
                      className="glass-btn glass-btn-danger glass-btn-icon glass-btn-sm"
                      title="删除"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </>
        )}
      </div>

      {/* 新建表单弹窗 */}
      {isFormOpen && (
        <SnippetForm
          snippet={editing}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setIsFormOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
