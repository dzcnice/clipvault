/**
 * HUD 命令注册中心测试（v2.0 Sprint 6）
 */

import { describe, it, expect } from 'vitest'
import { loadAllCommands, loadAllCommandsSync } from './registry'

describe('hud/registry', () => {
  it('loadAllCommandsSync 返回非空命令集', () => {
    const cmds = loadAllCommandsSync()
    expect(cmds.length).toBeGreaterThanOrEqual(10)
  })

  it('loadAllCommands 返回 Promise 且包含 nav/search/action 类别', async () => {
    const cmds = await loadAllCommands()
    const cats = new Set(cmds.map((c) => c.category))
    expect(cats.has('navigate')).toBe(true)
    expect(cats.has('search')).toBe(true)
    expect(cats.has('action')).toBe(true)
  })

  it('每条命令都有唯一 id', async () => {
    const cmds = await loadAllCommands()
    const ids = cmds.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('基础命令集 >= 10 条', async () => {
    const cmds = await loadAllCommands()
    expect(cmds.length).toBeGreaterThanOrEqual(10)
  })
})
