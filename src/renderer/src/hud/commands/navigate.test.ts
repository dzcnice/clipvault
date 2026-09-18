/**
 * 导航命令测试 · v3 个人版
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildNavigateCommands } from './navigate'

describe('hud/commands/navigate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('返回至少 5 条导航 + 2 条 action 命令，且无团队入口', () => {
    const cmds = buildNavigateCommands()
    const nav = cmds.filter((c) => c.category === 'navigate')
    const action = cmds.filter((c) => c.category === 'action')
    expect(nav.length).toBeGreaterThanOrEqual(5)
    expect(action.length).toBeGreaterThanOrEqual(2)
    expect(cmds.find((c) => c.id === 'nav.team')).toBeUndefined()
    expect(cmds.find((c) => c.id === 'nav.snippets')).toBeDefined()
    expect(cmds.find((c) => c.id === 'nav.health')).toBeDefined()
  })

  it('nav.dashboard 调用 api.hud.navigate("/dashboard")', async () => {
    const navigate = vi.fn().mockResolvedValue({ success: true })
    ;(globalThis as unknown as { window: unknown }).window = {
      api: { hud: { navigate, hide: vi.fn() } }
    }
    const cmd = buildNavigateCommands().find((c) => c.id === 'nav.dashboard')
    expect(cmd).toBeDefined()
    await cmd!.perform()
    expect(navigate).toHaveBeenCalledWith('/dashboard')
  })

  it('action.toggle-theme 会切换 data-theme', async () => {
    const el = {
      getAttribute: vi.fn().mockReturnValue('light'),
      setAttribute: vi.fn(),
      style: {}
    } as unknown as HTMLElement
    ;(globalThis as unknown as { document: unknown }).document = { documentElement: el }
    ;(globalThis as unknown as { window: unknown }).window = {
      api: {
        hud: { hide: vi.fn().mockResolvedValue({ success: true }), navigate: vi.fn() }
      },
      localStorage: { setItem: vi.fn() }
    }
    const cmd = buildNavigateCommands().find((c) => c.id === 'action.toggle-theme')
    await cmd!.perform()
    expect(el.setAttribute).toHaveBeenCalledWith('data-theme', 'dark')
  })

  it('action.ensure-open 调用 vault.ensureOpen', async () => {
    const ensureOpen = vi.fn().mockResolvedValue({ success: true })
    const hide = vi.fn().mockResolvedValue({ success: true })
    ;(globalThis as unknown as { window: unknown }).window = {
      api: {
        vault: { ensureOpen },
        hud: { hide, navigate: vi.fn() }
      }
    }
    const cmd = buildNavigateCommands().find((c) => c.id === 'action.ensure-open')
    expect(cmd).toBeDefined()
    await cmd!.perform()
    expect(ensureOpen).toHaveBeenCalled()
    expect(hide).toHaveBeenCalled()
  })
})
