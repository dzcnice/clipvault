import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import * as store from '../../db/workbench-store'
import { boundedText, parseResourceText, redactInput } from '../workbench/input'
import { allResourceSecrets, containsSecrets, outboundRedact } from '../workbench/redaction'
import { inferRole, sensitiveRole } from './roles'
import { duplicateSecretResources } from './secret-index'
import { onVaultLocked } from '../crypto/vault'
import type { StructuredRequest } from '../harness-host/utility'
import type { IntakeReview, IntakeCommit } from '../../types/resources'
import type { ResourceFieldInput, ResourceInput, WorkResource } from '../../types/workbench'

const roles = z.enum(['username', 'password', 'api_key', 'token', 'totp_seed', 'host', 'port', 'database', 'connection_string', 'other'])
const proposalSchema = z.object({ name: z.string().min(1).max(120), kind: z.enum(['account', 'api', 'database', 'snippet', 'command', 'link', 'note', 'model']), projectName: z.string().max(120).optional(), environment: z.string().max(40).optional(), purpose: z.string().max(4000), loginUrl: z.string().max(2048).optional(), fields: z.array(z.object({ token: z.string(), name: z.string().min(1).max(64), role: roles, secret: z.boolean() })).max(30), aliases: z.array(z.string().max(100)).max(6), tags: z.array(z.string().max(100)).max(20), rotateAfterDays: z.number().int().min(1).max(3650).optional(), notes: z.string().max(8000).optional() })
type Structurer = <T>(request: StructuredRequest<T>) => Promise<T>
type Pending = { review: IntakeReview; fields: Map<string, ResourceFieldInput>; expiresAt: number }
const pending = new Map<string, Pending>()
let generation = 0
onVaultLocked(() => { pending.clear(); generation++ })

