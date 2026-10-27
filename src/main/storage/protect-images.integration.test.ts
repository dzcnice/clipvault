import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { createIntegrationDb, closeIntegrationDb, getActiveIntegrationDb, integrationTransaction, isSqliteAvailable } from '../../../test-setup/integration'
const state = vi.hoisted(() => ({ root: '', backup: vi.fn(() => ({ success: true })) }))
vi.mock('../../db/connection', () => ({ getDatabase: getActiveIntegrationDb, transaction: integrationTransaction }))
vi.mock('../backup', () => ({ performBackup: state.backup }))
vi.mock('../prefs', () => ({ getDefaultImagesDir: () => join(state.root, 'images'), resolveImagesDir: () => join(state.root, 'images') }))
import * as vault from '../crypto/vault'
import { protectLegacyImages } from './protect-images'
import { readImageBytes } from './image-store'

describe.skipIf(!isSqliteAvailable())('safe legacy image conversion', () => {
  beforeEach(() => {
    state.root = mkdtempSync(join(tmpdir(), 'cv-protect-images-')); mkdirSync(join(state.root, 'images'))
    state.backup.mockReset().mockReturnValue({ success: true })
    createIntegrationDb(); vault.createVault('Image-Test-Password!')
  })
  afterEach(() => { vault.__resetVaultForTests(); closeIntegrationDb(); rmSync(state.root, { recursive: true, force: true }) })
  function add(path: string): string {
    const id = randomUUID()
    getActiveIntegrationDb().prepare('INSERT INTO clipboard_history (id,type,preview,hash,size,created_at,image_path) VALUES (?,?,?,?,?,?,?)').run(id, 'image', '', id, 20, Date.now(), path)
    return id
  }
  it('converts owned originals after backup and retains external originals byte-for-byte', async () => {
    const owned = join(state.root, 'images', `${randomUUID()}.png`), external = join(state.root, 'external.png')
    const bytes = Buffer.from('SYNTHETIC-IMAGE-CANARY')
    writeFileSync(owned, bytes); writeFileSync(external, bytes)
    const ids = [add(owned), add(external)]
    expect(await protectLegacyImages()).toEqual({ converted: 2, retainedOriginals: 1, failed: 0 })
    expect(state.backup).toHaveBeenCalledOnce()
    expect(existsSync(owned)).toBe(false)
    expect(readFileSync(external)).toEqual(bytes)
    for (const id of ids) {
      const row = getActiveIntegrationDb().prepare('SELECT image_path FROM clipboard_history WHERE id=?').get(id) as { image_path: string }
      expect(readImageBytes(row.image_path).bytes).toEqual(bytes)
      expect(readFileSync(row.image_path).includes(bytes)).toBe(false)
    }
  })
  it('stops before writes when backup fails, and reports missing originals without losing their records', async () => {
    const path = join(state.root, 'images', `${randomUUID()}.png`), id = add(path)
    state.backup.mockReturnValue({ success: false })
    await expect(protectLegacyImages()).rejects.toThrow('备份失败')
    state.backup.mockReturnValue({ success: true })
    expect(await protectLegacyImages()).toEqual({ converted: 0, retainedOriginals: 0, failed: 1 })
    expect(getActiveIntegrationDb().prepare('SELECT image_path FROM clipboard_history WHERE id=?').get(id)).toEqual({ image_path: path })
  })
})
