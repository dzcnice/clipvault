/**
 * Sprint 14 · TASK-074  1Password .1pux 导入
 *
 * 策略：
 *   1. 若传入文本以 '{' 开头，按裸 JSON（即 export.data）直接解析
 *   2. 否则按 base64(zip) 处理：手写 ZIP 目录解析，抽取 export.data
 *      - 仅支持 stored (method=0) 和 deflate (method=8，用 Node zlib) 两种
 *      - 其它压缩方法抛错
 *
 * 字段映射 —— 支持 1pux 五类 category：
 *   - LOGIN / PASSWORD           → password
 *   - CREDIT_CARD                → text (metadata 带卡号)
 *   - SECURE_NOTE                → text
 *   - SSH_KEY                    → text (metadata 带 public/private)
 *   - 其它                         → 记入 warning 并跳过
 */

import * as zlib from 'zlib'
import type { ImportParseResult, ImportedCredential } from '../../types/import'
import { makeCredential, makeCtx } from './types'

interface OnePuxField {
  id?: string
  title?: string
  value?: {
    string?: string
    concealed?: string
    email?: string
    url?: string
    totp?: string
    [k: string]: unknown
  }
}

interface OnePuxSection {
  title?: string
  fields?: OnePuxField[]
}

interface OnePuxOverview {
  title?: string
  url?: string
  urls?: Array<{ url?: string }>
  tags?: string[]
  subtitle?: string
}

interface OnePuxDetails {
  loginFields?: Array<{
    designation?: string
    name?: string
    value?: string
  }>
  notesPlain?: string
  sections?: OnePuxSection[]
  password?: string
  documentAttributes?: unknown
  passwordHistory?: unknown
}

interface OnePuxItem {
  uuid?: string
  categoryUuid?: string
  category?: string
  overview?: OnePuxOverview
  details?: OnePuxDetails
  favIndex?: number
  trashed?: boolean
}

interface OnePuxVault {
  items?: OnePuxItem[]
  attrs?: { name?: string }
}

interface OnePuxAccount {
  vaults?: OnePuxVault[]
}

interface OnePuxExportData {
  accounts?: OnePuxAccount[]
}

/**
 * 从 zip bytes 里抽 export.data（UTF-8 JSON 字符串）。
 * 仅解析 central directory + local header，支持 method 0/8。
 */
function extractExportDataFromZip(buf: Buffer): string {
  // 从末尾找 End of Central Directory 签名 0x06054b50
  const EOCD_SIG = 0x06054b50
  let eocdOffset = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) throw new Error('无效的 .1pux（找不到 EOCD）')

  const cdOffset = buf.readUInt32LE(eocdOffset + 16)
  const cdEntries = buf.readUInt16LE(eocdOffset + 10)

  let cursor = cdOffset
  const CD_SIG = 0x02014b50

  for (let i = 0; i < cdEntries; i++) {
    if (buf.readUInt32LE(cursor) !== CD_SIG) {
      throw new Error('ZIP central directory 结构损坏')
    }
    const compressionMethod = buf.readUInt16LE(cursor + 10)
    const compressedSize = buf.readUInt32LE(cursor + 20)
    const uncompressedSize = buf.readUInt32LE(cursor + 24)
    const fileNameLen = buf.readUInt16LE(cursor + 28)
    const extraLen = buf.readUInt16LE(cursor + 30)
    const commentLen = buf.readUInt16LE(cursor + 32)
    const localHeaderOffset = buf.readUInt32LE(cursor + 42)
    const name = buf
      .slice(cursor + 46, cursor + 46 + fileNameLen)
      .toString('utf-8')

    cursor += 46 + fileNameLen + extraLen + commentLen

    if (name !== 'export.data') continue

    // 读 local header 拿真正数据偏移
    const lhSig = buf.readUInt32LE(localHeaderOffset)
    if (lhSig !== 0x04034b50) {
      throw new Error('ZIP local header 结构损坏')
    }
    const lhNameLen = buf.readUInt16LE(localHeaderOffset + 26)
    const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen
    const raw = buf.slice(dataStart, dataStart + compressedSize)

    if (compressionMethod === 0) {
      return raw.slice(0, uncompressedSize).toString('utf-8')
    }
    if (compressionMethod === 8) {
      return zlib.inflateRawSync(raw).toString('utf-8')
    }
    throw new Error(
      `.1pux 使用了不支持的压缩算法 method=${compressionMethod}，请用 1Password 重新导出`
    )
  }

  throw new Error('.1pux 缺少 export.data 文件')
}

function buildLoginMeta(
  item: OnePuxItem
): { meta: Record<string, unknown>; password: string } {
  const meta: Record<string, unknown> = {}
  const lf = item.details?.loginFields ?? []
  let password = ''
  for (const f of lf) {
    const d = f.designation || f.name || ''
    if (d === 'password') {
      password = f.value ?? ''
    } else if (d === 'username') {
      meta.username = f.value
    } else if (d && f.value) {
      meta[d] = f.value
    }
  }
  if (item.details?.password) password = item.details.password
  const url = item.overview?.url || item.overview?.urls?.[0]?.url
  if (url) meta.url = url
  if (item.details?.notesPlain) meta.note = item.details.notesPlain
  // sections 里的 TOTP
  for (const sec of item.details?.sections ?? []) {
    for (const f of sec.fields ?? []) {
      const totp = f.value?.totp
      if (totp) meta.totp = totp
    }
  }
  return { meta, password }
}