function format(value: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email'
  if (value.startsWith('otpauth://')) return 'otpauth'
  if (/^https?:\/\//.test(value)) return 'url'
  if (/^eyJ[^.]+\.[^.]+\.[^.]+$/.test(value)) return 'jwt'
  if (/^sk-/.test(value)) return 'sk_key'
  if (/^AKIA[A-Z0-9]{16}$/.test(value)) return 'aws_key'
  if (/^gh[pousr]_/.test(value)) return 'github_token'
  if (/^\d+$/.test(value)) return 'digits'
  if (/^[A-Fa-f0-9-]{36}$/.test(value)) return 'uuid'
  if (/^[A-Z2-7]{16,}={0,6}$/i.test(value)) return 'base32'
  return 'unknown'
}
function entry(id: string): Pending {
  const value = pending.get(id)
  if (!value || value.expiresAt <= Date.now()) { pending.delete(id); throw new Error('录入草稿已过期，请重新整理') }
  return value
}
export async function prepareIntake(text: string, purpose: string, options: { structure?: Structurer; allowUsername?: boolean; sourceClipId?: string } = {}): Promise<IntakeReview> {
  const started = generation
  text = boundedText(text, '资料', 100_000, true)
  const parsed = parseResourceText(text)
  const originals = parsed.fields.map(field => field.value), secrets = [...allResourceSecrets(), ...originals]
  const clean = (text: string): string => redactInput(text, secrets).text
  const fields = new Map(parsed.fields.map((field, index) => [`⟦v${index + 1}⟧`, { ...field, role: inferRole(field.name, field.value), secret: field.secret || sensitiveRole(inferRole(field.name, field.value)) }]))
  if (!fields.size && !parsed.endpoint) throw new Error('没有可保存的字段或地址')
  let endpoint = ''
  if (parsed.endpoint) { const url = new URL(parsed.endpoint); endpoint = clean(url.origin + url.pathname); if (endpoint.includes('[已隐藏')) endpoint = '' }
  const projects = store.listProjects().filter(item => !item.archived)
  const draft: IntakeReview['draft'] = { name: parsed.suggested?.name || (endpoint ? new URL(endpoint).hostname : '新资源'), kind: parsed.suggested?.kind ?? 'account', projectId: projects.find(item => item.name === parsed.suggested?.projectName)?.id ?? null, environment: parsed.suggested?.environment || 'development', purpose: clean(boundedText(purpose || parsed.suggested?.purpose || '', '用途', 4000)), endpoint, loginUrl: endpoint.startsWith('https:') ? endpoint : '', aliases: [], tags: [], fields: [...fields].map(([token, field]) => ({ token, name: field.name, role: field.role!, secret: field.secret, preview: '••••••••' })) }
  draft.name = clean(draft.name); draft.environment = clean(draft.environment)
  draft.fields = draft.fields.map(field => ({ ...field, name: clean(field.name) }))
  const warnings = parsed.warnings.map(clean)
  let usedAI = false
  if (options.structure) try {
    const skeleton = [...fields].map(([token, field]) => ({ token, originalName: clean(field.name), length: field.value.length, charClasses: [/[a-z]/.test(field.value) ? 'lower' : '', /[A-Z]/.test(field.value) ? 'upper' : '', /\d/.test(field.value) ? 'digit' : '', /[^a-zA-Z0-9]/.test(field.value) ? 'symbol' : ''].filter(Boolean), format: format(field.value), secretGuess: field.secret,
      ...(options.allowUsername && field.role === 'username' ? { username: outboundRedact(field.value).text } : {}) }))
    const output = proposalSchema.parse(await options.structure({ purpose: 'resource_structure', schema: proposalSchema, timeoutMs: 30_000, prompt: JSON.stringify({ instruction: '把字段格式骨架整理为资源。只使用提供的 token，不猜测字段值。返回 name,kind,projectName?,environment?,purpose,loginUrl?,fields:[{token,name,role,secret}],aliases,tags,rotateAfterDays?,notes?。loginUrl 只能与 endpoint 同源。', skeleton, endpoint, purpose: draft.purpose, projects: projects.map(item => ({ name: clean(item.name), environment: clean(item.environment) })), resourceNames: store.listResources().map(item => clean(item.name)) }) }))
    const serialized = JSON.stringify(output), seen = new Set<string>()
    if (containsSecrets(serialized, originals)) throw new Error('模型结果含原始字段值')
    for (const field of output.fields) { if (!fields.has(field.token) || seen.has(field.token)) throw new Error('模型返回了未知或重复令牌'); seen.add(field.token) }
    if (output.loginUrl && (!endpoint || new URL(output.loginUrl).protocol !== 'https:' || new URL(output.loginUrl).origin !== new URL(endpoint).origin || new URL(output.loginUrl).username || new URL(output.loginUrl).password || new URL(output.loginUrl).search || new URL(output.loginUrl).hash)) throw new Error('模型登录地址越界')
    Object.assign(draft, { name: output.name, kind: output.kind, projectId: projects.find(item => item.name === output.projectName)?.id ?? draft.projectId, environment: output.environment || draft.environment, purpose: output.purpose, loginUrl: output.loginUrl || draft.loginUrl, aliases: output.aliases, tags: output.tags, rotateAfterDays: output.rotateAfterDays, notes: output.notes })
    draft.fields = draft.fields.map(field => { const proposal = output.fields.find(item => item.token === field.token); return proposal ? { ...field, ...proposal, secret: field.secret || proposal.secret || sensitiveRole(proposal.role) } : field })
    usedAI = true
  } catch { warnings.push('AI 整理不可用或结果未通过安全校验，已采用本地解析') }
  const duplicates = new Set(duplicateSecretResources([...fields.values()].filter(field => field.secret).map(field => field.value)))
  const user = [...fields.values()].find(field => field.role === 'username')
  if (user && endpoint) for (const resource of store.listResources().filter(item => item.state !== 'revoked' && item.endpoint)) {
    const username = resource.fields.find(field => field.role === 'username')
    if (username && new URL(resource.loginUrl || resource.endpoint).origin === new URL(endpoint).origin && store.readResourceField(resource.id, username.name) === user.value) duplicates.add(resource.id)
  }
  if (started !== generation) throw new Error('资料库已锁定，请重新整理')
  const review: IntakeReview = { id: randomUUID(), draft, warnings, duplicates: [...duplicates].map(id => { const item = store.getResource(id); return { id, name: clean(item.name), version: item.version } }), usedAI, usernameShared: !!options.allowUsername && !!options.structure, sourceClipId: options.sourceClipId }
  for (const [id, item] of pending) if (item.expiresAt <= Date.now()) pending.delete(id)
  if (pending.size >= 20) throw new Error('未保存的录入草稿过多，请先完成当前草稿')
  pending.set(review.id, { review, fields, expiresAt: Date.now() + 10 * 60_000 })
  return review
}
export function revealIntake(id: string, token: string): string { const field = entry(id).fields.get(token); if (!field) throw new Error('字段不存在'); return field.value }
export function commitIntake(input: IntakeCommit): { resource: WorkResource; sourceClipId?: string } {
  const value = entry(input.id), names = new Set<string>(), tokens = new Set<string>()
  if (!Array.isArray(input.draft.fields) || input.draft.fields.length !== value.fields.size) throw new Error('请保留全部已识别字段，避免丢失原始资料')
  const fields = input.draft.fields.map(field => {
    const original = value.fields.get(field.token)
    if (!original || tokens.has(field.token) || names.has(field.name)) throw new Error('字段令牌或名称无效')
    tokens.add(field.token); names.add(field.name)
    return { name: field.name, role: field.role, secret: original.secret || field.secret || sensitiveRole(field.role), value: original.value }
  })
  if (input.updateId && !value.review.duplicates.some(item => item.id === input.updateId && item.version === input.expectedVersion)) throw new Error('更新目标或版本与本次确认不一致')
  const data: ResourceInput = { ...input.draft, id: input.updateId, expectedVersion: input.expectedVersion, fields }
  const resource = store.saveResource(data)
  pending.delete(input.id)
  return { resource, sourceClipId: value.review.sourceClipId }
}
