import { shell } from 'electron'
import { clipboardCaptured } from '../clipboard/captured'
import type { ClipboardItem } from '../../types'

/** 等待系统截图落进剪贴板的最长时间。 */
export const CAPTURE_TIMEOUT_MS = 60_000
let pending: Promise<string | null> | null = null

/**
 * 截图问 AI：调起 Windows 自带的框选截图（与 Win+Shift+S 相同），
 * 等待下一张图片进入剪贴板历史，返回该记录 ID；取消或超时返回 null。
 * 截图只走用户自己的框选动作，不在后台截屏。
 */
export function captureScreenRegion(open: (url: string) => Promise<void> = url => shell.openExternal(url), timeoutMs = CAPTURE_TIMEOUT_MS): Promise<string | null> {
  if (pending) return pending
  const started = Date.now() - 500
  pending = new Promise<string | null>(resolve => {
    const finish = (value: string | null): void => { clearTimeout(timer); clipboardCaptured.off('item', onItem); pending = null; resolve(value) }
    const onItem = (item: ClipboardItem): void => { if (item.type === 'image' && (item.lastCopiedAt ?? item.createdAt) >= started) finish(item.id) }
    clipboardCaptured.on('item', onItem)
    const timer = setTimeout(() => finish(null), timeoutMs)
    open(process.platform === 'win32' ? 'ms-screenclip:' : '').catch(() => finish(null))
  })
  return pending
}
