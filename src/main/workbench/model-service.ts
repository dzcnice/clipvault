import * as store from '../../db/workbench-store'
import { boundedText } from './input'
import { endpointURL } from './bridge'
import { requestNetwork } from './network'
import type { ModelConfig, ModelServiceInput, ModelServiceStatus, ModelOption } from '../../types/workbench'

/** 未配置时的建议值；任何 OpenAI / Anthropic 兼容服务都可以改填。 */
export const SUGGESTED_MODEL_SERVICE = { endpoint: 'https://caowo.fun/v1', protocol: 'openai-chat' as const }
const KEY_FIELD = 'key'
const MODEL_ID = /^[\w.:/@+-]{1,120}$/

function protocolOf(value: unknown): NonNullable<ModelConfig['protocol']> {
  if (value !== 'openai-chat' && value !== 'anthropic') throw new Error('接口协议无效')
  return value
}
function configuredResource(config: ModelConfig): ReturnType<typeof store.getResource> | null {
  if (!config.resourceId) return null
  try {
    const resource = store.getResource(config.resourceId)
    return resource.kind === 'model' && resource.state !== 'revoked' ? resource : null
  } catch { return null }
}

/** 渲染层只拿到"是否已保存密钥"，拿不到密钥本身。 */
export function modelServiceStatus(): ModelServiceStatus {
  const config = store.getModelConfig(), resource = configuredResource(config)
  if (!resource) return { configured: false, keyConfigured: false, endpoint: SUGGESTED_MODEL_SERVICE.endpoint, protocol: SUGGESTED_MODEL_SERVICE.protocol, model: '', maxRequests: config.maxRequests, maxMinutes: config.maxMinutes }
  return { configured: true, keyConfigured: resource.fields.some(field => field.name === config.field && field.configured), endpoint: config.endpoint, protocol: config.protocol ?? 'anthropic', model: config.model, maxRequests: config.maxRequests, maxMinutes: config.maxMinutes }
}

/**
 * 保存服务地址、协议、模型与密钥。
 * 服务地址的 origin 变化时必须重新填写密钥，避免把旧服务的密钥发给新服务。
 */
export function saveModelService(input: ModelServiceInput): ModelServiceStatus {
  const endpoint = endpointURL(input.endpoint).href.replace(/\/$/, ''), protocol = protocolOf(input.protocol)
  const model = boundedText(input.model, '模型名称', 120, true)
  if (!MODEL_ID.test(model)) throw new Error('模型名称包含无效字符')
  const apiKey = input.apiKey === undefined || input.apiKey === '' ? undefined : boundedText(input.apiKey, '密钥', 4096, true)
  if (apiKey && /\s/.test(apiKey)) throw new Error('密钥不能包含空白字符')
  const config = store.getModelConfig(), current = configuredResource(config)
  const sameOrigin = !!current && new URL(current.endpoint).origin === new URL(endpoint).origin
  let resource = current
  if (!current || !sameOrigin) {
    if (!apiKey) throw new Error(current ? '服务地址已更换，请重新填写这个服务的密钥' : '请填写密钥')
    resource = store.saveResource({ name: `模型服务 · ${new URL(endpoint).host}`, kind: 'model', environment: 'personal', purpose: '工作台对话使用的模型服务', endpoint, fields: [{ name: KEY_FIELD, value: apiKey, secret: true }] })
  } else if (apiKey || endpointURL(current.endpoint).href !== endpointURL(endpoint).href) {
    const value = apiKey ?? store.readResourceField(current.id, config.field)
    resource = store.saveResource({ id: current.id, expectedVersion: current.version, name: current.name, kind: 'model', environment: current.environment, purpose: current.purpose, endpoint, fields: [{ name: KEY_FIELD, value, secret: true }] })
  }
  store.saveModelConfig({ resourceId: resource!.id, field: KEY_FIELD, endpoint, protocol, model, maxRequests: input.maxRequests, maxMinutes: input.maxMinutes })
  return modelServiceStatus()
}

/** 向服务的 /models 查询可用模型；密钥可来自本次输入，或已保存的同源服务。 */
export async function listModelOptions(input: { endpoint: string; protocol: unknown; apiKey?: string }): Promise<ModelOption[]> {
  const endpoint = endpointURL(input.endpoint), protocol = protocolOf(input.protocol)
  let apiKey = input.apiKey ? boundedText(input.apiKey, '密钥', 4096, true) : ''
  if (!apiKey) {
    const config = store.getModelConfig(), current = configuredResource(config)
    if (!current || new URL(current.endpoint).origin !== endpoint.origin) throw new Error('请先填写这个服务的密钥')
    apiKey = store.readResourceField(current.id, config.field)
  }
  const base = endpoint.pathname.replace(/\/$/, '')
  const url = new URL(`${base}${protocol === 'openai-chat' ? '/models' : '/v1/models'}`, endpoint.origin)
  const headers: Record<string, string> = protocol === 'openai-chat' ? { authorization: `Bearer ${apiKey}` } : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  let response: Response
  try { response = await requestNetwork(url, { method: 'GET', redirect: 'error', headers, signal: AbortSignal.timeout(15_000) }) }
  catch { throw new Error('无法连接模型服务，请检查地址和网络') }
  if (response.status === 401 || response.status === 403) throw new Error('密钥无效或没有权限')
  if (!response.ok) throw new Error(`模型列表获取失败（HTTP ${response.status}），可以直接手动填写模型名称`)
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error('模型列表过大')
  let payload: unknown
  try { payload = JSON.parse(text) } catch { throw new Error('模型服务返回的列表格式无法识别，可以直接手动填写模型名称') }
  const rows = Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : Array.isArray(payload) ? payload : []
  const seen = new Set<string>(), options: ModelOption[] = []
  for (const row of rows) {
    const id = typeof row === 'string' ? row : (row as { id?: unknown })?.id
    if (typeof id !== 'string' || !MODEL_ID.test(id) || seen.has(id)) continue
    seen.add(id)
    const owner = (row as { owned_by?: unknown })?.owned_by, label = (row as { display_name?: unknown })?.display_name
    options.push({ id, ...(typeof owner === 'string' && owner.length <= 80 ? { owner } : {}), ...(typeof label === 'string' && label.length <= 120 ? { label } : {}) })
    if (options.length >= 500) break
  }
  if (!options.length) throw new Error('服务没有返回可用模型，可以直接手动填写模型名称')
  return options.sort((a, b) => a.id.localeCompare(b.id))
}
