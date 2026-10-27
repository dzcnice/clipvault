import { ipcMain, type BrowserWindow } from 'electron'
import { wrapUnlockedHandler } from './utils'
import { getHostManager } from '../harness-host/manager'
import { outboundRedact } from '../workbench/redaction'
import { searchHistory } from '../harness-host/history'
import type { PromptInput, QuestionAnswer, SessionPermission } from '../../types/session'

export function registerSessionHandlers(window: BrowserWindow): void {
  const manager = getHostManager()
  const off = manager.onChange(event => { if (!window.isDestroyed()) window.webContents.send('session:changed', event) })
  window.once('closed', off)
  ipcMain.handle('session:call', wrapUnlockedHandler(async (_event, method: string, payload: unknown) => {
    try {
      let data: unknown
      switch (method) {
        case 'search': data = await searchHistory(payload as string); break
        case 'list': data = manager.list(); break
        case 'setPlanMode': { const input = payload as { sessionId: string; active: boolean }; await manager.setPlanMode(input.sessionId, input.active); break }
        case 'rename': { const input = payload as { sessionId: string; title: string }; manager.rename(input.sessionId, input.title); break }
        case 'context': data = manager.context(payload as string); break
        case 'deleteSchedule': { const input = payload as { sessionId: string; id: string }; manager.removeSchedule(input.sessionId, input.id); break }
        case 'create': data = await manager.createSession(payload as { projectId: string; title?: string; permission: SessionPermission }); break
        case 'prompt': { const input = payload as PromptInput & { sessionId: string }; data = await manager.prompt(input.sessionId, input); break }
        case 'events': { const input = payload as { sessionId: string; afterSeq: number }; data = manager.events(input.sessionId, input.afterSeq); break }
        case 'stop': await manager.stop(payload as string); break
        case 'prewarm': await manager.prewarm(payload as string); break
        case 'respondApproval': { const input = payload as { id: string; fingerprint: string; allowed: boolean }; manager.respondApproval(input.id, input.fingerprint, input.allowed === true); break }
        case 'answerQuestion': { const input = payload as { id: string; answer: QuestionAnswer }; manager.answerQuestion(input.id, input.answer); break }
        case 'mentionCandidates': data = await manager.mentionCandidates(payload as Parameters<typeof manager.mentionCandidates>[0]); break
        case 'respondProposal': { const input = payload as { sessionId: string; id: string; allowed: boolean }; manager.respondProposal(input.sessionId, input.id, input.allowed === true); break }
        default: throw new Error('未知会话操作')
      }
      return { success: true, data }
    } catch (error) { return { success: false, error: outboundRedact(error instanceof Error ? error.message : '会话操作失败').text } }
  }))
}
