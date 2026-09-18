// @vitest-environment jsdom
/**
 * PasswordGenerator 单元测试（三 tab 切换 / 生成 IPC mock）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordGenerator } from './PasswordGenerator'

function setupApi(): {
  generateStrong: ReturnType<typeof vi.fn>
  generatePassphrase: ReturnType<typeof vi.fn>
  generatePIN: ReturnType<typeof vi.fn>
  evaluateStrength: ReturnType<typeof vi.fn>
} {
  const api = {
    generateStrong: vi.fn(async () => ({ success: true, data: 'Str0ngPass!x' })),
    generatePassphrase: vi.fn(async () => ({ success: true, data: 'Apple-Tree-5-Blue' })),
    generatePIN: vi.fn(async () => ({ success: true, data: '482917' })),
    evaluateStrength: vi.fn(async () => ({ success: true, data: { score: 3, feedback: [] } }))
  }
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    password: api
  }
  return api
}

describe('PasswordGenerator', () => {
  beforeEach(() => {
    setupApi()
  })

  it('默认渲染三个 tab 按钮', () => {
    render(<PasswordGenerator />)
    expect(screen.getByRole('button', { name: '强密码' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '口令短语' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PIN' })).toBeInTheDocument()
  })

  it('切换到 passphrase tab 后显示词数输入', async () => {
    const user = userEvent.setup()
    render(<PasswordGenerator />)
    await user.click(screen.getByRole('button', { name: '口令短语' }))
    expect(screen.getByText(/词数/)).toBeInTheDocument()
  })

  it('切换到 pin tab 后显示 PIN 长度', async () => {
    const user = userEvent.setup()
    render(<PasswordGenerator />)
    await user.click(screen.getByRole('button', { name: 'PIN' }))
    expect(screen.getByText(/PIN 长度/)).toBeInTheDocument()
  })

  it('点击"生成"触发 strong IPC 并透传 onGenerated', async () => {
    const api = setupApi()
    const onGenerated = vi.fn()
    const user = userEvent.setup()
    render(<PasswordGenerator onGenerated={onGenerated} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '生成' }))
    })
    expect(api.generateStrong).toHaveBeenCalledTimes(1)
    expect(onGenerated).toHaveBeenCalledWith('Str0ngPass!x')
  })

  it('passphrase tab 生成时调用 generatePassphrase', async () => {
    const api = setupApi()
    const user = userEvent.setup()
    render(<PasswordGenerator />)
    await user.click(screen.getByRole('button', { name: '口令短语' }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '生成' }))
    })
    expect(api.generatePassphrase).toHaveBeenCalledTimes(1)
    expect(api.generateStrong).not.toHaveBeenCalled()
  })

  it('pin tab 生成调用 generatePIN 传入长度', async () => {
    const api = setupApi()
    const user = userEvent.setup()
    render(<PasswordGenerator />)
    await user.click(screen.getByRole('button', { name: 'PIN' }))
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '生成' }))
    })
    expect(api.generatePIN).toHaveBeenCalledWith(6)
  })

  it('生成失败（API 未挂载）时显示错误', async () => {
    (window as unknown as { api: unknown }).api = {}
    const user = userEvent.setup()
    render(<PasswordGenerator />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: '生成' }))
    })
    expect(screen.getByText(/API 未挂载/)).toBeInTheDocument()
  })
})
