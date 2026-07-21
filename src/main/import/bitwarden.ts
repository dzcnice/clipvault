/**
 * Sprint 14 · TASK-075 Bitwarden JSON 导入
 *
 * 支持未加密的 Bitwarden 导出（items[].type 1=login, 2=secure_note, 3=card, 4=identity）
 * 加密导出（encrypted=true）需要用户密码 —— 此处仅识别并报错返回，
 * 暂不实现完整 PBKDF2+AES 解密（Bitwarden 的 encKey 结构较复杂，YAGNI）。
 */

import type { ImportParseResult } from '../../types/import'
import { makeCredential, makeCtx } from './types'

interface BitwardenItem {
  name?: string
  notes?: string
  type?: number
  login?: {
    username?: string
    password?: string
    uris?: Array<{ uri?: string }>
    totp?: string
  }
  card?: {
    cardholderName?: string
    number?: string
    expMonth?: string
    expYear?: string
    code?: string
    brand?: string
  }
  identity?: Record<string, unknown>
  secureNote?: { type?: number }
  folderId?: string | null
}

interface BitwardenExport {
  encrypted?: boolean
  items?: BitwardenItem[]
  folders?: Array<{ id: string; name: string }>
}

export function parseBitwardenJson(
  text: string,
  _password?: string
): ImportParseResult {
  const ctx = makeCtx()
  let data: BitwardenExport
  try {
    data = JSON.parse(text) as BitwardenExport
  } catch (err) {
    throw new Error(`Bitwarden JSON 解析失败: ${(err as Error).message}`)
  }

  if (data.encrypted === true) {
    throw new Error(
      'Bitwarden 加密导出暂未支持，请在 Bitwarden 内选择 "Export as .json (unencrypted)" 后重试'
    )
  }

  const folderMap = new Map<string, string>()
  for (const f of data.folders ?? []) {
    if (f.id && f.name) folderMap.set(f.id, f.name)
  }

  const items = []
  for (const it of data.items ?? []) {
    const tags = ['bitwarden']
    if (it.folderId && folderMap.has(it.folderId)) {
      tags.push(folderMap.get(it.folderId)!)
    }
    const name = it.name ?? '(未命名)'
    const notes = it.notes ?? ''

    switch (it.type) {
      case 1: {
        // login
        const login = it.login ?? {}
        const uri = login.uris?.[0]?.uri
        const meta: Record<string, unknown> = {}
        if (login.username) meta.username = login.username
        if (uri) meta.url = uri
        if (login.totp) meta.totp = login.totp
        if (notes) meta.note = notes
        items.push(
          makeCredential('password', name, login.password ?? '', {
            description: uri || notes || undefined,
            metadata: meta,
            tags
          })
        )
        break
      }
      case 2: {
        // secure note
        items.push(
          makeCredential('text', name, notes, {
            description: '(secure note)',
            metadata: { note: notes },
            tags
          })
        )
        break
      }
      case 3: {
        // card
        const card = it.card ?? {}
        const val = card.number ?? ''
        items.push(
          makeCredential('text', name, val, {
            description: `${card.brand ?? ''} ${card.cardholderName ?? ''}`.trim(),
            metadata: {
              cardholderName: card.cardholderName,
              expMonth: card.expMonth,
              expYear: card.expYear,
              code: card.code,
              brand: card.brand,
              note: notes
            },
            tags: [...tags, 'card']
          })
        )
        break
      }
      case 4: {
        // identity
        items.push(
          makeCredential('text', name, notes || JSON.stringify(it.identity ?? {}), {
            description: 'identity',
            metadata: { ...(it.identity ?? {}), note: notes },
            tags: [...tags, 'identity']
          })
        )
        break
      }
      default:
        ctx.skipped++
        ctx.warnings.push(`跳过未知 type=${it.type} item: ${name}`)
    }
  }

  return {
    source: 'bitwarden',
    items,
    skipped: ctx.skipped,
    warnings: ctx.warnings
  }
}
