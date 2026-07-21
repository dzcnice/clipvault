/**
 * 凭证管理 React Hook
 *
 * 修复（TASK-loading-fix）：
 *   1. options 对象引用不稳定问题 → 序列化为 JSON key 作为 effect 依赖
 *   2. 加入 cancelled token 防异步竞态（快速切换搜索词时老请求覆盖新请求）
 *   3. refresh 走 try/catch/finally，保证 loading 最终 reset（即使抛错）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Credential,
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilter,
  CredentialSortBy,
  SortDirection,
  WorkspaceContext
} from '@/types'

interface UseCredentialsOptions {
  filter?: CredentialFilter
  sortBy?: CredentialSortBy
  sortDir?: SortDirection
  limit?: number
  /** v2.1 · 工作区上下文；缺省 personal */
  workspace?: WorkspaceContext
}

interface UseCredentialsReturn {
  credentials: Credential[]
  total: number
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createCredential: (input: CreateCredentialInput) => Promise<Credential | null>
  updateCredential: (input: UpdateCredentialInput) => Promise<Credential | null>
  deleteCredential: (id: string) => Promise<boolean>
  copyCredential: (id: string) => Promise<boolean>
}

export function useCredentials(options: UseCredentialsOptions = {}): UseCredentialsReturn {
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { filter, sortBy, sortDir, limit, workspace = 'personal' } = options

  // 用 ref 保留最新参数；effect 用序列化 key 作为依赖
  const paramsRef = useRef({ filter, sortBy, sortDir, limit, workspace })
  paramsRef.current = { filter, sortBy, sortDir, limit, workspace }
  const optionsKey = JSON.stringify({ filter, sortBy, sortDir, limit, workspace })

  const requestTokenRef = useRef(0)

  const refresh = useCallback(async () => {
    const myToken = ++requestTokenRef.current
    setLoading(true)
    setError(null)

    try {
      const response = await window.api.credential.list({ ...paramsRef.current })
      if (myToken !== requestTokenRef.current) return

      if (response.success && response.data) {
        setCredentials(response.data.items)
        setTotal(response.data.total)
      } else {
        setError(response.error || '获取凭证列表失败')
      }
    } catch (err) {
      if (myToken !== requestTokenRef.current) return
      setError((err as Error).message)
    } finally {
      if (myToken === requestTokenRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, refresh])

  const createCredential = useCallback(
    async (input: CreateCredentialInput): Promise<Credential | null> => {
      try {
        const response = await window.api.credential.create({
          ...input,
          workspace: paramsRef.current.workspace
        })
        if (response.success && response.data) {
          await refresh()
          return response.data
        }
        setError(response.error || '创建凭证失败')
        return null
      } catch (err) {
        setError((err as Error).message)
        return null
      }
    },
    [refresh]
  )

  const updateCredential = useCallback(
    async (input: UpdateCredentialInput): Promise<Credential | null> => {
      try {
        const response = await window.api.credential.update(input)
        if (response.success && response.data) {
          await refresh()
          return response.data
        }
        setError(response.error || '更新凭证失败')
        return null
      } catch (err) {
        setError((err as Error).message)
        return null
      }
    },
    [refresh]
  )

  const deleteCredential = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const response = await window.api.credential.delete(id)
        if (response.success) {
          await refresh()
          return true
        }
        setError(response.error || '删除凭证失败')
        return false
      } catch (err) {
        setError((err as Error).message)
        return false
      }
    },
    [refresh]
  )

  const copyCredential = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await window.api.credential.copy(id)
      if (response.success) {
        return true
      }
      setError(response.error || '复制失败')
      return false
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }, [])

  return {
    credentials,
    total,
    loading,
    error,
    refresh,
    createCredential,
    updateCredential,
    deleteCredential,
    copyCredential
  }
}
