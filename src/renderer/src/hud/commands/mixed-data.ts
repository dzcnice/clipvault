/**
 * HUD 混合数据源 · 最近凭证 / 剪贴板 / 片段
 * 供 cmdk 本地过滤 + Enter 复制
 */

import { ClipboardList, FileText, KeyRound } from 'lucide-react'
import type { HudCommand, HudCommandSource } from '../types'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* ignore */
  }
}

async function hideHud(): Promise<void> {
  try {
    const api = (
      window as unknown as {
        api?: { hud?: { hide?: () => Promise<unknown> } }
      }
    ).api
    await api?.hud?.hide?.()
  } catch {
    /* ignore */
  }
}

export async function buildMixedDataCommands(): Promise<HudCommand[]> {
  const cmds: HudCommand[] = []
  if (typeof window === 'undefined' || !window.api) return cmds
  const api = window.api

  try {
    const credRes = await api.credential.list({
      limit: 40,
      sortBy: 'last_used' as never,
      sortDir: 'desc' as never
    })
    if (credRes.success && credRes.data?.items) {
      for (const c of credRes.data.items) {
        cmds.push({
          id: `cred:${c.id}`,
          title: c.name,
          subtitle: `凭证 · ${c.type}`,
          category: 'credential',
          keywords: [
            c.name,
            c.type,
            '凭证',
            'credential',
            ...(c.tags ?? []),
            // 拼音首字母由 fuzzy 在 title 上匹配；关键词补英文缩写
            c.name
              .split('')
              .map((ch) => ch)
              .join('')
          ],
          Icon: KeyRound,
          perform: async () => {
            await api.credential.copy(c.id)
            await hideHud()
          }
        })
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const clipRes = await api.clipboard.getHistory({ limit: 40 })
    if (clipRes.success && clipRes.data?.items) {
      for (const item of clipRes.data.items) {
        if (item.isSnippet) continue
        const preview = (item.preview || item.content || '[图片]').slice(0, 80)
        cmds.push({
          id: `clip:${item.id}`,
          title: preview,
          subtitle: `剪贴板 · ${item.type}`,
          category: 'clipboard',
          keywords: [preview, item.type, '剪贴板', 'clipboard'],
          Icon: ClipboardList,
          perform: async () => {
            await api.clipboard.copyItem(item.id)
            await hideHud()
          }
        })
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const snipRes = await api.clipboard.getSnippets?.()
    const list = snipRes?.success ? snipRes.data : null
    if (Array.isArray(list)) {
      for (const s of list.slice(0, 30)) {
        const name = s.snippetName || s.preview || '片段'
        cmds.push({
          id: `snip:${s.id}`,
          title: name,
          subtitle: '片段',
          category: 'snippet',
          keywords: [name, s.preview || '', '片段', 'snippet'],
          Icon: FileText,
          perform: async () => {
            const text = s.content || s.preview || ''
            // 简单变量展开（与主窗口片段一致）
            const { expandSnippetVariables } = await import('@/utils/snippet-vars')
            await copyText(expandSnippetVariables(text))
            await hideHud()
          }
        })
      }
    }
  } catch {
    /* ignore */
  }

  return cmds
}

export const mixedDataSource: HudCommandSource = {
  id: 'mixed-data',
  label: '数据',
  // 同步测试路径返回空；运行时 loadAllCommands 走 async
  list: () => {
    if (typeof window === 'undefined') return []
    return buildMixedDataCommands()
  }
}
