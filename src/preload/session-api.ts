import { ipcRenderer } from 'electron'
import type { SessionAPI } from '../types/session'

async function call<T>(method: string, payload?: unknown): Promise<T> {
  const response = await ipcRenderer.invoke('session:call', method, payload)
  if (!response?.success) throw new Error(response?.error ?? '会话操作失败')
  return response.data as T
}
export const sessionAPI: SessionAPI = {
  search: query => call('search', query),
  setPlanMode: input => call('setPlanMode', input),
  rename: input => call('rename', input), context: id => call('context', id), deleteSchedule: input => call('deleteSchedule', input), setFlags: input => call('setFlags', input), remove: id => call('remove', id),
  list: () => call('list'), create: input => call('create', input), prompt: input => call('prompt', input),
  events: input => call('events', input), stop: id => call('stop', id), prewarm: id => call('prewarm', id),
  respondApproval: input => call('respondApproval', input), answerQuestion: input => call('answerQuestion', input),
  mentionCandidates: input => call('mentionCandidates', input), respondProposal: input => call('respondProposal', input),
  onChanged: callback => {
    const listener = (_event: unknown, value: { sessionId: string; seq: number }): void => callback(value)
    ipcRenderer.on('session:changed', listener)
    return () => { ipcRenderer.removeListener('session:changed', listener) }
  }
}
