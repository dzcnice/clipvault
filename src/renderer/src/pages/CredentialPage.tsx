/**
 * 凭证 · 钥匙箱
 */

import { useState, useMemo } from 'react'
import { KeyRound, Loader2, Plus } from 'lucide-react'
import { useCredentials } from '../hooks/useCredentials'
import CredentialList from '../components/CredentialList'
import CredentialDetail from '../components/CredentialDetail'
import CredentialForm from '../components/CredentialForm'
import SearchBar from '../components/SearchBar'
import { useConfirm } from '../components/ConfirmDialog'
import { showPixelToast } from '../components/PixelToast'
import type { Credential, CredentialFilter, CreateCredentialInput } from '@/types'

export default function CredentialPage(): JSX.Element {
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null)
  const confirm = useConfirm()

  const filter: CredentialFilter | undefined = useMemo(() => {
    if (!searchKeyword) return undefined
    return { keyword: searchKeyword }
  }, [searchKeyword])

  const {
    credentials,
    total,
    loading,
    error,
    createCredential,
    updateCredential,
    deleteCredential,
    copyCredential
  } = useCredentials({ filter, workspace: 'personal' })

  const handleCopy = async (credential: Credential): Promise<void> => {
    const success = await copyCredential(credential.id)
    if (success) showPixelToast('已复制')
  }

  const handleDelete = async (credential: Credential): Promise<void> => {
    const ok = await confirm({
      title: '删除凭证',
      message: `确定删除「${credential.name}」？不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      variant: 'danger'
    })
    if (ok) {
      const success = await deleteCredential(credential.id)
      if (success && selectedCredential?.id === credential.id) {
        setSelectedCredential(null)
      }
    }
  }

  const handleFormSubmit = async (input: CreateCredentialInput): Promise<void> => {
    if (editingCredential) {
      await updateCredential({ id: editingCredential.id, ...input })
      showPixelToast('已保存')
    } else {
      await createCredential(input)
      showPixelToast('已收入箱子')
    }
    setIsFormOpen(false)
    setEditingCredential(null)
  }

  return (
    <div className="flex h-full">
      <section
        className="flex w-[22rem] shrink-0 flex-col border-r-2 border-[var(--line)]"
        style={{ background: 'var(--surface-2)' }}
      >
        <div className="space-y-3 border-b-2 border-[var(--line)] p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="cv-kicker mb-1">凭证</p>
              <h1 className="font-pixel text-lg font-bold text-foreground">钥匙箱</h1>
              <p className="font-mono mt-0.5 text-[11px] text-muted-foreground">
                {total} 把钥匙
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingCredential(null)
                setIsFormOpen(true)
              }}
              className="cv-btn cv-btn-primary px-2.5 py-1.5 text-xs"
            >
              <Plus size={14} strokeWidth={2.5} />
              新建
            </button>
          </div>
          <SearchBar
            placeholder="搜索凭证…"
            value={searchKeyword}
            onChange={(k) => {
              setSearchKeyword(k)
              setSelectedCredential(null)
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && credentials.length === 0 && !error ? (
            <div className="cv-empty py-12">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--primary)' }} />
            </div>
          ) : error && credentials.length === 0 ? (
            <div
              className="p-4 text-center font-body text-sm"
              style={{ color: 'var(--destructive)' }}
            >
              {error}
            </div>
          ) : credentials.length === 0 ? (
            <div className="cv-empty py-12">
              <div
                className="cv-icon-slot !h-12 !w-12"
                style={{ background: 'var(--primary-soft)' }}
              >
                <KeyRound size={22} strokeWidth={2} />
              </div>
              <p className="font-pixel text-sm font-bold">
                {searchKeyword ? '没找到' : '还没有钥匙'}
              </p>
              <p className="font-body text-xs text-muted-foreground">点「新建」收进箱子</p>
            </div>
          ) : (
            <CredentialList
              credentials={credentials}
              selectedId={selectedCredential?.id}
              onSelect={setSelectedCredential}
              onCopy={(c) => void handleCopy(c)}
              onDelete={(c) => void handleDelete(c)}
            />
          )}
        </div>
      </section>

      <section className="min-w-0 flex-1 overflow-hidden" style={{ background: 'var(--surface)' }}>
        {selectedCredential ? (
          <CredentialDetail
            credential={selectedCredential}
            onCopy={() => void handleCopy(selectedCredential)}
            onEdit={() => {
              setEditingCredential(selectedCredential)
              setIsFormOpen(true)
            }}
            onDelete={() => void handleDelete(selectedCredential)}
          />
        ) : (
          <div className="cv-empty h-full">
            <div
              className="cv-icon-slot !h-16 !w-16"
              style={{ background: 'var(--primary-soft)' }}
            >
              <KeyRound size={28} strokeWidth={2} />
            </div>
            <p className="font-pixel text-base font-bold text-foreground">选一把钥匙</p>
            <p className="font-body text-sm text-muted-foreground">
              或新建一条，加密保存在本机
            </p>
          </div>
        )}
      </section>

      {isFormOpen && (
        <CredentialForm
          credential={editingCredential}
          onSubmit={handleFormSubmit}
          onCancel={() => {
            setIsFormOpen(false)
            setEditingCredential(null)
          }}
        />
      )}
    </div>
  )
}
