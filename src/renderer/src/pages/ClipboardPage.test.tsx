// @vitest-environment jsdom
/**
 * ClipboardPage 渲染 · 对齐当前 UI 文案
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ClipboardItem } from '@/types'
import { WorkspaceProvider } from '../contexts/WorkspaceContext'
import ClipboardPage from './ClipboardPage'

function renderPage(): ReturnType<typeof render> {
  return render(
    <WorkspaceProvider>
      <ClipboardPage />
    </WorkspaceProvider>
  )
}

function makeItem(id: string): ClipboardItem {
  return {
    id,
    type: 'text',
    content: id,
    preview: id,
    hash: 'h-' + id,
    size: 10,
    isPinned: false,
    isSnippet: false,
    tags: [],
    useCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  } as ClipboardItem
}

interface Pending {
  resolve: (items: ClipboardItem[], total: number) => void
}

function setupApi(): { calls: Pending[] } {
  const calls: Pending[] = []
  ;(window as unknown as { api: unknown }).api = {
    clipboard: {
      getHistory: vi.fn(
        () =>
          new Promise((resolve) => {
            calls.push({
              resolve: (items, total) =>
                resolve({ success: true, data: { items, total } })
            })
          })
      ),
      onNewItem: vi.fn(() => () => {}),
      deleteItem: vi.fn(),
      pinItem: vi.fn(),
      copyItem: vi.fn(),
      copyPath: vi.fn(),
      clearHistory: vi.fn(),
      getSnippets: vi.fn(),
      createSnippet: vi.fn()
    },
    prefs: {
      get: vi.fn(async () => ({
        success: true,
        data: { imagePasteMode: 'both' as const }
      })),
      set: vi.fn(async () => ({
        success: true,
        data: { imagePasteMode: 'both' as const }
      }))
    },
    events: {
      on: vi.fn(() => () => {})
    }
  }
  return { calls }
}

describe('ClipboardPage - render branch priority', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('首次加载后显示列表与计数', async () => {
    const { calls } = setupApi()
    renderPage()

    expect(screen.getByText(/加载中/)).toBeInTheDocument()

    await act(async () => {
      calls[0].resolve([makeItem('hello'), makeItem('world')], 2)
    })
    await waitFor(() => {
      expect(screen.queryByText(/加载中/)).not.toBeInTheDocument()
    })
    expect(screen.getByText(/2\s*条/)).toBeInTheDocument()
  })

  it('搜索触发二次请求后更新列表', async () => {
    const { calls } = setupApi()
    const user = userEvent.setup()
    renderPage()

    await act(async () => {
      calls[0].resolve([makeItem('hello'), makeItem('world')], 2)
    })
    await waitFor(() => {
      expect(screen.getByText(/2\s*条/)).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('搜索历史内容…')
    await user.type(searchInput, 'hel')

    await waitFor(() => {
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    await act(async () => {
      calls[calls.length - 1].resolve([makeItem('hello')], 1)
    })

    await waitFor(() => {
      expect(screen.getByText(/1\s*条/)).toBeInTheDocument()
    })
  })
})
