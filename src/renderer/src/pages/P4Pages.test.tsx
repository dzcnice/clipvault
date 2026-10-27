// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SessionHistoryPage from './SessionHistoryPage'
import LegacyTasksPage from './LegacyTasksPage'
import SessionContextPanel from '../components/SessionContextPanel'

const api = { search: vi.fn(), quickIndex: vi.fn(), task: vi.fn(), start: vi.fn(), prompt: vi.fn() }
beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(window, 'sessionAPI', { configurable: true, value: api })
  Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } })
})
afterEach(cleanup)
describe('P4 history and context interactions', () => {
  it('searches only on submission and exposes a keyboard-accessible result link', async () => {
    api.search.mockResolvedValue({ items: [{ id: 'saved-session', title: '合成会话', snippet: '修复数据库连接' }], searched: 3, total: 5 })
    render(<MemoryRouter><SessionHistoryPage /></MemoryRouter>)
    const user = userEvent.setup()
    expect(screen.getByRole('button', { name: '搜索' })).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: '搜索会话' }), '数据库')
    expect(api.search).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    const link = await screen.findByRole('link', { name: /合成会话/ })
    expect(link).toHaveAttribute('href', '/sessions/saved-session')
    expect(screen.getByText(/已检索 3\/5/)).toBeInTheDocument()
    expect(api.prompt).not.toHaveBeenCalled()
  })
  it('shows failure and empty states, then permits another keyboard search', async () => {
    api.search.mockRejectedValueOnce(new Error('合成索引失败')).mockResolvedValueOnce({ items: [], searched: 0, total: 0 })
    render(<MemoryRouter><SessionHistoryPage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: '搜索会话' }), '不存在{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('合成索引失败')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText(/没有找到匹配会话/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('opens a legacy record with input, run and full changes but no execution action', async () => {
    const task = { id: 'legacy', title: '旧任务合成记录', prompt: '原始任务输入', acceptance: '原始验收要求', updatedAt: 1 }
    api.quickIndex.mockResolvedValue({ success: true, data: { tasks: [task] } })
    api.task.mockResolvedValue({ success: true, data: { task, runs: [{ id: 'old-run', startedAt: 1, summary: '合成历史结果' }], events: [{ id: 'old-event', text: '合成过程记录' }], changes: [{ id: 'old-change', path: 'example.ts', before: 'before', after: 'after' }] } })
    render(<MemoryRouter><LegacyTasksPage /></MemoryRouter>)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /旧任务合成记录/ }))
    expect(await screen.findByText('原始任务输入')).toBeInTheDocument()
    expect(screen.getByText('合成历史结果')).toBeInTheDocument()
    await user.click(screen.getByText('example.ts'))
    expect(screen.getByLabelText('完整修改对比')).toHaveTextContent('before')
    expect(screen.getByLabelText('完整修改对比')).toHaveTextContent('after')
    expect(screen.queryByRole('button', { name: /运行|继续|接受|批准/ })).not.toBeInTheDocument()
    expect(api.start).not.toHaveBeenCalled()
  })
  it('renders legacy loading failure without attempting a run', async () => {
    api.quickIndex.mockRejectedValue(new Error('fixture failure'))
    render(<MemoryRouter><LegacyTasksPage /></MemoryRouter>)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('历史列表读取失败')
    expect(api.start).not.toHaveBeenCalled()
  })
  it('shows goal, todos, readonly child result and compaction and can collapse by keyboard', async () => {
    const onClose = vi.fn()
    render(<SessionContextPanel context={{ mentions: [], attachments: [], changes: [], model: 'fixture', permission: 'confirm', planMode: true,
      goal: { objective: '合成持续目标', phase: 'active', roundsStarted: 1, maxGoalRounds: 3 }, todos: [{ content: '合成待办', status: 'completed' }],
      children: [{ id: 'child', title: '合成只读分析', state: 'completed', result: '合成分析结论' }], compactions: 1 }} onClose={onClose} />)
    expect(screen.getByText('合成持续目标')).toBeInTheDocument()
    expect(screen.getByLabelText('已完成')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByText(/合成只读分析/))
    expect(screen.getByText('合成分析结论')).toBeVisible()
    expect(screen.getByText(/原事件仍加密保存/)).toBeInTheDocument()
    screen.getByRole('button', { name: '关闭上下文' }).focus(); await user.keyboard('{Enter}')
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
