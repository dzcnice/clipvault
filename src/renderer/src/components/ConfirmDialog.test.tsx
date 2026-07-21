// @vitest-environment jsdom
/**
 * ConfirmDialog 单元测试
 */
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialogProvider, useConfirm } from './ConfirmDialog'

function Harness({
  onResult,
  variant,
  confirmText,
  cancelText
}: {
  onResult: (v: boolean) => void
  variant?: 'default' | 'danger'
  confirmText?: string
  cancelText?: string
}): JSX.Element {
  const confirm = useConfirm()
  return (
    <button
      onClick={async () => {
        const r = await confirm({
          title: '危险操作',
          message: '真的要继续吗？',
          variant,
          confirmText,
          cancelText
        })
        onResult(r)
      }}
    >
      触发
    </button>
  )
}

describe('ConfirmDialog', () => {
  it('useConfirm 返回 Promise，点击确认 -> true', async () => {
    const user = userEvent.setup()
    let resolved: boolean | null = null
    render(
      <ConfirmDialogProvider>
        <Harness onResult={(r) => (resolved = r)} />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(resolved).toBe(true)
  })

  it('点击取消 -> false', async () => {
    const user = userEvent.setup()
    let resolved: boolean | null = null
    render(
      <ConfirmDialogProvider>
        <Harness onResult={(r) => (resolved = r)} />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(resolved).toBe(false)
  })

  it('variant=danger 时确认按钮带 glass-btn-danger 样式', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialogProvider>
        <Harness onResult={() => {}} variant="danger" />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const btn = screen.getByRole('button', { name: '确认' })
    expect(btn.className).toContain('glass-btn-danger')
  })

  it('variant 默认 -> glass-btn-primary', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialogProvider>
        <Harness onResult={() => {}} />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const btn = screen.getByRole('button', { name: '确认' })
    expect(btn.className).toContain('glass-btn-primary')
  })

  it('渲染自定义 confirmText / cancelText', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialogProvider>
        <Harness
          onResult={() => {}}
          confirmText="删除"
          cancelText="放弃"
        />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '放弃' })).toBeInTheDocument()
  })

  it('Esc 关闭并返回 false', async () => {
    const user = userEvent.setup()
    let resolved: boolean | null = null
    render(
      <ConfirmDialogProvider>
        <Harness onResult={(r) => (resolved = r)} />
      </ConfirmDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    await act(async () => {
      await user.keyboard('{Escape}')
    })
    expect(resolved).toBe(false)
  })
})
