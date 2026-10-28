import type { ClipboardItem } from '../../types'
import type { JarvisHints } from '../prefs'

export type HintKind = keyof JarvisHints
export interface JarvisHint { kind: HintKind; clipboardId: string; title: string; action: string; prompt?: string }

/** 同类提示 30 秒内只出一次，任意提示之间至少隔 8 秒：主动，但不打扰。 */
export const HINT_LIMITS = { sameKindMs: 30_000, anyMs: 8_000 }
const OWN_APPS = /^(clipvault|clipvault workbench preview|electron)$/i

/** 根据刚复制的内容决定要不要给一个可点的建议；只看本机分类，不调用模型。 */
export function hintFor(item: ClipboardItem, enabled: JarvisHints): JarvisHint | null {
  if (item.decryptError || item.isSnippet || item.isSaved || OWN_APPS.test(item.sourceApp ?? '')) return null
  const base = { clipboardId: item.id }
  if (enabled.credential && (item.category === 'credential' || item.category === 'secret')) return { ...base, kind: 'credential', title: '这像是账号或密钥', action: '存为资源' }
  if (enabled.image && item.type === 'image') return { ...base, kind: 'image', title: '截图已保存', action: '问这张图', prompt: '这张图里有什么？请帮我解读' }
  if (enabled.error && item.category === 'error') return { ...base, kind: 'error', title: '复制了一段报错', action: '问 Jarvis 怎么修', prompt: '这段报错是什么原因？给出最可能的修复步骤' }
  const text = item.content ?? ''
  if (enabled.translate && item.category === 'text' && text.length >= 120 && text.split(/\s+/).length >= 15 && (text.match(/[A-Za-z]/g)?.length ?? 0) / text.length > 0.6)
    return { ...base, kind: 'translate', title: '一段较长的英文', action: '翻译', prompt: '把引用的内容翻译成中文，保留原有格式，只输出译文。' }
  return null
}

export class HintGate {
  private last = new Map<HintKind, number>()
  private any = 0
  allow(kind: HintKind, now = Date.now()): boolean {
    if (now - this.any < HINT_LIMITS.anyMs || now - (this.last.get(kind) ?? 0) < HINT_LIMITS.sameKindMs) return false
    this.any = now; this.last.set(kind, now)
    return true
  }
}

/** 订阅复制事件并投递提示：主窗口在前台时走窗口内的灵动岛，否则走静默系统通知。 */
export function startJarvisHints(getMain: () => import('electron').BrowserWindow | null): () => void {
  const gate = new HintGate()
  const onItem = (item: ClipboardItem): void => {
    void (async () => {
      const [{ getPrefs }, { Notification }] = await Promise.all([import('../prefs'), import('electron')])
      const hint = hintFor(item, getPrefs().jarvisHints)
      if (!hint || !gate.allow(hint.kind)) return
      const main = getMain()
      if (main && !main.isDestroyed() && main.isVisible() && main.isFocused()) { main.webContents.send('jarvis:hint', hint); return }
      if (!Notification.isSupported()) return
      const notice = new Notification({ title: `Jarvis · ${hint.title}`, body: `点这里${hint.action}`, silent: true })
      notice.on('click', () => { void performHint(hint, getMain) })
      notice.show()
    })().catch(() => {})
  }
  void import('../clipboard/captured').then(({ clipboardCaptured }) => clipboardCaptured.on('item', onItem))
  return () => { void import('../clipboard/captured').then(({ clipboardCaptured }) => clipboardCaptured.off('item', onItem)) }
}

/** 点了系统通知：账号串去收件箱存为资源，其余交给 Jarvis 浮窗直接问。 */
export async function performHint(hint: JarvisHint, getMain: () => import('electron').BrowserWindow | null): Promise<void> {
  const main = getMain()
  if (hint.kind === 'credential') { if (main && !main.isDestroyed()) { main.show(); main.focus(); main.webContents.send('navigate', '/inbox') } return }
  const { openJarvisWith } = await import('./panel')
  if (openJarvisWith({ clipboardId: hint.clipboardId, text: hint.prompt, autoSend: true })) return
  if (main && !main.isDestroyed()) { main.show(); main.focus(); main.webContents.send('jarvis:hint', hint) }
}
