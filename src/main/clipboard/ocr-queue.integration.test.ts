import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
vi.mock('electron', () => ({}))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
import * as vault from '../crypto/vault'
import * as clips from '../../db/clipboard-store'
import { OcrQueue } from './ocr-queue'
import { emitCaptured } from './captured'
import { captureScreenRegion } from '../jarvis/capture'
import type { ClipboardItem } from '../../types'

let root = ''
function image(name: string, createdAt = Date.now()): string {
  const id = randomUUID(), path = join(root, `${name}.png`)
  writeFileSync(path, Buffer.from(name))
  getActiveIntegrationDb().prepare('INSERT INTO clipboard_history (id,type,preview,hash,size,created_at,image_path) VALUES (?,?,?,?,?,?,?)').run(id, 'image', '', id, 20, createdAt, path)
  return id
}

describe.skipIf(!isSqliteAvailable())('local OCR for clipboard images', () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cv-ocr-')); createIntegrationDb(); vault.createVault('Synthetic-Vault-Password!') })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); rmSync(root, { recursive: true, force: true }) })

  it('recognises newest images first, stores text encrypted, records empty and failed results once, and makes text searchable', async () => {
    const old = image('invoice', Date.now() - 60_000), blank = image('blank', Date.now() - 30_000), broken = image('broken')
    const seen: string[] = []
    const queue = new OcrQueue(async path => {
      seen.push(path.split(/[\\/]/).at(-1)!)
      if (path.endsWith('blank.png')) throw new Error('没有识别到文字，请选择更清晰的图片')
      if (path.endsWith('broken.png')) throw new Error('本地 OCR 未完成')
      return { text: '发票号码 INV-2026-7788 合计 ¥ 1,280.00' }
    }, undefined, 0)
    expect(await queue.run()).toBe(3)
    expect(seen).toEqual(['broken.png', 'blank.png', 'invoice.png'])
    expect(await queue.run()).toBe(0)
    const raw = getActiveIntegrationDb().prepare('SELECT ocr_encrypted, ocr_state FROM clipboard_history WHERE id = ?').get(old) as { ocr_encrypted: Buffer; ocr_state: string }
    expect(raw.ocr_state).toBe('done'); expect(Buffer.from(raw.ocr_encrypted).toString('utf8')).not.toContain('INV-2026-7788')
    expect(clips.getClipboardItemById(old)).toMatchObject({ ocrText: '发票号码 INV-2026-7788 合计 ¥ 1,280.00', ocrState: 'done' })
    expect(clips.getClipboardItemById(blank)).toMatchObject({ ocrState: 'empty' }); expect(clips.getClipboardItemById(blank)?.ocrText).toBeUndefined()
    expect(clips.getClipboardItemById(broken)).toMatchObject({ ocrState: 'failed' })
    const found = await clips.searchClipboardHistory({ keyword: 'inv-2026-7788' })
    expect(found.items.map(item => item.id)).toEqual([old])
  })
  it('stops when the vault locks and does nothing while locked', async () => {
    image('a'); image('b')
    let calls = 0
    const queue = new OcrQueue(async () => { calls++; vault.lockVault(); return { text: 'x' } }, undefined, 0)
    expect(await queue.run()).toBe(0)
    expect(calls).toBe(1)
    expect(await queue.run()).toBe(0)
  })
})

describe('screenshot capture waits for the next clipboard image', () => {
  const item = (patch: Partial<ClipboardItem>): ClipboardItem => ({ id: randomUUID(), type: 'image', preview: '', createdAt: Date.now(), tags: [], isPinned: false, ...patch } as ClipboardItem)
  it('opens the system snipping tool, ignores text and older images, and resolves with the new image', async () => {
    const open = vi.fn(async () => {})
    const pending = captureScreenRegion(open, 5000)
    expect(captureScreenRegion(open, 5000)).toBe(pending)
    expect(open).toHaveBeenCalledTimes(1)
    emitCaptured(item({ type: 'text' } as Partial<ClipboardItem>))
    emitCaptured(item({ createdAt: Date.now() - 120_000, lastCopiedAt: Date.now() - 120_000 }))
    const shot = item({})
    emitCaptured(shot)
    expect(await pending).toBe(shot.id)
  })
  it('returns null when the user cancels and nothing arrives', async () => {
    expect(await captureScreenRegion(async () => {}, 30)).toBeNull()
  })
})
