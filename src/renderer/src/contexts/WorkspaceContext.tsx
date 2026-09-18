/**
 * Workspace 上下文 · v3 个人本地版
 *
 * 固定 personal。仅保留 ctx，供片段等仍走 workspace 入参的 hooks 使用。
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'

export interface WorkspaceContextShape {
  ctx: 'personal'
  initialized: boolean
}

const WorkspaceContext = createContext<WorkspaceContextShape | null>(null)

export interface WorkspaceProviderProps {
  children: ReactNode
}

export function WorkspaceProvider({ children }: WorkspaceProviderProps): JSX.Element {
  const value = useMemo<WorkspaceContextShape>(
    () => ({ ctx: 'personal', initialized: true }),
    []
  )
  return (
    <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
  )
}

export function useWorkspace(): WorkspaceContextShape {
  return (
    useContext(WorkspaceContext) ?? {
      ctx: 'personal',
      initialized: true
    }
  )
}
