// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModelSettings from './ModelSettings'

const unconfigured = { configured: false, keyConfigured: false, endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: '', maxRequests: 30, maxMinutes: 20 }
const api = { modelService: vi.fn(), listModels: vi.fn(), saveModelService: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks()
  api.modelService.mockResolvedValue({ success: true, data: unconfigured })
  Object.defineProperty(window, 'api', { configurable: true, value: { workbench: api } })
})

describe('custom model service settings', () => {
  it('defaults to the custom relay, lists models with the typed key and saves without echoing the key', async () => {
    const user = userEvent.setup()
    api.listModels.mockResolvedValue({ success: true, data: [{ id: 'claude-opus-5-5' }, { id: 'gpt-6-astra', owner: 'relay' }] })
    api.saveModelService.mockResolvedValue({ success: true, data: { ...unconfigured, configured: true, keyConfigured: true, model: 'gpt-6-astra' } })
    const onSaved = vi.fn()
    render(<ModelSettings onSaved={onSaved} />)
    const endpoint = await screen.findByDisplayValue('https://caowo.fun/v1')
    expect(endpoint).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'OpenAI 兼容' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('button', { name: '获取模型列表' })).toBeDisabled()
    await user.type(screen.getByPlaceholderText('粘贴这个服务的 API Key'), 'synthetic-key-0001')
    await user.click(screen.getByRole('button', { name: '获取模型列表' }))
    expect(api.listModels).toHaveBeenCalledWith({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', apiKey: 'synthetic-key-0001' })
    await user.click(await screen.findByRole('option', { name: /gpt-6-astra/ }))
    await user.click(screen.getByRole('button', { name: '保存模型服务' }))
    expect(api.saveModelService).toHaveBeenCalledWith({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: 'gpt-6-astra', maxRequests: 30, maxMinutes: 20, apiKey: 'synthetic-key-0001' })
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(screen.queryByDisplayValue('synthetic-key-0001')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('已保存 · 留空则继续使用')).toBeInTheDocument()
  })

  it('keeps the saved key for the same service but asks again after the origin changes', async () => {
    const user = userEvent.setup()
    api.modelService.mockResolvedValue({ success: true, data: { ...unconfigured, configured: true, keyConfigured: true, model: 'gpt-6-astra' } })
    render(<ModelSettings />)
    expect(await screen.findByPlaceholderText('已保存 · 留空则继续使用')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存模型服务' })).toBeEnabled()
    const endpoint = screen.getByDisplayValue('https://caowo.fun/v1')
    await user.clear(endpoint); await user.type(endpoint, 'https://other.example.test/v1')
    expect(screen.getByPlaceholderText('服务地址已更换，请填写这个服务的密钥')).toBeRequired()
    expect(screen.getByRole('button', { name: '保存模型服务' })).toBeDisabled()
  })

  it('surfaces list errors so the model can still be typed manually', async () => {
    const user = userEvent.setup()
    api.listModels.mockResolvedValue({ success: false, error: '密钥无效或没有权限' })
    render(<ModelSettings />)
    await user.type(await screen.findByPlaceholderText('粘贴这个服务的 API Key'), 'synthetic-key-0002')
    await user.click(screen.getByRole('button', { name: '获取模型列表' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('密钥无效或没有权限')
    await user.type(screen.getByPlaceholderText('选择或手动填写模型名称'), 'gpt-6-astra')
    expect(screen.getByRole('button', { name: '保存模型服务' })).toBeEnabled()
  })
})
