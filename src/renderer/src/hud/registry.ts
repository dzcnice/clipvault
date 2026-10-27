/**
 * HUD 命令注册中心（v2.0 Sprint 6 · TASK-033）
 */

import type { HudCommand, HudCommandSource } from './types'
import { searchSource } from './commands/search'
import { navigateSource } from './commands/navigate'
import { mixedDataSource } from './commands/mixed-data'
import { fuzzyMatch } from '@/utils/fuzzy-search'

const sources: HudCommandSource[] = [mixedDataSource, searchSource, navigateSource]

/** 汇总当前所有命令 */
export async function loadAllCommands(query = ''): Promise<HudCommand[]> {
  const lists = await Promise.all(
    sources.map(async (s) => {
      const commands = await s.list(query)
      return !query || s.id === 'mixed-data' ? commands : commands.filter(cmd => fuzzyMatch(query, [cmd.title, cmd.subtitle, ...(cmd.keywords ?? [])].join(' ')))
    })
  )
  return lists.flat()
}

/** 同步版本：用于测试/简单场景 */
export function loadAllCommandsSync(): HudCommand[] {
  const flat: HudCommand[] = []
  for (const s of sources) {
    const r = s.list()
    if (Array.isArray(r)) flat.push(...r)
  }
  return flat
}

export { sources }
