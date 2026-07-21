/**
 * 凭证相关 IPC 处理器
 * KR 1.2: 密钥 CRUD 功能
 */

import { ipcMain, clipboard } from 'electron'
import { IPC_CHANNELS } from '../../types'
import * as credentialStore from '../../db/credential-store'
import { wrapUnlockedHandler } from './utils'
import { clipboardAutoClear } from '../clipboard/auto-clear'
import { getPrefs } from '../prefs'
import { logger } from '../utils/logger'
import type {
  CreateCredentialInput,
  UpdateCredentialInput,
  CredentialFilter,
  CredentialSortBy,
  SortDirection,
  ApiResponse,
  Credential,
  WorkspaceContext
} from '../../types'

/** v3 个人版：强制 personal（忽略 team 入参，兼容旧调用方） */
function normalizeWorkspace(_ws?: unknown): WorkspaceContext {
  return 'personal'
}

/** 注册凭证相关的 IPC 处理器（全部经过 vault 解锁门禁） */
export function registerCredentialHandlers(): void {
  // 创建凭证（v2.1 · 支持 workspace，缺省 personal）
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_CREATE,
    wrapUnlockedHandler(
      async (
        _event,
        input: CreateCredentialInput & { workspace?: WorkspaceContext }
      ): Promise<ApiResponse<Credential>> => {
        try {
          const workspace = normalizeWorkspace(input.workspace)
          const credential = credentialStore.createCredential(input, workspace)
          return { success: true, data: credential }
        } catch (error) {
          logger.error('[IPC] Error creating credential:', error)
          return { success: false, error: (error as Error).message }
        }
      }
    )
  )

  // 更新凭证
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_UPDATE,
    wrapUnlockedHandler(
      async (_event, input: UpdateCredentialInput): Promise<ApiResponse<Credential>> => {
        try {
          const credential = credentialStore.updateCredential(input)
          if (!credential) {
            return { success: false, error: '凭证不存在' }
          }
          return { success: true, data: credential }
        } catch (error) {
          logger.error('[IPC] Error updating credential:', error)
          return { success: false, error: (error as Error).message }
        }
      }
    )
  )

  // 删除凭证
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_DELETE,
    wrapUnlockedHandler(async (_event, id: string): Promise<ApiResponse<boolean>> => {
      try {
        const success = credentialStore.deleteCredential(id)
        return { success, data: success }
      } catch (error) {
        logger.error('[IPC] Error deleting credential:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 获取单个凭证
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_GET,
    wrapUnlockedHandler(async (_event, id: string): Promise<ApiResponse<Credential>> => {
      try {
        const credential = credentialStore.getCredentialById(id)
        if (!credential) {
          return { success: false, error: '凭证不存在' }
        }
        return { success: true, data: credential }
      } catch (error) {
        logger.error('[IPC] Error getting credential:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  // 查询凭证列表（v2.1 · 支持 workspace 过滤，缺省 personal）
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_LIST,
    wrapUnlockedHandler(
      async (
        _event,
        params: {
          filter?: CredentialFilter
          sortBy?: CredentialSortBy
          sortDir?: SortDirection
          limit?: number
          offset?: number
          workspace?: WorkspaceContext
        }
      ): Promise<ApiResponse<{ items: Credential[]; total: number }>> => {
        try {
          const workspace = normalizeWorkspace(params?.workspace)
          const result = credentialStore.listCredentials(
            params?.filter,
            params?.sortBy,
            params?.sortDir,
            params?.limit,
            params?.offset,
            workspace
          )
          return { success: true, data: result }
        } catch (error) {
          logger.error('[IPC] Error listing credentials:', error)
          return { success: false, error: (error as Error).message }
        }
      }
    )
  )

  // 复制凭证值到剪贴板
  ipcMain.handle(
    IPC_CHANNELS.CREDENTIAL_COPY,
    wrapUnlockedHandler(async (_event, id: string): Promise<ApiResponse<boolean>> => {
      try {
        const credential = credentialStore.getCredentialById(id)
        if (!credential) {
          return { success: false, error: '凭证不存在' }
        }

        clipboard.writeText(credential.value)
        credentialStore.recordCredentialUsage(id)
        // v2.0 Sprint 13 TASK-068：30 秒后自动清空剪贴板（SHA256 校验防误清）
        const ttl = getPrefs().autoClearTtlMs
        if (ttl > 0) {
          clipboardAutoClear.schedule(credential.value, ttl)
        }

        return { success: true, data: true }
      } catch (error) {
        logger.error('[IPC] Error copying credential:', error)
        return { success: false, error: (error as Error).message }
      }
    })
  )

  logger.info('[IPC] Credential handlers registered')
}
