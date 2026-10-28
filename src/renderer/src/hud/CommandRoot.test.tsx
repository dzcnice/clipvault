// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandRoot } from './CommandRoot'
import type { HudCommand } from './types'

const fixtures = vi.hoisted(() => ({ load: vi.fn(), hide: vi.fn(), navigate: vi.fn(), shown: undefined as (() => void) | undefined }))
vi.mock('./registry', () => ({ loadAllCommands: fixtures.load }))

beforeEach(() => {
  fixtures.load.mockReset()
  fixtures.hide.mockReset().mockResolvedValue({ success: true })
  Object.defineProperty(window, 'api', { configurable: true, value: { hud: {
    hide: fixtures.hide,
    navigate: fixtures.navigate,
    onShown: (callback: () => void) => { fixtures.shown = callback; return () => {} },
    mode: vi.fn().mockResolvedValue({ success: true }), onJarvisOpen: () => () => {},
    onHidden: () => () => {}
  } } })
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} })
  Element.prototype.scrollIntoView = vi.fn()
})

describe('M1 HUD search and copy interaction', () => {
  it('opens Jarvis with only a clipboard reference when Tab asks AI', async () => {
    const perform = vi.fn()
    fixtures.load.mockResolvedValue([{ id: 'clip:fixture-id', title: 'private local preview', category: 'clipboard', perform }])
    render(<CommandRoot />); await screen.findByText('private local preview')
    await userEvent.setup().keyboard('{Tab}')
    expect(await screen.findByRole('textbox', { name: '问 Jarvis' })).toBeInTheDocument()
    expect(screen.getByText(/private local preview/)).toBeInTheDocument()
    expect(fixtures.navigate).not.toHaveBeenCalled(); expect(perform).not.toHaveBeenCalled()
  })
  it('offers "ask Jarvis" for the typed text, first when it reads like a question', async () => {
    fixtures.load.mockResolvedValue([{ id: 'clip:a', title: 'some clip', category: 'clipboard', perform: vi.fn() }])
    render(<CommandRoot />); await screen.findByText('some clip')
    await userEvent.setup().type(screen.getByRole('combobox'), '怎么把 json 转成表格')
    const items = await screen.findAllByRole('option')
    expect(items[0]).toHaveTextContent('问 Jarvis：怎么把 json 转成表格')
  })
  it('uses displayed number order and opens resource actions with the keyboard', async () => {
    const paste = vi.fn().mockResolvedValue(undefined), copy = vi.fn().mockResolvedValue(undefined)
    fixtures.load.mockResolvedValue([{ id: 'resource', title: 'fixture-resource', category: 'credential', perform: vi.fn(), actions: [{ id: 'copy', title: '复制密码', category: 'action', perform: copy }] }, { id: 'clip', title: 'fixture-clip', category: 'clipboard', perform: paste }])
    render(<CommandRoot />)
    await screen.findByText('fixture-clip')
    const user = userEvent.setup()
    await user.keyboard('1')
    await waitFor(() => expect(paste).toHaveBeenCalledTimes(1))
    await act(async () => fixtures.shown?.())
    await screen.findByText('fixture-resource')
    await user.keyboard('2')
    expect(await screen.findByText('复制密码')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(copy).toHaveBeenCalledTimes(1))
  })
  it('shows loading without a false empty result, ignores old responses and refreshes on reopen', async () => {
    let resolveOld!: (commands: HudCommand[]) => void
    fixtures.load.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
      .mockResolvedValue([{ id: 'new', title: 'needle-result', category: 'clipboard', perform: vi.fn() }])
    render(<CommandRoot />)
    await waitFor(() => expect(fixtures.load).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent('搜索全部记录')
    expect(screen.queryByText('未找到匹配的命令')).toBeNull()
    const user = userEvent.setup()
    await user.type(screen.getByRole('combobox'), 'needle')
    await screen.findByText('needle-result')
    await act(async () => { resolveOld([{ id: 'old', title: 'old-result', category: 'clipboard', perform: vi.fn() }]) })
    expect(screen.queryByText('old-result')).toBeNull()
    await act(async () => fixtures.shown?.())
    await waitFor(() => expect(fixtures.load).toHaveBeenLastCalledWith(''))
  })

  it('keeps the palette visible on copy failure and allows keyboard retry', async () => {
    const perform = vi.fn().mockRejectedValueOnce(new Error('复制失败 fixture')).mockResolvedValueOnce(undefined)
    fixtures.load.mockResolvedValue([{ id: 'copy', title: 'fixture-copy', category: 'clipboard', perform }])
    render(<CommandRoot />)
    await screen.findByText('fixture-copy')
    const user = userEvent.setup()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败 fixture')
    expect(fixtures.hide).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(fixtures.hide).toHaveBeenCalledTimes(1))
  })
})
