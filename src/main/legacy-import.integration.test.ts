import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSqliteAvailable } from '../../test-setup/integration'
const fixture = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { getPath: () => fixture.root }, BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('./workbench/service', () => ({ workbenchBusy: () => false }))
vi.mock('./notification', () => ({ showBackupNotification: () => {} }))
vi.mock('./utils/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }))
import { initDatabase, closeDatabase, getDatabase } from '../db/connection'
import * as vault from './crypto/vault'
import { createCredential, getCredentialById, listCredentials } from '../db/credential-store'
import { addClipboardItem, getClipboardItemById, listClipboardHistory } from '../db/clipboard-store'
import { CredentialType } from '../types/credential'
import { ClipboardContentType } from '../types/clipboard'
import { upsertTOTP } from '../db/credential-totp-store'
import { openMergeBackup } from './backup-merge'
import { readImageBytes } from './storage/image-store'
import { decryptV10, detectLegacyProfile, legacyAlreadyMerged, legacyDek, prepareLegacyImport } from './legacy-import'
import { hasMergeIndex } from '../db/workbench-store'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64')
const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')
/** 与 Electron safeStorage 在 Windows 上相同的 v10 格式。 */
function sealV10(key: Buffer, plain: string): Buffer {
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
  return Buffer.concat([Buffer.from('v10'), nonce, cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()])
}

describe.skipIf(!isSqliteAvailable())('import from the original ClipVault profile', () => {
  let root = '', legacy = '', chromium: Buffer, wrapped: Buffer, hashes: Record<string, string>
  const unprotect = async (data: Buffer): Promise<Buffer> => { if (!data.equals(wrapped)) throw new Error('wrong user'); return Buffer.from(chromium) }
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'cv-legacy-')); legacy = join(root, 'clipvault'); fixture.root = legacy; mkdirSync(legacy)
    // 原版：免密保险库（safeStorage 包裹的数据钥匙）
    initDatabase(); vault.createVault('Original-Vault-Password!')
    const credential = createCredential({ name: 'Original account', type: CredentialType.PASSWORD, value: 'ORIGINAL-PASSWORD-CANARY' })
    upsertTOTP({ credentialId: credential.id, secret: 'JBSWY3DPEHPK3PXP' })
    await addClipboardItem({ type: ClipboardContentType.TEXT, content: 'original clipboard protected content' })
    // 原版 3.3 的图片是明文文件
    mkdirSync(join(legacy, 'images')); writeFileSync(join(legacy, 'images', 'shot.png'), png)
    getDatabase().prepare('INSERT INTO clipboard_history (id,type,preview,hash,size,created_at,image_path) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), 'image', '', 'img-hash', png.length, Date.now(), join(legacy, 'images', 'shot.png'))
    getDatabase().prepare('INSERT INTO clipboard_history (id,type,preview,hash,size,created_at,image_path) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), 'image', '', 'gone-hash', 10, Date.now(), join(legacy, 'images', 'gone.png'))
    chromium = randomBytes(32); wrapped = randomBytes(40)
    getDatabase().prepare("UPDATE vault_meta SET mode='safestorage', encrypted_dek=? WHERE id=1").run(sealV10(chromium, vault.getDEK()!.toString('base64')))
    writeFileSync(join(legacy, 'Local State'), JSON.stringify({ os_crypt: { encrypted_key: Buffer.concat([Buffer.from('DPAPI'), wrapped]).toString('base64') } }))
    vault.lockVault(); closeDatabase()
    hashes = Object.fromEntries(readdirSync(legacy).filter(name => !['images'].includes(name)).map(name => [name, sha(join(legacy, name))]))
    // 新版：另一个资料目录、另一把钥匙
    fixture.root = join(root, 'clipvault-workbench-preview'); mkdirSync(fixture.root); initDatabase(); vault.createVault('New-Different-Vault-Password!')
    createCredential({ name: 'Keep current', type: CredentialType.PASSWORD, value: 'CURRENT-PASSWORD-CANARY' })
  })
  afterEach(() => { vault.__resetVaultForTests(); closeDatabase(); rmSync(root, { recursive: true, force: true }) })

  it('unwraps the original key locally, merges text, credentials, TOTP and images, and leaves the original untouched', async () => {
    const profile = detectLegacyProfile(legacy)!
    expect(profile.dir).toBe(legacy)
    expect(await legacyAlreadyMerged(profile, identity => hasMergeIndex(identity), unprotect)).toBe(false)
    const prepared = await prepareLegacyImport(profile, { unprotect })
    expect(prepared).toMatchObject({ mode: 'safestorage', images: 1, missingImages: 1 })
    const source = openMergeBackup(prepared.path, undefined, prepared.key)
    const summary = source.merge()
    prepared.cleanup()
    expect(summary).toMatchObject({ clipboard: 3, credentials: 1, missingImages: 1 })
    expect(existsSync(prepared.workDir)).toBe(false)
    expect(await legacyAlreadyMerged(profile, identity => hasMergeIndex(identity), unprotect)).toBe(true)
    const credentials = listCredentials().items
    const imported = credentials.find(item => item.name === 'Original account')!
    expect(getCredentialById(imported.id)?.value).toBe('ORIGINAL-PASSWORD-CANARY')
    expect(credentials.some(item => item.name === 'Keep current')).toBe(true)
    const clips = listClipboardHistory({}, 50).items
    expect(clips.find(item => item.type === 'text')?.id && getClipboardItemById(clips.find(item => item.type === 'text')!.id)?.content).toBe('original clipboard protected content')
    const image = clips.find(item => item.type === 'image' && item.imagePath)!
    expect(readImageBytes(image.imagePath!).bytes.equals(png)).toBe(true)
    expect(readFileSync(image.imagePath!).subarray(0, 7).toString()).toBe('CVIMG01')
    for (const [name, hash] of Object.entries(hashes)) expect(sha(join(legacy, name)), name).toBe(hash)
    expect(readFileSync(join(legacy, 'images', 'shot.png')).equals(png)).toBe(true)
    // 再导入一次：全部跳过
    const again = await prepareLegacyImport(profile, { unprotect })
    try { expect(openMergeBackup(again.path, undefined, again.key).merge()).toMatchObject({ clipboard: 0, credentials: 0 }) } finally { again.cleanup() }
  })
  it('refuses a different Windows user and corrupt keys without touching the destination', async () => {
    const profile = detectLegacyProfile(legacy)!
    await expect(prepareLegacyImport(profile, { unprotect: async () => { throw new Error('无法用当前 Windows 账户解开原版资料') } })).rejects.toThrow('Windows 账户')
    await expect(legacyDek(profile, Buffer.from('v10' + 'x'.repeat(40)), unprotect)).rejects.toThrow('原版')
    expect(() => decryptV10(Buffer.from('v11abc'), chromium)).toThrow('格式')
    expect(readdirSync(fixture.root).some(name => name.startsWith('legacy-import-'))).toBe(false)
    expect(detectLegacyProfile(join(root, 'nowhere'))).toBeNull()
  })
})
