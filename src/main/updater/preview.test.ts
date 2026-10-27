import { describe, expect, it, vi } from 'vitest'
const updater = vi.hoisted(() => ({ checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(), on: vi.fn() }))
vi.mock('electron', () => ({ app: { isPackaged: true, getName: () => 'ClipVault Workbench Preview', getVersion: () => '3.3.0' }, shell: {} }))
vi.mock('electron-updater', () => ({ autoUpdater: updater }))
vi.mock('../utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../prefs', () => ({ getPrefs: () => ({ autoUpdateCheck: true }), setPrefs: vi.fn() }))
import { UpdaterService } from './index'

describe('independent workbench update source', () => {
  it('does not check, download or install releases belonging to the original ClipVault product', async () => {
    const service = new UpdaterService()
    service.reconfigureFromPrefs()
    expect(await service.checkForUpdates()).toBeNull()
    await expect(service.downloadUpdate()).rejects.toThrow('单独安装包')
    expect(() => service.quitAndInstall()).toThrow('单独安装包')
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    expect(service.getState().packaged).toBe(true)
  })
})
