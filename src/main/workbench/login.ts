import { BrowserWindow, dialog, session } from 'electron'
import { randomUUID } from 'node:crypto'
import * as store from '../../db/workbench-store'

export function loginTarget(endpoint: string): URL {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('登录助手只允许没有内嵌密码的 HTTPS 地址')
  return url
}

/** Fixed implementation, never evaluate selectors or JavaScript supplied by a page/model. Does not submit. */
export function loginFillScript(username: string, password: string): string {
  return `(() => {
    const visible = e => !e.disabled && !e.readOnly && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const passwords = [...document.querySelectorAll('input[type="password"]')].filter(visible);
    if (passwords.length !== 1) return { filled: false, reason: '页面没有唯一可见密码框，请手动复制字段' };
    const password = passwords[0], scope = password.form || document;
    const users = [...scope.querySelectorAll('input')].filter(e => visible(e) && (e.autocomplete === 'username' || e.type === 'email' || (e.type === 'text' && /user|login|email|account|账号|用户名/i.test(e.name + ' ' + e.id + ' ' + e.placeholder))));
    if (${JSON.stringify(username)} && users.length !== 1) return { filled: false, reason: '无法唯一识别账号框，请手动复制字段' };
    const set = (element, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); };
    if (users.length === 1 && ${JSON.stringify(username)}) set(users[0], ${JSON.stringify(username)});
    set(password, ${JSON.stringify(password)});
    password.focus();
    return { filled: true };
  })()`
}

export async function openLoginAssistant(id: string): Promise<boolean> {
  const resource = store.getResource(id), target = loginTarget(resource.loginUrl || resource.endpoint)
  if (resource.state === 'revoked' || resource.kind !== 'account') throw new Error('请选择有效的账号资源')
  const pass = resource.fields.find(field => (field.role === 'password' || /^(password|passwd|pwd|密码)$/i.test(field.name)) && field.secret)
  const user = resource.fields.find(field => field.role === 'username' || /^(username|user|email|account|用户名|账号|邮箱)$/i.test(field.name))
  if (!pass) throw new Error('没有明确标记的密码字段，请编辑资源并使用 password 或“密码”字段名')
  const webSession = session.fromPartition(`clipvault-login-${randomUUID()}`, { cache: false })
  webSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  webSession.setPermissionCheckHandler(() => false)
  webSession.on('will-download', event => event.preventDefault())
  webSession.webRequest.onBeforeRequest((details, callback) => {
    try { const url = new URL(details.url); callback({ cancel: url.origin !== target.origin || url.protocol !== 'https:' }) }
    catch { callback({ cancel: true }) }
  })
  const window = new BrowserWindow({ width: 1050, height: 760, title: `登录助手 · ${target.hostname}`, autoHideMenuBar: true, webPreferences: {
    session: webSession, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, devTools: false
  } })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  const navigation = (event: Electron.Event, url: string): void => { try { if (new URL(url).origin !== target.origin) event.preventDefault() } catch { event.preventDefault() } }
  window.webContents.on('will-navigate', navigation)
  window.webContents.on('will-redirect', navigation)
  window.once('closed', () => { void webSession.clearStorageData().catch(() => {}) })
  try {
    await window.loadURL(target.href)
    if (window.isDestroyed()) return false
    const confirm = await dialog.showMessageBox(window, { type: 'question', title: '核对登录域名', message: `向 ${target.origin} 填入“${resource.name}”的账号和密码？`,
      detail: '请核对窗口中的网站。仅允许此域名联网，不自动提交表单；验证码与 MFA 由你完成。窗口关闭后清理本次登录会话。依赖其他域名的登录可返回资源库手动打开和复制。', buttons: ['取消填写', '确认填入此网站'], defaultId: 0, cancelId: 0 })
    if (confirm.response !== 1 || window.isDestroyed()) return false
    if (new URL(window.webContents.getURL()).origin !== target.origin) throw new Error('登录页面域名已变化，已停止填写')
    const password = store.readResourceField(id, pass.name, resource.version)
    const username = user ? store.readResourceField(id, user.name, resource.version) : ''
    const result = await window.webContents.executeJavaScriptInIsolatedWorld(1001, [{ code: loginFillScript(username, password) }]) as { filled: boolean; reason?: string }
    if (!result.filled) throw new Error(result.reason || '未能填写，请手动复制字段')
    store.markResourceUsed(id)
    return true
  } catch (error) {
    if (!window.isDestroyed()) await dialog.showMessageBox(window, { type: 'info', title: '登录助手', message: '未完成自动填写', detail: error instanceof Error && !/https?:/i.test(error.message) ? error.message : '网站加载失败或需要其他域名，请返回资源库手动打开地址并复制字段。' })
    return false
  }
}
