/**
 * 片段全局热键（目标形态）
 *
 * - snippet.snippet_shortcut 存 Electron accelerator（如 CommandOrControl+Alt+1）
 * - 空 / 非法 → 不注册
 * - 与系统快捷键冲突时跳过并记日志
 * - 刷新：启动 + 片段 create/update/delete 后
 */

import { globalShortcut, clipboard } from 'electron'
import { logger } from '../utils/logger'
import * as clipboardStore from '../../db/clipboard-store'
import { expandSnippetVariables } from '../../utils/snippet-vars'
import { getClipboardMonitor } from '../clipboard/monitor'

const registered = new Map<string, string>() // snippetId -> accelerator

function isLikelyAccelerator(s: string): boolean {
  // 至少含 + 或功能键风格；避免把 "sig1" 当全局热键
  return /CommandOrControl|CmdOrCtrl|Ctrl|Alt|Shift|Super|Meta|Command|\+/i.test(s)
}

function expandAndCopy(snippetId: string): void {
  try {
    const item = clipboardStore.getClipboardItemById(snippetId)
    if (!item?.isSnippet) return
    const raw = item.content || item.preview || ''
    let clip = ''
    try {
      clip = clipboard.readText()
    } catch {
      clip = ''
    }
    const expanded = expandSnippetVariables(raw, { clip })
    const mon = getClipboardMonitor()
    mon.writeText(expanded)
    clipboardStore.recordClipboardUsage(snippetId)
    logger.info(`[snippet-hotkeys] fired ${snippetId}`)
  } catch (err) {
    logger.warn(`[snippet-hotkeys] fire failed: ${(err as Error).message}`)
  }
}

export function unregisterAllSnippetHotkeys(): void {
  for (const [id, acc] of registered) {
    try {
      globalShortcut.unregister(acc)
    } catch {
      /* ignore */
    }
    registered.delete(id)
  }
}

/** 从 DB 重载全部片段热键 */
export function refreshSnippetHotkeys(): void {
  unregisterAllSnippetHotkeys()
  try {
    const snippets = clipboardStore.getSnippets('personal') as Array<{
      id: string
      snippetShortcut?: string
    }>
    for (const s of snippets) {
      const acc = (s.snippetShortcut || '').trim()
      if (!acc || !isLikelyAccelerator(acc)) continue
      // 避免与已注册冲突
      if ([...registered.values()].includes(acc)) {
        logger.warn(`[snippet-hotkeys] skip duplicate accelerator ${acc} for ${s.id}`)
        continue
      }
      try {
        const ok = globalShortcut.register(acc, () => expandAndCopy(s.id))
        if (ok) {
          registered.set(s.id, acc)
        } else {
          logger.warn(`[snippet-hotkeys] register failed ${acc}`)
        }
      } catch (err) {
        logger.warn(`[snippet-hotkeys] error ${acc}: ${(err as Error).message}`)
      }
    }
    logger.info(`[snippet-hotkeys] registered ${registered.size} hotkey(s)`)
  } catch (err) {
    logger.warn(`[snippet-hotkeys] refresh failed: ${(err as Error).message}`)
  }
}

export function listSnippetHotkeys(): Array<{ id: string; accelerator: string }> {
  return [...registered.entries()].map(([id, accelerator]) => ({ id, accelerator }))
}
