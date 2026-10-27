// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ClipboardOrganize from './ClipboardOrganize'
const api = { prepareOrganize: vi.fn(), organize: vi.fn() }, ids = ['one', 'two', 'secret']
beforeEach(() => {
  vi.resetAllMocks()
  api.prepareOrganize.mockResolvedValue({ success: true, data: { id: 'review', entries: [{ id: 'one', preview: 'const a = 1;', sensitive: false }, { id: 'two', preview: 'const b = 2;', sensitive: false }, { id: 'secret', preview: '[已隐藏敏感字段]', sensitive: true }] } })
  api.organize.mockResolvedValue({ success: true, data: { count: 1, suggestions: 0 } })
  Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } })
})
it('prepares locally, excludes secrets by default, and sends exactly the confirmed IDs', async () => {
  render(<MemoryRouter><ClipboardOrganize ids={ids} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>)
  const boxes = await screen.findAllByRole('checkbox')
  expect(boxes[0]).toBeChecked(); expect(boxes[1]).toBeChecked(); expect(boxes[2]).not.toBeChecked()
  expect(api.organize).not.toHaveBeenCalled()
  const user = userEvent.setup(); await user.click(boxes[1]!)
  await user.click(screen.getByRole('button', { name: '确认发送 1 条' }))
  await waitFor(() => expect(api.organize).toHaveBeenCalledWith('review', ['one']))
  expect(await screen.findByRole('status')).toHaveTextContent('已整理 1 条')
})
it('keeps the original selection recoverable with a fresh review after a model failure', async () => {
  api.organize.mockResolvedValue({ success: false, error: '模型暂不可用' })
  render(<MemoryRouter><ClipboardOrganize ids={ids} close={vi.fn()} saved={vi.fn()} /></MemoryRouter>)
  const user = userEvent.setup(); await user.click(await screen.findByRole('button', { name: '确认发送 2 条' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('模型暂不可用')
  await user.click(screen.getByRole('button', { name: '重新准备预览' }))
  await waitFor(() => expect(api.prepareOrganize).toHaveBeenCalledTimes(2))
  expect(api.organize).toHaveBeenCalledTimes(1)
})
