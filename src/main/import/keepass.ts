/**
 * Sprint 15 · TASK-075 (ν1) KeePass .kdbx 导入
 *
 * 依赖 kdbxweb (已装)。支持 KDBX 3.x / 4.x，AES + ChaCha20 两种 cipher，
 * Argon2 / AES KDF 均由 kdbxweb 负责。
 *
 * 接入方式：
 *   content 统一按 base64(.kdbx) 传入（IPC 层已约定 base64:true）。
 *   本函数返回 Promise —— 与其它 importer 不同，因 kdbxweb Kdbx.load 为异步。
 *
 * 字段映射：
 *   - Title        → credential.name
 *   - Password     → credential.value
 *   - UserName     → metadata.username
 *   - URL          → metadata.url
 *   - Notes        → metadata.note
 *   - otp / TOTP   → metadata.totp      （条目同时带 TOTP 时 type → api_key）
 *   - 其它自定义字段 → metadata.customFields[{name,value,protected}]
 *
 * 类型推断：
 *   - 含 TOTP               → 'api_key'
 *   - 含 URL                → 'password'（WEB_LOGIN 语义下仍用 password 类型承载）
 *   - 其它                    → 'password'
 *   - 无密码但有 Notes       → 'text'
 *
 * 错误码：
 *   - E_WRONG_PASSWORD       : 密码 / 密钥文件错
 *   - E_INVALID_KDBX         : 文件损坏 / 签名错
 *   - E_UNSUPPORTED_VERSION  : 不支持的 KDBX 版本
 *
 * 不实现（留 v2.0.2）：YubiKey challenge-response、附件（attachments）、历史版本。
 */

import * as kdbxweb from 'kdbxweb'
import { argon2dAsync, argon2idAsync } from '@noble/hashes/argon2.js'
import type { ImportParseResult, ImportedCredential } from '../../types/import'
import { makeCredential, makeCtx } from './types'

// kdbxweb 的 Argon2 KDF 需要宿主注入实现。KDBX 4 默认用 Argon2d。
// 只注册一次即可；重复调用 setArgon2Impl 会覆盖，安全。
let argon2Registered = false
/** 导出给测试使用；生产代码应走 parseKeepassKdbx */
export function ensureArgon2(): void {
  if (argon2Registered) return
  kdbxweb.CryptoEngine.setArgon2Impl(
    async (password, salt, memory, iterations, length, parallelism, type /* , version */) => {
      const opts = {
        t: iterations,
        m: memory, // kdbxweb 已把 bytes 转成 KB
        p: parallelism,
        dkLen: length
      }
      const pwd = new Uint8Array(password as ArrayBuffer)
      const slt = new Uint8Array(salt as ArrayBuffer)
      const fn = type === kdbxweb.CryptoEngine.Argon2TypeArgon2id ? argon2idAsync : argon2dAsync
      const out = await fn(pwd, slt, opts)
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
    }
  )
  argon2Registered = true
}

export const E_WRONG_PASSWORD = 'E_WRONG_PASSWORD'
export const E_INVALID_KDBX = 'E_INVALID_KDBX'
export const E_UNSUPPORTED_VERSION = 'E_UNSUPPORTED_VERSION'

/** 标准字段名（小写比对时使用） */
const STANDARD_FIELDS = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes'])

/** base64 → ArrayBuffer（不复制底层时要避免 subarray 偏移） */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, 'base64')
  // 拷贝到独立 ArrayBuffer，避免 Buffer 的 slab 共享导致 kdbxweb 读错
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  return ab
}

/** 读字段值（ProtectedValue 或 string） */
function readField(v: kdbxweb.KdbxEntryField | undefined): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  // ProtectedValue
  try {
    return v.getText()
  } catch {
    return v.toString()
  }
}

/** 把 kdbxweb 抛出的错误翻译成稳定错误码 */
function translateError(err: unknown): Error {
  const e = err as { code?: string; message?: string }
  const code = e?.code
  const msg = e?.message ?? String(err)
  const out = new Error(msg)
  // kdbxweb 的 ErrorCodes.InvalidKey → 密码/密钥不对
  if (code === 'InvalidKey') {
    out.message = 'KeePass 密码或密钥文件不正确'
    ;(out as Error & { code?: string }).code = E_WRONG_PASSWORD
    return out
  }
  if (code === 'InvalidVersion' || code === 'Unsupported') {
    out.message = `不支持的 KDBX 版本: ${msg}`
    ;(out as Error & { code?: string }).code = E_UNSUPPORTED_VERSION
    return out
  }
  if (
    code === 'BadSignature' ||
    code === 'FileCorrupt' ||
    code === 'InvalidArg' ||
    code === 'InvalidState'
  ) {
    out.message = `KDBX 文件损坏或无效: ${msg}`
    ;(out as Error & { code?: string }).code = E_INVALID_KDBX
    return out
  }
  // 未知错误，统一归为 INVALID_KDBX
  (out as Error & { code?: string }).code = E_INVALID_KDBX
  return out
}

