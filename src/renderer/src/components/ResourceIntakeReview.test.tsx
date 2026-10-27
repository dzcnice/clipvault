// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ResourceIntake from './ResourceIntakeReview'
const review = { id: 'draft-fixture', usedAI: false, warnings: [], duplicates: [], draft: { name: 'Fixture', kind: 'account', environment: 'dev', endpoint: '', aliases: [], tags: [], fields: [{ token: '⟦v1⟧', name: 'password', role: 'password', secret: true, preview: '••••••••' }] } }
const api = { intake: vi.fn(), quickIndex: vi.fn(), revealIntake: vi.fn(), saveIntake: vi.fn() }
beforeEach(() => { vi.resetAllMocks(); api.intake.mockResolvedValue({ success: true, data: review }); api.quickIndex.mockResolvedValue({ success: true, data: { projects: [] } }); api.saveIntake.mockResolvedValue({ success: true, data: { id: 'resource-fixture' } }); Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } }) })
afterEach(cleanup)
describe('resource confirmation privacy', () => {
  it('resolves a clipboard prompt in main, keeps masks, and preserves editable aliases', async () => {
    const saved = vi.fn()
    render(<ResourceIntake source={{ promptId: 'main-only-fixture' }} onSaved={saved} />)
    expect(screen.queryByRole('textbox', { name: '账号资料' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '整理' }))
    const aliases = await screen.findByLabelText('别名（逗号分隔）')
    fireEvent.change(aliases, { target: { value: '支付后台, payment admin' } })
    expect(aliases).toHaveValue('支付后台, payment admin')
    expect(api.intake).toHaveBeenCalledWith(expect.objectContaining({ promptId: 'main-only-fixture', useAI: false }))
    fireEvent.click(screen.getByRole('button', { name: '保存资源' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(api.saveIntake.mock.calls[0]![0].draft.aliases).toEqual(['支付后台', 'payment admin'])
    expect(JSON.stringify(api.saveIntake.mock.calls)).not.toContain('original-secret')
  })
  it('does not reveal a late response after the show button is released', async () => {
    let done!: (value: unknown) => void
    api.revealIntake.mockImplementation(() => new Promise(resolve => { done = resolve }))
    render(<ResourceIntake source={{ clipboardId: 'clipboard-fixture' }} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '整理' }))
    const button = await screen.findByRole('button', { name: '按住显示' })
    fireEvent.pointerDown(button); fireEvent.pointerUp(button)
    done({ success: true, data: 'original-secret-synthetic' })
    await waitFor(() => expect(api.revealIntake).toHaveBeenCalled())
    expect(screen.queryByText('original-secret-synthetic')).toBeNull()
  })
})
