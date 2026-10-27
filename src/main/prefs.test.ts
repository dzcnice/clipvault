import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const state = vi.hoisted(() => ({ userData: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.userData } }))
vi.mock('./utils/logger', () => ({ logger: { warn: vi.fn() } }))
let root = ''
beforeEach(() => {
  vi.resetModules()
  root = mkdtempSync(join(tmpdir(), 'clipvault-prefs-test-'))
  state.userData = join(root, 'user-data')
})
afterEach(() => {
  if (resolve(root).startsWith(resolve(tmpdir()) + sep) && root.includes('clipvault-prefs-test-')) rmSync(root, { recursive: true, force: true })
})
describe('M1 retention preferences', () => {
  it('preserves existing preferences while persisting and normalizing retention fields', async () => {
    mkdirSync(state.userData)
    writeFileSync(join(state.userData, 'clipvault-prefs.json'), JSON.stringify({ imagePasteMode: 'path', maxHistorySize: 900, excludedApps: ['Editor'] }))
    const { getPrefs, setPrefs } = await import('./prefs')
    expect(getPrefs()).toMatchObject({ imagePasteMode: 'path', maxHistorySize: 900, historyRetentionDays: 0, imageRetentionDays: 30 })
    setPrefs({ historyRetentionDays: 7, imageRetentionDays: 0, historyMaxSizeMb: 128 })
    const persisted = JSON.parse(readFileSync(join(state.userData, 'clipvault-prefs.json'), 'utf8'))
    expect(persisted).toMatchObject({ imagePasteMode: 'path', maxHistorySize: 900, excludedApps: ['Editor'], historyRetentionDays: 7, imageRetentionDays: 0, historyMaxSizeMb: 128 })
    expect(setPrefs({ historyRetentionDays: -1, imageRetentionDays: Infinity })).toMatchObject({ historyRetentionDays: 0, imageRetentionDays: 30 })
  })
  it('fails visibly and retains cached preferences if persistence fails', async () => {
    const { getPrefs, setPrefs } = await import('./prefs')
    expect(getPrefs().historyRetentionDays).toBe(0)
    writeFileSync(state.userData, 'fixture blocks directory')
    expect(() => setPrefs({ historyRetentionDays: 1 })).toThrow('保存偏好失败')
    expect(getPrefs().historyRetentionDays).toBe(0)
  })
})
