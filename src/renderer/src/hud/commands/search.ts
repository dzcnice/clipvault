/**
 * 搜索类命令（v2.0 Sprint 6 · TASK-034）
 *
 * 当前实现：3 条"入口命令"。用户选中后跳到对应页并聚焦搜索框；
 * 真正的搜索文本在 HUD 输入框内，点击跳转时带到主窗口即可。
 */

import { Search, SearchCode, KeySquare } from 'lucide-react'
import type { HudCommand, HudCommandSource } from '../types'

interface Sprint6APILike {
  hud: {
    navigate: (path: string) => Promise<{ success: boolean }>
  }
}

function getApi(): Sprint6APILike | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { api?: { sprint6?: Sprint6APILike } }).api
  return api?.sprint6 ?? null
}

function gotoSearch(path: string): () => Promise<void> {
  return async () => {
    const api = getApi()
    if (api) await api.hud.navigate(path)
  }
}

export function buildSearchCommands(): HudCommand[] {
  return [
    {
      id: 'search.credentials',
      title: '搜索凭证',
      subtitle: '在凭证库中查找',
      category: 'search',
      keywords: ['search', 'credential', '搜索', '凭证', '密码'],
      Icon: KeySquare,
      perform: gotoSearch('/credentials')
    },
    {
      id: 'search.clipboard',
      title: '搜索剪贴板',
      subtitle: '在剪贴板历史中查找',
      category: 'search',
      keywords: ['search', 'clipboard', '搜索', '剪贴板'],
      Icon: Search,
      perform: gotoSearch('/clipboard')
    },
    {
      id: 'search.snippets',
      title: '搜索片段',
      subtitle: '在快速片段中查找',
      category: 'search',
      keywords: ['search', 'snippet', '搜索', '片段'],
      Icon: SearchCode,
      perform: gotoSearch('/snippets')
    }
  ]
}

export const searchSource: HudCommandSource = {
  id: 'search',
  label: '搜索',
  list: () => buildSearchCommands()
}
