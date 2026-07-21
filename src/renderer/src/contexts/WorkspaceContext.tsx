/**
 * Workspace 上下文 · v3 个人本地版
 *
 * 固定 personal，不再拉取 team 信息。
 * 保留 API 形状（setCtx / teamInfo / hasTeam）以兼容现有 hooks/pages 与单测。
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode
} from 'react'
import type { TeamInfo, WorkspaceContext as WorkspaceCtxValue } from '@/types'

export interface WorkspaceContextShape {
  ctx: WorkspaceCtxValue
  setCtx: (next: WorkspaceCtxValue) => void
  teamInfo: TeamInfo | null
  hasTeam: boolean
  refreshTeam: () => Promise<void>
  initialized: boolean
}

const WorkspaceContext = createContext<WorkspaceContextShape | null>(null)

export interface WorkspaceProviderProps {
  children: ReactNode
  /** 测试兼容：忽略 team 注入 */
  initialTeamInfo?: TeamInfo | null
}

export function WorkspaceProvider({
  children
}: WorkspaceProviderProps): JSX.Element {
  const setCtx = useCallback((_next: WorkspaceCtxValue): void => {
    /* personal-only: no-op */
  }, [])

  const refreshTeam = useCallback(async (): Promise<void> => {
    /* personal-only: no-op */
  }, [])

  const value = useMemo<WorkspaceContextShape>(
    () => ({
      ctx: 'personal',
      setCtx,
      teamInfo: null,
      hasTeam: false,
      refreshTeam,
      initialized: true
    }),
    [setCtx, refreshTeam]
  )

  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextShape {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    // 兜底：未包 Provider 时仍可工作
    return {
      ctx: 'personal',
      setCtx: () => undefined,
      teamInfo: null,
      hasTeam: false,
      refreshTeam: async () => undefined,
      initialized: true
    }
  }
  return ctx
}
