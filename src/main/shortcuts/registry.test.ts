/**
 * shortcuts registry · 个人本地版（无 Vera）
 */

import { describe, it, expect } from 'vitest'
import { buildDefaultCommands } from './registry'

describe('shortcuts/registry', () => {
  it('核心命令齐全，且不含 vera', () => {
    const cmds = buildDefaultCommands(() => null)
    const ids = cmds.map((c) => c.id).sort()
    expect(ids).toContain('window.toggle')
    expect(ids).toContain('search.focus')
    expect(ids).toContain('credential.new')
    expect(ids).toContain('clipboard.pasteRecent')
    expect(ids).toContain('hud.toggle')
    expect(ids).not.toContain('vera.openDrawer')
  })

  it('hud.toggle 为占位 no-op 条目', () => {
    const cmds = buildDefaultCommands(() => null)
    const hud = cmds.find((c) => c.id === 'hud.toggle')
    expect(hud).toBeDefined()
    expect(hud?.defaultAccelerator).toBe('Alt+Space')
    expect(typeof hud?.handler).toBe('function')
  })
})