/** 根据 entry 推断 credential 类型 */
function inferType(hasPassword: boolean, hasUrl: boolean, hasTotp: boolean, hasNotes: boolean): string {
  if (hasTotp) return 'api_key'
  if (hasPassword) return 'password'
  if (hasUrl) return 'password'
  if (hasNotes) return 'text'
  return 'password'
}

/** 把一个 Entry 映射成 ImportedCredential；若完全为空则返回 null */
function mapEntry(
  entry: kdbxweb.KdbxEntry,
  groupTags: string[]
): ImportedCredential | null {
  const fields = entry.fields
  const title = readField(fields.get('Title'))
  const username = readField(fields.get('UserName'))
  const password = readField(fields.get('Password'))
  const url = readField(fields.get('URL'))
  const notes = readField(fields.get('Notes'))

  // TOTP：KeePassXC 用 otp 字段；KeeWeb 用 TOTP Seed / TOTP Settings
  const totp = readField(fields.get('otp')) || readField(fields.get('TOTP'))

  // 自定义字段
  const customFields: Array<{ name: string; value: string; protected: boolean }> = []
  for (const [name, value] of fields) {
    if (STANDARD_FIELDS.has(name)) continue
    if (name === 'otp' || name === 'TOTP') continue
    const text = readField(value)
    if (!text) continue
    customFields.push({
      name,
      value: text,
      protected: value !== null && typeof value !== 'string'
    })
  }

  const hasAny = !!(title || username || password || url || notes || totp || customFields.length)
  if (!hasAny) return null

  const type = inferType(!!password, !!url, !!totp, !!notes)

  const metadata: Record<string, unknown> = {}
  if (username) metadata.username = username
  if (url) metadata.url = url
  if (notes) metadata.note = notes
  if (totp) metadata.totp = totp
  if (customFields.length) metadata.customFields = customFields

  // entry 自身 tags + 组 tag
  const entryTags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean) : []
  const tags = ['keepass', ...groupTags, ...entryTags]

  // value：对于 api_key 型把 totp 也算 value 候选，不过保持 password 优先
  const value = password || totp || (type === 'text' ? notes : '') || ''

  return makeCredential(type, title || '(未命名)', value, {
    description: url || undefined,
    metadata,
    tags
  })
}

/** 递归遍历组，收集每个 entry 所在组链作为 tag */
function collectEntries(
  group: kdbxweb.KdbxGroup,
  groupChain: string[],
  out: ImportedCredential[],
  skipRecycleBin: boolean,
  recycleBinUuid: string | undefined,
  ctx: { skipped: number }
): void {
  // 跳过回收站
  if (skipRecycleBin && recycleBinUuid && group.uuid?.toString() === recycleBinUuid) {
    return
  }
  const myChain = group.name ? [...groupChain, group.name] : groupChain
  const tag = group.name ?? null
  const groupTags = tag ? [tag] : []

  for (const entry of group.entries ?? []) {
    const mapped = mapEntry(entry, groupTags)
    if (mapped) {
      out.push(mapped)
    } else {
      ctx.skipped++
    }
  }
  for (const sub of group.groups ?? []) {
    collectEntries(sub, myChain, out, skipRecycleBin, recycleBinUuid, ctx)
  }
}

/**
 * 解析 .kdbx。
 *
 * @param content  base64(.kdbx) 字符串
 * @param password 主密码（空字符串视为无密码，但 kdbxweb 仍要求传 ProtectedValue）
 * @param keyFileB64 可选的 base64 密钥文件
 */
export async function parseKeepassKdbx(
  content: string,
  password?: string,
  keyFileB64?: string
): Promise<ImportParseResult> {
  ensureArgon2()
  const ctx = makeCtx()

  let fileData: ArrayBuffer
  try {
    fileData = base64ToArrayBuffer(content)
  } catch (err) {
    const out = new Error(`无法解码 base64 .kdbx 输入: ${(err as Error).message}`)
    ;(out as Error & { code?: string }).code = E_INVALID_KDBX
    throw out
  }

  if (fileData.byteLength < 8) {
    const out = new Error('KDBX 文件过小，无法识别')
    ;(out as Error & { code?: string }).code = E_INVALID_KDBX
    throw out
  }

  // 构造 credentials
  let credentials: kdbxweb.KdbxCredentials
  try {
    const pv = password
      ? kdbxweb.ProtectedValue.fromString(password)
      : kdbxweb.ProtectedValue.fromString('')
    const keyFile = keyFileB64 ? base64ToArrayBuffer(keyFileB64) : null
    credentials = new kdbxweb.Credentials(pv, keyFile)
    // Credentials 构造函数里的 setPassword/setKeyFile 均异步，需等 ready
    await credentials.ready
  } catch (err) {
    throw translateError(err)
  }

  let db: kdbxweb.Kdbx
  try {
    db = await kdbxweb.Kdbx.load(fileData, credentials)
  } catch (err) {
    throw translateError(err)
  }

  const items: ImportedCredential[] = []
  const root = db.getDefaultGroup()
  const recycleBinUuid = db.meta?.recycleBinUuid?.toString()

  collectEntries(root, [], items, true, recycleBinUuid, ctx)

  return {
    source: 'keepass',
    items,
    skipped: ctx.skipped,
    warnings: ctx.warnings
  }
}
