/**
 * Workspace IPC 单元测试 · v3.0 个人本地版
 *
 * 个人版强制 personal 工作区；push-to-team 返回明确错误。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

interface FakeHandler {
  (event: unknown, ...args: unknown[]): Promise<unknown>
}

const handlers = new Map<string, FakeHandler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: FakeHandler) => {
      handlers.set(channel, handler)
    }
  },
  BrowserWindow: class {
    isDestroyed() {
      return false
    }
    webContents = { send: vi.fn() }
  },
  clipboard: {
    writeText: vi.fn(),
    readText: () => '',
    readHTML: () => '',
    availableFormats: () => [],
    readImage: () => ({ isEmpty: () => true, toDataURL: () => '' })
  }
}))

vi.mock('../crypto/vault', () => ({
  isUnlocked: () => true
}))

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../db/connection', () => ({
  getDatabase: () => ({
    prepare() {
      return { get: () => undefined, run: () => ({ changes: 0 }) }
    }
  }),
  transaction: (fn: () => unknown) => fn()
}))

const createCredentialSpy = vi.fn()
const listCredentialsSpy = vi.fn()
vi.mock('../../db/credential-store', () => ({
  createCredential: (input: unknown, workspace: unknown) => {
    createCredentialSpy(input, workspace)
    return {
      id: 'cred-x',
      name: 'x',
      type: 'apikey',
      value: 'v',
      tags: [],
      metadata: {},
      createdAt: 0,
      updatedAt: 0,
      useCount: 0,
      isFavorite: false
    }
  },
  listCredentials: (
    filter: unknown,
    sortBy: unknown,
    sortDir: unknown,
    limit: unknown,
    offset: unknown,
    workspace: unknown
  ) => {
    listCredentialsSpy(filter, sortBy, sortDir, limit, offset, workspace)
    return { items: [], total: 0 }
  },
  updateCredential: vi.fn(),
  deleteCredential: vi.fn(() => true),
  getCredentialById: vi.fn(),
  recordCredentialUsage: vi.fn()
}))

const listHistorySpy = vi.fn()
const getSnippetsSpy = vi.fn()
const createSnippetSpy = vi.fn()
vi.mock('../../db/clipboard-store', () => ({
  addClipboardItem: vi.fn(async () => null),
  listClipboardHistory: (
    filter: unknown,
    limit: unknown,
    offset: unknown,
    workspace: unknown
  ) => {
    listHistorySpy(filter, limit, offset, workspace)
    return { items: [], total: 0 }
  },
  getSnippets: (workspace: unknown) => {
    getSnippetsSpy(workspace)
    return []
  },
  createSnippet: (input: unknown, workspace: unknown) => {
    createSnippetSpy(input, workspace)
    return {
      id: 's1',
      type: 'text',
      preview: '',
      hash: '',
      size: 0,
      isPinned: false,
      isSnippet: true,
      tags: [],
      createdAt: 0,
      useCount: 0
    }
  },
  updateSnippet: vi.fn(),
  deleteClipboardItem: vi.fn(() => true),
  clearClipboardHistory: vi.fn(() => 0),
  toggleClipboardPin: vi.fn(() => true),
  getClipboardItemById: vi.fn(),
  recordClipboardUsage: vi.fn()
}))

vi.mock('../clipboard/monitor', async () => {
  const { EventEmitter } = await import('events')
  return {
    ClipboardChangeEvent: class {},
    getClipboardMonitor: () =>
      Object.assign(new EventEmitter(), {
        start: vi.fn(),
        stop: vi.fn(),
        writeText: vi.fn(),
        writeImage: vi.fn(),
        getStatus: () => ({ isRunning: false, interval: 500 })
      })
  }
})

vi.mock('../clipboard/auto-clear', () => ({
  clipboardAutoClear: { schedule: vi.fn() }
}))

const fakeEvent = { senderFrame: { url: 'file:///fake' } } as unknown

describe('workspace IPC · personal-only', () => {
  beforeEach(async () => {
    handlers.clear()
    createCredentialSpy.mockClear()
    listCredentialsSpy.mockClear()
    listHistorySpy.mockClear()
    getSnippetsSpy.mockClear()
    createSnippetSpy.mockClear()

    const credHandlers = await import('./credential-handlers')
    credHandlers.registerCredentialHandlers()
    const clipHandlers = await import('./clipboard-handlers')
    clipHandlers.registerClipboardHandlers({
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    } as never)
  })

  it('credential:list 缺省归一化为 personal', async () => {
    const handler = handlers.get('credential:list')!
    await handler(fakeEvent, {})
    expect(listCredentialsSpy).toHaveBeenLastCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'personal'
    )
  })

  it('clipboard:getHistory 强制 personal（忽略 team 入参）', async () => {
    const handler = handlers.get('clipboard:getHistory')!
    await handler(fakeEvent, { workspace: 'team', limit: 5 })
    expect(listHistorySpy).toHaveBeenCalledWith(undefined, 5, undefined, 'personal')
  })

  it('clipboard:getSnippets 强制 personal', async () => {
    const handler = handlers.get('clipboard:getSnippets')!
    await handler(fakeEvent, { workspace: 'team' })
    expect(getSnippetsSpy).toHaveBeenCalledWith('personal')
  })

  it('clipboard:createSnippet 强制 personal', async () => {
    const handler = handlers.get('clipboard:createSnippet')!
    await handler(fakeEvent, { content: 'hi', name: 'n', workspace: 'team' })
    expect(createSnippetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'n' }),
      'personal'
    )
  })

  it('clipboard:push-to-team 返回个人版不支持', async () => {
    const handler = handlers.get('clipboard:push-to-team')!
    const res = (await handler(fakeEvent, 'any')) as {
      success: boolean
      error?: string
    }
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/个人本地版|不支持/)
  })
})
