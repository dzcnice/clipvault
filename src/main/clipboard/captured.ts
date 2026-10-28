import { EventEmitter } from 'node:events'
import type { ClipboardItem } from '../../types'

/**
 * 每次复制落库后发出一次 'item'。OCR、截图问 AI、轻提示都订阅这里，
 * 而不是各自再挂到剪贴板监听上。
 */
export const clipboardCaptured = new EventEmitter()
clipboardCaptured.setMaxListeners(20)

export function emitCaptured(item: ClipboardItem): void {
  clipboardCaptured.emit('item', item)
}
