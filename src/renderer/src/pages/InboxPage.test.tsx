// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import InboxPage from './InboxPage'
import { ConfirmDialogProvider } from '../components/ConfirmDialog'

const api = { inbox: vi.fn(), inboxStart: vi.fn(), quickIndex: vi.fn(), onInboxChanged: vi.fn(() => () => {}), muteInbox: vi.fn(), settleInbox: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  api.inbox.mockResolvedValue({ success: true, data: [{ id: 'suggestion', type: 'error_fix', sourceId: 'clip', projectId: 'project', state: 'open', createdAt: Date.now(), data: { title: '本地报错建议', reason: '堆栈匹配', prompt: '定位并修复这段报错', ids: ['clip'] } }] })
  api.quickIndex.mockResolvedValue({ success: true, data: { projects: [{ id: 'project', name: '测试项目' }] } }); api.inboxStart.mockResolvedValue({ success: true, data: 'created' })
  api.muteInbox.mockResolvedValue({ success: true }); api.settleInbox.mockResolvedValue({ success: true })
  Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } })
})
function mount(): void { render(<MemoryRouter initialEntries={['/inbox']}><ConfirmDialogProvider><Routes><Route path="/inbox" element={<InboxPage />} /><Route path="/sessions/:id" element={<p>审批会话</p>} /></Routes></ConfirmDialogProvider></MemoryRouter>) }
it('sends only after the user edits and starts the suggestion, then opens the approval conversation', async () => {
  mount(); const user = userEvent.setup()
  expect(screen.getByText('本地识别，未调用模型')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: /本地报错建议/ }))
  expect(api.inboxStart).not.toHaveBeenCalled()
  const prompt = screen.getByRole('textbox', { name: '首句' }); await user.clear(prompt); await user.type(prompt, '只分析原因，先别改文件')
  await user.click(screen.getByRole('button', { name: '在 测试项目 开会话' }))
  expect(api.inboxStart).toHaveBeenCalledWith('suggestion', '只分析原因，先别改文件')
  expect(await screen.findByText('审批会话')).toBeInTheDocument()
})
it('offers a recoverable load error and stores the muted rule only on user choice', async () => {
  api.inbox.mockResolvedValueOnce({ success: false, error: '本地读取失败' })
  mount(); const user = userEvent.setup(); expect(await screen.findByRole('alert')).toHaveTextContent('本地读取失败')
  await user.click(screen.getByRole('button', { name: '重试' })); await user.click(await screen.findByRole('button', { name: /本地报错建议/ }))
  await user.click(screen.getByRole('button', { name: '不再提示此类' }))
  await waitFor(() => expect(api.muteInbox).toHaveBeenCalledWith('error_fix', true))
  expect(api.settleInbox).toHaveBeenCalledWith('suggestion', 'dismissed')
})
