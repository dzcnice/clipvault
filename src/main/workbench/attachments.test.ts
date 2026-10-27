import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, linkSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
vi.mock('electron', () => ({ app: {} }))
import { snapshotAttachment } from './attachments'

describe('explicit attachment snapshots', () => {
  let root = ''
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cv-attachments-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })
  it('redacts known secrets and keeps a snapshot when the original later changes', async () => {
    const path = join(root, 'error.txt'); writeFileSync(path, 'Request failed: fixture-sensitive-token')
    const snapshot = await snapshotAttachment(path, ['fixture-sensitive-token'])
    writeFileSync(path, 'Changed after selection')
    expect(snapshot.text).toContain('Request failed:')
    expect(snapshot.text).not.toContain('fixture-sensitive-token')
    expect(snapshot.redacted).toBe(true)
    expect(snapshot.text).not.toContain('Changed after selection')
  })
  it('rejects credential configuration, oversized text and binary input', async () => {
    for (const filename of ['.npmrc', '.env.local', 'credentials.json', 'private.sqlite', 'vault.cvbackup']) {
      const path = join(root, filename); writeFileSync(path, 'synthetic')
      await expect(snapshotAttachment(path, [])).rejects.toThrow('敏感配置')
    }
    const large = join(root, 'large.txt'); writeFileSync(large, 'a'.repeat(100001))
    await expect(snapshotAttachment(large, [])).rejects.toThrow('100 KB')
    const binary = join(root, 'binary.txt'); writeFileSync(binary, Buffer.from([0, 255, 1]))
    await expect(snapshotAttachment(binary, [])).rejects.toThrow()
  })
  it('rejects hard links and directory junctions', async () => {
    const directory = join(root, 'real'); mkdirSync(directory)
    const path = join(directory, 'sample.txt'); writeFileSync(path, 'synthetic')
    const linked = join(root, 'hard.txt'); linkSync(path, linked)
    await expect(snapshotAttachment(linked, [])).rejects.toThrow('不能使用链接')
    const folder = join(root, 'linked'); symlinkSync(directory, folder, 'junction')
    writeFileSync(join(directory, 'ordinary.txt'), 'synthetic')
    await expect(snapshotAttachment(join(folder, 'ordinary.txt'), [])).rejects.toThrow('目录链接')
  })
})
