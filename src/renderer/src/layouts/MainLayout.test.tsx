// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import MainLayout from './MainLayout'
import { WorkspaceProvider } from '../contexts/WorkspaceContext'

function renderLayout(): void {
  render(
    <WorkspaceProvider>
      <MemoryRouter initialEntries={['/clipboard']}>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="clipboard" element={<div>clipboard-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </WorkspaceProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  // useUpdater 在无 updater API 时安全降级
  ;(window as unknown as { api?: unknown }).api = {
    system: {
      getVersion: async () => ({
        success: true,
        data: { version: '3.1.1', builtAt: new Date().toISOString() }
      })
    }
  }
})

describe('MainLayout · personal workbench navigation', () => {
  it('展示工作台入口，并保留原有个人工具', () => {
    renderLayout()

    expect(screen.getByText('剪贴板')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '新会话' })).toHaveAttribute('href', '/sessions')
    expect(screen.getByText('收件箱')).toBeInTheDocument()
    expect(screen.getByText('资源')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '更多' })).toHaveAttribute('href', '/more')
    expect(screen.getByText('设置')).toBeInTheDocument()
    expect(screen.getByText('ClipVault')).toBeInTheDocument()

    expect(screen.queryByText('团队')).not.toBeInTheDocument()
    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })
})
