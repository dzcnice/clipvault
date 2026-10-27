import { clipboard, Notification } from 'electron'
import * as store from '../../db/workbench-store'
import { insertAuditRecord } from '../../db/credential-audit-store'
import { getClipboardMonitor } from '../clipboard/monitor'
import { clipboardAutoClear } from '../clipboard/auto-clear'
import { pasteToActiveApp } from '../clipboard/paste-active'
import { onVaultLocked } from '../crypto/vault'
import { getPrefs } from '../prefs'
import { outboundRedact } from '../workbench/redaction'
import { generateTOTP } from '../totp/generator'
import { parseOtpauthURI } from '../totp/otpauth-parser'
import type { FieldRole } from '../../types/workbench'
import type { ResourceSequenceState } from '../../types/resources'

export function resourceCode(id: string): import('../../types/totp').TOTPCode {
  const resource = store.getResource(id), field = resource.fields.find(item => item.role === 'totp_seed')
  if (!field) throw new Error('资源没有验证码种子')
  const value = store.readResourceField(id, field.name, resource.version)
  return generateTOTP(value.startsWith('otpauth://') ? parseOtpauthURI(value) : { secret: value })
}
function used(id: string, field: string): void {
  store.markResourceUsed(id)
  insertAuditRecord({ credentialId: id, action: 'copy', metadata: { source: 'resource', field } })
}
export function copyResourceField(id: string, name: string, version: number): void {
  const resource = store.getResource(id), field = resource.fields.find(item => item.name === name)
  if (resource.version !== version || !field || resource.state === 'revoked') throw new Error('资源已变化，请刷新后取用')
  const value = field.role === 'totp_seed' ? resourceCode(id).code : store.readResourceField(id, name, version)
  getClipboardMonitor().writeText(value); clipboardAutoClear.cancel()
  if (field.secret && getPrefs().autoClearTtlMs > 0) clipboardAutoClear.schedule(value, getPrefs().autoClearTtlMs)
  used(id, name)
}
interface SequenceIO { read(): string; write(value: string): void; paste(): Promise<{ ok: boolean; error?: string }>; notify(state: ResourceSequenceState): void }
export class ResourceSequence {
  private queue: Array<{ name: string; role: FieldRole }> = []
  private id = ''; private version = 0; private previous = ''; private last = ''; private expiresAt = 0
  private timer?: ReturnType<typeof setTimeout>
  private pasting = false
  private error = ''
  constructor(private readonly io: SequenceIO) {}
  state(): ResourceSequenceState { return { active: !!this.id, nextRole: this.queue[0]?.role, remaining: this.queue.length, expiresAt: this.expiresAt || undefined, error: this.error || undefined } }
  async start(id: string): Promise<ResourceSequenceState> {
    if (this.pasting) throw new Error('正在粘贴，请稍后再试')
    this.finish()
    const resource = store.getResource(id)
    if (resource.state === 'revoked') throw new Error('资源已撤销')
    const previous = this.io.read()
    this.previous = previous.length <= 100_000 && !outboundRedact(previous).redacted ? previous : ''
    this.queue = (['username', 'password', 'totp_seed'] as const).flatMap(role => { const field = resource.fields.find(item => item.role === role); return field ? [{ name: field.name, role }] : [] })
    if (!this.queue.length) throw new Error('该资源没有用户名、密码或验证码字段')
    this.id = id; this.version = resource.version; this.error = ''
    await this.next()
    return this.state()
  }
  async next(): Promise<void> {
    if (!this.id || this.pasting) return
    this.pasting = true; clearTimeout(this.timer)
    try {
      const next = this.queue[0]!
      store.readResourceField(this.id, next.name, this.version)
      this.last = next.role === 'totp_seed' ? resourceCode(this.id).code : store.readResourceField(this.id, next.name, this.version)
      this.io.write(this.last)
      const result = await this.io.paste()
      if (!result.ok) throw new Error('未能粘贴到前台应用，请返回资源页单独复制字段')
      used(this.id, next.name); this.queue.shift()
      if (!this.queue.length) this.finish()
      else { this.expiresAt = Date.now() + 60_000; this.timer = setTimeout(() => this.finish(), 60_000); this.timer.unref(); this.io.notify(this.state()) }
    } catch (error) { this.finish(); this.error = error instanceof Error ? error.message : '依次粘贴未完成'; this.io.notify(this.state()); throw new Error(this.error) }
    finally { this.pasting = false }
  }
  finish(): void {
    clearTimeout(this.timer)
    if (this.id && this.io.read() === this.last) this.io.write(this.previous)
    this.id = ''; this.queue = []; this.previous = ''; this.last = ''; this.expiresAt = 0
  }
}
export const resourceSequence = new ResourceSequence({ read: () => clipboard.readText(), write: value => { clipboardAutoClear.cancel(); getClipboardMonitor().writeText(value) }, paste: pasteToActiveApp,
  notify: state => {
    void import('../shortcuts/manager').then(({ shortcutManager }) => {
      const shortcut = shortcutManager.list().find(item => item.commandId === 'resource.pasteNext')
      const role = state.nextRole === 'password' ? '密码' : state.nextRole === 'totp_seed' ? '验证码' : '用户名'
      if (Notification.isSupported()) new Notification({ title: '依次粘贴', body: state.error || `下一项：${role} · ${shortcut?.currentAccelerator ?? 'Alt+Shift+V'} · 60 秒后结束`, silent: true }).show()
    }).catch(() => {})
  } })
onVaultLocked(() => resourceSequence.finish())
