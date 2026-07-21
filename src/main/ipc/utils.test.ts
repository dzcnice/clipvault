/**
 * v2.1 G3-3 · IPC sender 校验单测
 *
 * 覆盖：
 *  - 未注册 webContents → 拒绝 + warn
 *  - 注册后 + URL 前缀通过 → 放行
 *  - URL 前缀不在白名单 → 拒绝（防御纵深）
 *  - wrapUnlockedHandler：已解锁才过
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const warnMock = vi.fn()
vi.mock('../utils/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => warnMock(...args),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

const isUnlockedMock = vi.fn(() => true)
vi.mock('../crypto/vault', () => ({
  isUnlocked: () => isUnlockedMock()
}))

import {
  wrapHandler,
  wrapUnlockedHandler,
  registerTrustedWebContents,
  unregisterTrustedWebContents,
  _clearTrustedWebContentsForTest
} from './utils'
import type { IpcMainInvokeEvent } from 'electron'

function makeEvent(senderId: number, url = 'file:///app/index.html'): IpcMainInvokeEvent {
  return {
    sender: { id: senderId },
    senderFrame: { url }
  } as unknown as IpcMainInvokeEvent
}

describe('wrapHandler · sender 白名单', () => {
  beforeEach(() => {
    _clearTrustedWebContentsForTest()
    warnMock.mockClear()
    isUnlockedMock.mockReturnValue(true)
  })

  it('白名单非空时，未注册的 webContents 被拒绝', async () => {
    // 先注册一个"别的"合法 id，触发严格模式
    registerTrustedWebContents(1)
    const h = wrapHandler(async () => 'ok')
    await expect(h(makeEvent(42))).rejects.toThrow(/Untrusted IPC sender/)
    expect(warnMock).toHaveBeenCalled()
  })

  it('注册后 + URL 前缀合法 → 放行', async () => {
    registerTrustedWebContents(7)
    const h = wrapHandler(async (_e, x: number) => x + 1)
    const res = await h(makeEvent(7), 10)
    expect(res).toBe(11)
  })

  it('注册后但 URL 前缀非法 → 仍拒绝（防御纵深）', async () => {
    registerTrustedWebContents(7)
    const h = wrapHandler(async () => 'ok')
    await expect(
      h(makeEvent(7, 'https://evil.example.com'))
    ).rejects.toThrow(/Untrusted IPC sender/)
  })

  it('unregister 后：若仍有其他注册者则严格模式生效，拒绝该 id', async () => {
    registerTrustedWebContents(9)
    registerTrustedWebContents(10) // 保证集合非空
    unregisterTrustedWebContents(9)
    const h = wrapHandler(async () => 'ok')
    await expect(h(makeEvent(9))).rejects.toThrow(/Untrusted IPC sender/)
  })
})

describe('wrapUnlockedHandler', () => {
  beforeEach(() => {
    _clearTrustedWebContentsForTest()
    warnMock.mockClear()
    registerTrustedWebContents(1)
  })

  it('vault 未解锁 → 报错', async () => {
    isUnlockedMock.mockReturnValue(false)
    const h = wrapUnlockedHandler(async () => 'ok')
    await expect(h(makeEvent(1))).rejects.toThrow(/Vault is locked/)
  })

  it('vault 解锁 + 白名单通过 → 正常执行', async () => {
    isUnlockedMock.mockReturnValue(true)
    const h = wrapUnlockedHandler(async () => 'ok')
    await expect(h(makeEvent(1))).resolves.toBe('ok')
  })
})
