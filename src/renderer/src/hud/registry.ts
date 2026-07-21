/**
 * HUD 命令注册中心（v2.0 Sprint 6 · TASK-033）
 */

import type { HudCommand, HudCommandSource } from './types'
import { searchSource } from './commands/search'
import { navigateSource } from './commands/navigate'
import { mixedDataSource } from './commands/mixed-data'

const sources: HudCommandSource[] = [mixedDataSource, searchSource, navigateSource]

/** 汇总当前所有命令 */
export async function loadAllCommands(): Promise<HudCommand[]> {
  const lists = await Promise.all(
    sources.map(async (s) => {
      try {
        return await s.list()
      } catch {
        return []
      }
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
