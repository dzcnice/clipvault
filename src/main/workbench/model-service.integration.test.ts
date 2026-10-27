import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { modelServiceStatus, saveModelService, listModelOptions } from './model-service'

const KEY = 'synthetic-model-key-not-real-0001'
const base = { endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat' as const, maxRequests: 30, maxMinutes: 20 }

describe.skipIf(!isSqliteAvailable())('custom model service', () => {
  beforeEach(() => { createIntegrationDb(); vault.createVault('Synthetic-model-service-password!') })
  afterEach(() => { vi.restoreAllMocks(); vault.__resetVaultForTests(); closeIntegrationDb() })

  it('suggests the custom OpenAI-compatible service until one is saved', () => {
    expect(modelServiceStatus()).toMatchObject({ configured: false, keyConfigured: false, endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: '' })
  })

  it('stores the key as an encrypted model resource and never returns it', () => {
    expect(() => saveModelService({ ...base, model: 'gpt-6-astra' })).toThrow('请填写密钥')
    const status = saveModelService({ ...base, model: 'gpt-6-astra', apiKey: KEY })
    expect(status).toMatchObject({ configured: true, keyConfigured: true, endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: 'gpt-6-astra' })
    expect(JSON.stringify(status)).not.toContain(KEY)
    const config = store.getModelConfig()
    expect(config).toMatchObject({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', model: 'gpt-6-astra', field: 'key' })
    expect(store.getResource(config.resourceId!).kind).toBe('model')
    expect(store.readResourceField(config.resourceId!, 'key')).toBe(KEY)
  })

  it('switches models without re-entering the key, but requires a new key for a different origin', () => {
    saveModelService({ ...base, model: 'gpt-6-astra', apiKey: KEY })
    const first = store.getModelConfig()
    const version = store.getResource(first.resourceId!).version
    saveModelService({ ...base, model: 'claude-opus-5-5' })
    expect(store.getModelConfig()).toMatchObject({ resourceId: first.resourceId, model: 'claude-opus-5-5' })
    expect(store.getResource(first.resourceId!).version).toBe(version)
    expect(() => saveModelService({ ...base, endpoint: 'https://other.example.test/v1', model: 'x' })).toThrow('重新填写')
    const moved = saveModelService({ ...base, endpoint: 'https://other.example.test/v1', model: 'x', apiKey: 'synthetic-other-key-0002' })
    expect(moved.endpoint).toBe('https://other.example.test/v1')
    expect(store.getModelConfig().resourceId).not.toBe(first.resourceId)
    expect(store.readResourceField(store.getModelConfig().resourceId!, 'key')).toBe('synthetic-other-key-0002')
  })

  it('rejects unsafe endpoints and model names', () => {
    expect(() => saveModelService({ ...base, endpoint: 'http://caowo.fun/v1', model: 'm', apiKey: KEY })).toThrow('HTTPS')
    expect(() => saveModelService({ ...base, endpoint: 'https://user:pw@caowo.fun/v1', model: 'm', apiKey: KEY })).toThrow()
    expect(() => saveModelService({ ...base, model: 'bad model', apiKey: KEY })).toThrow('无效字符')
  })

  it('lists OpenAI-compatible models with the typed key, sorted and de-duplicated', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'gpt-6-astra', owned_by: 'relay' }, { id: 'claude-opus-5-5' }, { id: 'gpt-6-astra' }, { id: 'bad id' }, { nope: 1 }
    ] }), { status: 200 }))
    const options = await listModelOptions({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', apiKey: KEY })
    expect(options).toEqual([{ id: 'claude-opus-5-5' }, { id: 'gpt-6-astra', owner: 'relay' }])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://caowo.fun/v1/models')
    expect((init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`)
    expect(init!.redirect).toBe('error')
  })

  it('reuses the saved key only for the same origin and uses the Anthropic models path', async () => {
    await expect(listModelOptions({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat' })).rejects.toThrow('密钥')
    saveModelService({ ...base, model: 'gpt-6-astra', apiKey: KEY })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'claude-opus-5-5', display_name: 'Opus 5.5' }] }), { status: 200 }))
    expect(await listModelOptions({ endpoint: 'https://caowo.fun/v1', protocol: 'anthropic' })).toEqual([{ id: 'claude-opus-5-5', label: 'Opus 5.5' }])
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('https://caowo.fun/v1/v1/models')
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe(KEY)
    await expect(listModelOptions({ endpoint: 'https://other.example.test/v1', protocol: 'openai-chat' })).rejects.toThrow('密钥')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports authentication and format failures without echoing the response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(`{"error":"bad key ${KEY}"}`, { status: 401 }))
    await expect(listModelOptions({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', apiKey: KEY })).rejects.toThrow('密钥无效或没有权限')
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    await expect(listModelOptions({ endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat', apiKey: KEY })).rejects.toThrow('手动填写')
  })
})
