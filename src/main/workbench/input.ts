import { createHash } from 'node:crypto'
import type { ResourceDraft, ResourceFieldInput } from '../../types/workbench'

export const secretName = (name: string): boolean => /password|passwd|pwd|secret|token|api.?key|private.?key|(^|[_ -])key($|[_ -])|authorization|密码|密钥|令牌/i.test(name)
export function fingerprint(text: string): string { return createHash('sha256').update(text).digest('hex') }

/** 地址作为普通元数据展示；认证信息必须单独存入秘密字段。 */
export function resourceEndpoint(value: string): string {
  if (!value) return ''
  let url: URL
  try { url = new URL(value) } catch { throw new Error('地址格式无效，请填写完整 HTTP 或 HTTPS 地址') }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('地址仅支持 HTTP 或 HTTPS；数据库连接串请作为敏感字段保存')
  if (url.username || url.password || [...url.searchParams.keys()].some(secretName) || secretName(url.hash)) throw new Error('地址包含认证信息，请使用“整理字段”将密码和令牌单独保存')
  return url.href
}

/** 本地整理，不调用模型；无法识别的原文也保持秘密属性。 */
export function parseResourceText(text: string): ResourceDraft {
  if (typeof text !== 'string' || text.length > 100_000) throw new Error('资料过长，请分段保存')
  const fields: ResourceFieldInput[] = []
  const warnings: string[] = []
  let endpoint = ''
  const suggested: NonNullable<ResourceDraft['suggested']> = {}
  const remainder: string[] = []
  const add = (name: string, value: string, exact = false): void => {
    name = name.trim().replace(/^export\s+/, '')
    if (!exact) value = value.trim().replace(/^(["'])(.*)\1$/, '$2')
    if (!name || !value) return
    if (/^(url|endpoint|base_?url|网址|地址|接口地址|登录地址)$/i.test(name)) { endpoint = value; return }
    if (/^(名称|服务名称|name)$/i.test(name)) { suggested.name = value; return }
    if (/^(用途|目的|说明|purpose)$/i.test(name)) { suggested.purpose = value; return }
    if (/^(项目|project)$/i.test(name)) { suggested.projectName = value; return }
    if (/^(环境|environment)$/i.test(name)) { suggested.environment = value; return }
    if (fields.some(field => field.name === name)) { remainder.push(`${name}=${value}`); warnings.push(`字段 ${name} 重复，原文单独保留`); return }
    fields.push({ name, value, secret: secretName(name) || !/^(user(name)?|account|账号|用户名|host|port|database|邮箱|email)$/i.test(name) })
  }
  let parsedJson = false
  try {
    const json: unknown = JSON.parse(text)
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      for (const [key, value] of Object.entries(json)) add(key, typeof value === 'string' ? value : JSON.stringify(value), true)
      parsedJson = true
    }
  } catch { /* 继续识别逐行字段 */ }
  const lines = text.replace(/[，,；;]\s*(?=(?:名称|项目|环境|用途|用户名|账号|密码|密钥|令牌|地址|接口地址|登录地址|username|password|api[_ -]?key|endpoint|purpose)\s*[:=：])/gi, '\n')
  if (!parsedJson) for (const line of lines.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
    if (/^https?:\/\/\S+$/i.test(line) && !endpoint) { endpoint = line; continue }
    const match = line.match(/^([^:=：]{1,64})\s*[:=：]\s*(.+)$/)
    if (match) add(match[1]!, match[2]!)
    else remainder.push(line)
  }
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      if (url.username) { add('username', decodeURIComponent(url.username), true); url.username = '' }
      if (url.password) { add('password', decodeURIComponent(url.password), true); url.password = '' }
      for (const [name, value] of [...url.searchParams]) if (secretName(name)) { add(name, value, true); url.searchParams.delete(name) }
      if (url.hash && secretName(url.hash)) { add('地址认证片段', url.hash); url.hash = '' }
      if (url.href !== endpoint && fields.some(field => field.secret)) warnings.push('地址中的认证信息已拆成敏感字段；请检查整理后的地址')
      endpoint = resourceEndpoint(url.href)
      suggested.name ??= url.hostname
    } catch { warnings.push('地址需要检查；含认证信息的地址不能直接保存为公开元数据') }
  }
  if (remainder.length) {
    fields.push({ name: '原始资料', value: remainder.join('\n'), secret: true })
    warnings.push('未识别或重复内容仅作为本地敏感字段保存，请检查名称与用途')
  }
  if (fields.some(field => /api.?key|token|令牌|密钥/i.test(field.name))) suggested.kind = 'api'
  else if (fields.some(field => /password|密码|username|账号/i.test(field.name))) suggested.kind = 'account'
  for (const key of ['name', 'purpose', 'projectName', 'environment'] as const) if (suggested[key]) suggested[key] = redactInput(suggested[key]!, fields.filter(field => field.secret).map(field => field.value)).text
  if (!fields.length && !endpoint) warnings.push('尚未识别到可保存内容')
  return { fields, endpoint, warnings: [...new Set(warnings)], suggested }
}

/** 补充拦截常见秘密格式；不能作为任意输入绝对无秘密的证明。 */
export function redactInput(text: string, knownSecrets: string[] = []): { text: string; redacted: boolean } {
  let result = text
  for (const value of [...knownSecrets].filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(value).join('[已隐藏敏感字段]')
  result = result.replace(/((?:password|passwd|pwd|secret|token|api[_-]?key|authorization|密码|密钥|令牌)["']?\s*[:=：]\s*)(?:["'][^"'\r\n]+["']|[^\s,;\r\n}]+)/gi, '$1[已隐藏敏感字段]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{15,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[已隐藏敏感字段]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1[已隐藏认证]@')
    .replace(/([?&](?:key|token|secret|password|api_key)=)[^&#\s]+/gi, '$1[已隐藏敏感字段]')
  return { text: result, redacted: result !== text }
}

export function boundedText(value: unknown, name: string, max: number, required = false): string {
  if (typeof value !== 'string') { if (!required && value == null) return ''; throw new Error(`${name}必须是文本`) }
  if (value.length > max || (required && !value.trim()) || value.includes('\0')) throw new Error(`${name}为空、过长或包含无效字符`)
  return value.trim()
}
