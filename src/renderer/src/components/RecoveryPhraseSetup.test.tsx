// @vitest-environment jsdom
/**
 * RecoveryPhraseSetup 状态机测试（ρ2 · P0-R4）
 *
 * 重点覆盖：
 *  1. 首次生成成功 → 展示 24 词
 *  2. 生成失败（API 返回空）→ 显示 error，按钮可重试
 *  3. 生成中按钮 disable（避免并发请求覆盖 hash）
 *  4. 已 saved 后再点"继续"不再触发 onComplete
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryPhraseSetup } from './RecoveryPhraseSetup'

type SetupFn = () => Promise<{ success: boolean; data?: { mnemonic: string[]; success: boolean } }>
type StatusFn = () => Promise<{ success: boolean; data?: { enrolled: boolean } }>

function mountApi(opts: { setup: SetupFn; status: StatusFn }): void {
  (window as unknown as { api: unknown }).api = {
    sprint13: {
      recovery: {
        status: opts.status,
        setup: opts.setup,
        challenge: vi.fn(),
        verify: vi.fn(),
        resetPassword: vi.fn(),
        disable: vi.fn()
      }
    }
  }
}

const WORDS_24 = Array.from({ length: 24 }, (_, i) => `word${i + 1}`)

describe('RecoveryPhraseSetup', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('成功生成后展示 24 词 + 复选框 + 下一步按钮', async () => {
    mountApi({
      setup: vi.fn().mockResolvedValue({
        success: true,
        data: { mnemonic: WORDS_24, success: true }
      }),
      status: vi.fn().mockResolvedValue({
        success: true,
        data: { enrolled: false }
      })
    })
    const user = userEvent.setup()
    render(<RecoveryPhraseSetup />)

    const btn = await screen.findByRole('button', { name: '立即生成' })
    await user.click(btn)

    await waitFor(() => {
      expect(screen.getByText('word1')).toBeInTheDocument()
      expect(screen.getByText('word24')).toBeInTheDocument()
    })
  })

  it('生成失败（返回空短语）显示 error 且允许重试', async () => {
    const setupSpy = vi
      .fn()
      // 第一次返回空（触发 error）
      .mockResolvedValueOnce({
        success: false,
        data: undefined
      })
      // 第二次返回正常（重试成功）
      .mockResolvedValueOnce({
        success: true,
        data: { mnemonic: WORDS_24, success: true }
      })
    mountApi({
      setup: setupSpy,
      status: vi
        .fn()
        .mockResolvedValue({ success: true, data: { enrolled: false } })
    })
    const user = userEvent.setup()
    render(<RecoveryPhraseSetup />)

    await user.click(await screen.findByRole('button', { name: '立即生成' }))

    // 第一次失败：显示错误
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('生成失败')
    })
    // 按钮文案变成"重试生成"
    const retry = await screen.findByRole('button', { name: '重试生成' })
    await user.click(retry)
    // 第二次成功：展示短语
    await waitFor(() => {
      expect(screen.getByText('word1')).toBeInTheDocument()
    })
  })

  it('点击后按钮立即 disable，避免狂点覆盖 hash', async () => {
    // setup 返回一个永不 resolve 的 promise，模拟生成中
    const pending = new Promise<{
      success: boolean
      data?: { mnemonic: string[]; success: boolean }
    }>(() => {})
    mountApi({
      setup: vi.fn().mockReturnValue(pending),
      status: vi
        .fn()
        .mockResolvedValue({ success: true, data: { enrolled: false } })
    })
    const user = userEvent.setup()
    render(<RecoveryPhraseSetup />)

    const btn = await screen.findByRole('button', { name: '立即生成' })
    await user.click(btn)
    // 生成中：按钮 disable + 文案变化
    await waitFor(() => {
      const generating = screen.getByRole('button', { name: '生成中…' })
      expect(generating).toBeDisabled()
    })
  })

  it('ready → saved 状态下，继续按钮只触发 onComplete 一次', async () => {
    mountApi({
      setup: vi.fn().mockResolvedValue({
        success: true,
        data: { mnemonic: WORDS_24, success: true }
      }),
      status: vi.fn().mockResolvedValue({
        success: true,
        data: { enrolled: false }
      })
    })
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<RecoveryPhraseSetup onComplete={onComplete} />)

    await user.click(await screen.findByRole('button', { name: '立即生成' }))
    await waitFor(() => {
      expect(screen.getByText('word1')).toBeInTheDocument()
    })

    // 勾选 + 继续
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    const continueBtn = screen.getByRole('button', { name: '下一步：三重验证' })
    await user.click(continueBtn)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(WORDS_24)

    // saved 状态下按钮永久 disable
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '已保存' })).toBeDisabled()
    })
  })
})
