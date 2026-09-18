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

describe('MainLayout · v3.1 personal nav', () => {
  it('展示暖纸侧栏导航，无团队/AI', () => {
    renderLayout()

    expect(screen.getByText('剪贴板')).toBeInTheDocument()
    expect(screen.getByText('凭证')).toBeInTheDocument()
    expect(screen.getByText('片段')).toBeInTheDocument()
    expect(screen.getByText('概览')).toBeInTheDocument()
    expect(screen.getByText('健康')).toBeInTheDocument()
    expect(screen.getByText('设置')).toBeInTheDocument()
    expect(screen.getByText('ClipVault')).toBeInTheDocument()

    expect(screen.queryByText('团队')).not.toBeInTheDocument()
    expect(screen.queryByText('AI')).not.toBeInTheDocument()
  })
})
