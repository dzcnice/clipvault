// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JarvisView from './JarvisView'
import { looksLikeQuestion } from './CommandRoot'

const session = { id: 'jarvis-session', projectId: 'quick-ask', title: '随手问', state: 'idle', permission: 'confirm', directory: '/q', createdAt: 1, updatedAt: 1, pendingApprovals: 0, pendingQuestions: 0 }
const api = { list: vi.fn(), create: vi.fn(), prompt: vi.fn(), events: vi.fn(), onChanged: vi.fn(), respondApproval: vi.fn(), mentionCandidates: vi.fn() }
const hud = { mode: vi.fn(), navigate: vi.fn(), pasteAnswer: vi.fn(), toggle: vi.fn() }
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear()
  api.list.mockResolvedValue([session]); api.create.mockResolvedValue(session); api.prompt.mockResolvedValue({ messageId: 'm' }); api.events.mockResolvedValue([]); api.onChanged.mockReturnValue(() => {})
  api.mentionCandidates.mockResolvedValue([{ kind: 'clipboard', id: 'clip-latest', label: 'hello world' }])
  hud.mode.mockResolvedValue({ success: true }); hud.pasteAnswer.mockResolvedValue({ success: true }); api.respondApproval.mockResolvedValue(undefined)
  Object.defineProperty(window, 'sessionAPI', { configurable: true, value: api })
  Object.defineProperty(window, 'api', { configurable: true, value: { hud, clipboard: { capture: vi.fn(), savePastedImage: vi.fn(), getThumbnail: vi.fn().mockResolvedValue({ success: false }) } } })
})

describe('Jarvis floating panel', () => {
  it('asks in the quick-ask project, then reuses the same session for the follow-up', async () => {
    render(<JarvisView initial={{}} onExit={() => {}} />)
    const user = userEvent.setup(), box = screen.getByRole('textbox', { name: '问 Jarvis' })
    await user.type(box, '今天天气怎么样{Enter}')
    await waitFor(() => expect(api.prompt).toHaveBeenCalledWith({ sessionId: 'jarvis-session', text: '今天天气怎么样' }))
    expect(api.create).toHaveBeenCalledWith({ projectId: 'quick-ask', permission: 'confirm' })
    expect(hud.mode).toHaveBeenCalledWith('jarvis')
    await user.type(box, '那明天呢{Enter}')
    await waitFor(() => expect(api.prompt).toHaveBeenCalledTimes(2))
    expect(api.create).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('cv.jarvis.session')!).id).toBe('jarvis-session')
  })
  it('expands a slash command into a prompt and attaches the latest clipboard item', async () => {
    render(<JarvisView initial={{}} onExit={() => {}} />)
    await userEvent.setup().type(screen.getByRole('textbox', { name: '问 Jarvis' }), '/翻译 用口语{Enter}')
    await waitFor(() => expect(api.prompt).toHaveBeenCalled())
    const input = api.prompt.mock.calls[0]![0]
    expect(input.text).toContain('翻译'); expect(input.text).toContain('补充要求：用口语')
    expect(input.mentions).toEqual([{ kind: 'clipboard', id: 'clip-latest', label: 'hello world' }])
  })
  it('shows the one-time send confirmation, and pastes the finished answer back to the foreground app', async () => {
    let events: unknown[] = [{ seq: 1, type: 'user_message', text: 'hi', at: 1 }, { seq: 2, type: 'approval', at: 2, approval: { id: 'ap', fingerprint: 'fp', operation: '发送消息并使用项目上下文', target: 'https://caowo.fun/v1', description: '', expiresAt: Date.now() + 60_000, taskId: 'jarvis-session', runId: 'r', state: 'pending' } }]
    api.events.mockImplementation(async () => events)
    api.list.mockResolvedValue([{ ...session, state: 'waiting_user' }])
    render(<JarvisView initial={{ text: 'hi', autoSend: true }} onExit={() => {}} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /允许/ }))
    expect(api.respondApproval).toHaveBeenCalledWith({ id: 'ap', fingerprint: 'fp', allowed: true })
    events = [{ seq: 1, type: 'user_message', text: 'hi', at: 1 }, { seq: 3, type: 'assistant_message', text: 'HELLO_ANSWER', at: 3 }]
    api.list.mockResolvedValue([session])
    await user.click(await screen.findByRole('button', { name: /粘贴到前台/ }))
    expect(hud.pasteAnswer).toHaveBeenCalledWith('HELLO_ANSWER')
  })
  it('recognises question-like input', () => {
    for (const text of ['怎么办？', '为什么会报错', 'how to parse json', '/翻译', 'this is a much longer sentence here']) expect(looksLikeQuestion(text), text).toBe(true)
    for (const text of ['github', 'token', 'invoice 2026']) expect(looksLikeQuestion(text), text).toBe(false)
  })
})
