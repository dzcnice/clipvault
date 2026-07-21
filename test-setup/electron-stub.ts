/**
 * Electron 模块 stub（仅供单测使用）
 *
 * 单测环境不存在真实的 electron 二进制，直接 require('electron') 会抛
 * "Electron failed to install correctly"。
 * 在 vitest.config.ts 的 resolve.alias 里把 'electron' 指向本 stub，
 * 让测试无需额外 vi.mock 即可安全地触及 main 进程代码。
 *
 * 已有测试的 vi.mock('electron', ...) 优先级更高，不受本 stub 影响。
 */

export const app = {
  getPath: (_name: string): string => '/tmp/clipvault-test',
  getName: (): string => 'clipvault-test',
  getVersion: (): string => '0.0.0-test',
  on: (): void => {},
  once: (): void => {},
  quit: (): void => {},
  isReady: (): boolean => true,
  whenReady: (): Promise<void> => Promise.resolve()
}

export const ipcMain = {
  on: (): void => {},
  handle: (): void => {},
  removeHandler: (): void => {},
  removeAllListeners: (): void => {}
}

export const ipcRenderer = {
  on: (): void => {},
  send: (): void => {},
  invoke: (): Promise<void> => Promise.resolve()
}

export const BrowserWindow = class {
  static getAllWindows(): unknown[] {
    return []
  }
  loadURL(): Promise<void> {
    return Promise.resolve()
  }
  on(): void {}
  webContents = { send: (): void => {} }
}

export const dialog = {
  showMessageBox: async (): Promise<{ response: number }> => ({ response: 0 }),
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: []
  }),
  showSaveDialog: async (): Promise<{ canceled: boolean; filePath?: string }> => ({
    canceled: true
  })
}

export const shell = {
  openExternal: async (): Promise<void> => undefined,
  openPath: async (): Promise<string> => ''
}

export const clipboard = {
  readText: (): string => '',
  writeText: (): void => {},
  readImage: (): unknown => ({}),
  writeImage: (): void => {},
  clear: (): void => {}
}

export const nativeImage = {
  createFromPath: (): unknown => ({}),
  createFromDataURL: (): unknown => ({}),
  createEmpty: (): unknown => ({})
}

export const Menu = {
  buildFromTemplate: (): unknown => ({ popup: (): void => {} }),
  setApplicationMenu: (): void => {}
}

export const Tray = class {
  setToolTip(): void {}
  setContextMenu(): void {}
  on(): void {}
  destroy(): void {}
}

export const globalShortcut = {
  register: (): boolean => true,
  unregister: (): void => {},
  unregisterAll: (): void => {},
  isRegistered: (): boolean => false
}

export const safeStorage = {
  isEncryptionAvailable: (): boolean => false,
  encryptString: (s: string): Buffer => Buffer.from(s),
  decryptString: (b: Buffer): string => b.toString()
}

export const screen = {
  getPrimaryDisplay: (): unknown => ({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getAllDisplays: (): unknown[] => [],
  getCursorScreenPoint: (): unknown => ({ x: 0, y: 0 })
}

export const session = {
  defaultSession: {
    on: (): void => {},
    setPermissionRequestHandler: (): void => {}
  }
}

export const powerMonitor = {
  on: (): void => {},
  getSystemIdleTime: (): number => 0
}

export const Notification = class {
  show(): void {}
  on(): void {}
}

export default {
  app,
  ipcMain,
  ipcRenderer,
  BrowserWindow,
  dialog,
  shell,
  clipboard,
  nativeImage,
  Menu,
  Tray,
  globalShortcut,
  safeStorage,
  screen,
  session,
  powerMonitor,
  Notification
}