function mapItem(item: OnePuxItem): ImportedCredential | null {
  if (item.trashed) return null
  const name = item.overview?.title || '(未命名)'
  const tags = ['1password', ...(item.overview?.tags ?? [])]
  const category = (item.categoryUuid || item.category || '').toString()

  // 1Password 分类常用 UUID 对照（来自官方 schema）
  // 001 LOGIN / 002 CREDIT_CARD / 003 SECURE_NOTE / 004 IDENTITY
  // 005 PASSWORD / 100 SOFTWARE_LICENSE / 106 SSH_KEY
  switch (category) {
    case '001':
    case 'LOGIN':
    case '005':
    case 'PASSWORD': {
      const { meta, password } = buildLoginMeta(item)
      return makeCredential('password', name, password, {
        description: (meta.url as string) || undefined,
        metadata: meta,
        tags
      })
    }
    case '002':
    case 'CREDIT_CARD': {
      const sectionMeta: Record<string, unknown> = {}
      for (const sec of item.details?.sections ?? []) {
        for (const f of sec.fields ?? []) {
          if (f.id && f.value) sectionMeta[f.id] = f.value.string ?? f.value.concealed
        }
      }
      // 1Password 历史 / 各版本导出里 CC number 字段名不统一：
      //   - ccnum / number（经典 1pux schema）
      //   - cardNumber / cardnum / cc-number（浏览器扩展 / 新版）
      const cardNumberFieldRegex = /^(ccnum|cardNumber|number|cc-number|cardnum)$/i
      let number = ''
      for (const key of Object.keys(sectionMeta)) {
        if (cardNumberFieldRegex.test(key)) {
          const v = sectionMeta[key]
          if (typeof v === 'string' && v.length > 0) {
            number = v
            break
          }
        }
      }
      return makeCredential('text', name, number, {
        description: 'credit card',
        metadata: { ...sectionMeta, note: item.details?.notesPlain },
        tags: [...tags, 'card']
      })
    }
    case '004':
    case 'IDENTITY': {
      // Identity 类（地址、电话、SSN、身份证件等）
      // 1Password 导出时 entry.sections[].fields[] 是结构化身份信息。
      // 我们把它们打平成 metadata.customFields 以便用户检索 / 手动整理。
      const customFields: Record<string, unknown> = {}
      for (const sec of item.details?.sections ?? []) {
        const secTitle = sec.title?.trim()
        for (const f of sec.fields ?? []) {
          if (!f.id) continue
          const v = f.value?.string ?? f.value?.email ?? f.value?.url ?? f.value?.concealed
          if (v === undefined || v === null || v === '') continue
          const prefixedKey = secTitle ? `${secTitle}.${f.id}` : f.id
          customFields[prefixedKey] = v
        }
      }
      const displayValue = item.overview?.subtitle ?? ''
      return makeCredential('text', name, displayValue, {
        description: 'identity',
        metadata: {
          customFields,
          note: item.details?.notesPlain
        },
        tags: [...tags, 'identity']
      })
    }
    case '003':
    case 'SECURE_NOTE': {
      const note = item.details?.notesPlain ?? ''
      return makeCredential('text', name, note, {
        description: 'secure note',
        metadata: { note },
        tags: [...tags, 'note']
      })
    }
    case '106':
    case 'SSH_KEY': {
      const sectionMeta: Record<string, unknown> = {}
      let privateKey = ''
      for (const sec of item.details?.sections ?? []) {
        for (const f of sec.fields ?? []) {
          const v = f.value?.concealed || f.value?.string
          if (!v) continue
          if (f.id === 'private_key' || /private/i.test(f.id ?? '')) privateKey = v
          else if (f.id) sectionMeta[f.id] = v
        }
      }
      return makeCredential('text', name, privateKey, {
        description: 'SSH key',
        metadata: { ...sectionMeta, note: item.details?.notesPlain },
        tags: [...tags, 'ssh']
      })
    }
    default:
      return null
  }
}

/**
 * 解析 .1pux 或裸 export.data JSON。
 *
 * @param content  UTF-8 JSON 或 base64(zip)
 * @param isBase64 true 时 content 是 base64(.1pux)
 */
export function parseOnepassword(
  content: string,
  isBase64 = false
): ImportParseResult {
  const ctx = makeCtx()

  let jsonText: string
  if (isBase64) {
    const buf = Buffer.from(content, 'base64')
    jsonText = extractExportDataFromZip(buf)
  } else if (content.trimStart().startsWith('{')) {
    jsonText = content
  } else {
    // 尝试按 base64 再试一次
    try {
      jsonText = extractExportDataFromZip(Buffer.from(content, 'base64'))
    } catch {
      throw new Error('无法识别 .1pux 内容：请传入 base64 .1pux 或裸 export.data JSON')
    }
  }

  let data: OnePuxExportData
  try {
    data = JSON.parse(jsonText) as OnePuxExportData
  } catch (err) {
    throw new Error(`1Password export.data 解析失败: ${(err as Error).message}`)
  }

  const items: ImportedCredential[] = []
  for (const account of data.accounts ?? []) {
    for (const vault of account.vaults ?? []) {
      const vaultTag = vault.attrs?.name
      for (const raw of vault.items ?? []) {
        const mapped = mapItem(raw)
        if (!mapped) {
          ctx.skipped++
          continue
        }
        if (vaultTag) {
          mapped.tags = [...(mapped.tags ?? []), `vault:${vaultTag}`]
        }
        items.push(mapped)
      }
    }
  }

  return {
    source: 'onepassword',
    items,
    skipped: ctx.skipped,
    warnings: ctx.warnings
  }
}
