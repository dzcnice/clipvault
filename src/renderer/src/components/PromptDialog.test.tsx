// @vitest-environment jsdom
/**
 * PromptDialog 单元测试
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PromptDialogProvider, usePromptDialog } from './PromptDialog'

function Harness({
  onResult,
  inputType,
  placeholder,
  defaultValue
}: {
  onResult: (v: string | null) => void
  inputType?: 'text' | 'password'
  placeholder?: string
  defaultValue?: string
}): JSX.Element {
  const prompt = usePromptDialog()
  return (
    <button
      onClick={async () => {
        const r = await prompt({
          title: '输入',
          message: '请输入',
          inputType,
          placeholder,
          defaultValue
        })
        onResult(r)
      }}
    >
      触发
    </button>
  )
}

describe('PromptDialog', () => {
  it("inputType='password' 时 input type=password", async () => {
    const user = userEvent.setup()
    render(
      <PromptDialogProvider>
        <Harness onResult={() => {}} inputType="password" />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const dialog = screen.getByRole('dialog')
    const input = dialog.querySelector('input')!
    expect(input.type).toBe('password')
  })

  it('默认 inputType=text', async () => {
    const user = userEvent.setup()
    render(
      <PromptDialogProvider>
        <Harness onResult={() => {}} />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const input = screen.getByRole('dialog').querySelector('input')!
    expect(input.type).toBe('text')
  })

  it('输入后 Confirm 返回字符串', async () => {
    const user = userEvent.setup()
    let resolved: string | null = 'pristine'
    render(
      <PromptDialogProvider>
        <Harness onResult={(r) => (resolved = r)} />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const input = screen.getByRole('dialog').querySelector('input')!
    await user.type(input, 'hello')
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(resolved).toBe('hello')
  })

  it('Cancel 返回 null', async () => {
    const user = userEvent.setup()
    let resolved: string | null = 'pristine'
    render(
      <PromptDialogProvider>
        <Harness onResult={(r) => (resolved = r)} />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(resolved).toBeNull()
  })

  it('placeholder 渲染', async () => {
    const user = userEvent.setup()
    render(
      <PromptDialogProvider>
        <Harness onResult={() => {}} placeholder="请输入密码" />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    expect(
      screen.getByPlaceholderText('请输入密码')
    ).toBeInTheDocument()
  })

  it('defaultValue 作为初始值', async () => {
    const user = userEvent.setup()
    let resolved: string | null = null
    render(
      <PromptDialogProvider>
        <Harness onResult={(r) => (resolved = r)} defaultValue="init" />
      </PromptDialogProvider>
    )
    await user.click(screen.getByText('触发'))
    const input = screen.getByRole('dialog').querySelector('input')!
    expect(input.value).toBe('init')
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(resolved).toBe('init')
  })
})
