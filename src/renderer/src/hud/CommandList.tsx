/**
 * HUD 命令列表（v2.0 Sprint 6 · TASK-035）
 */

import { Command } from 'cmdk'
import type { HudCommand, HudCommandCategory } from './types'
import { CommandItem } from './CommandItem'

interface Props {
  commands: HudCommand[]
  onSelect: (cmd: HudCommand) => void
  pending?: boolean
}

const GROUP_LABELS: Record<HudCommandCategory, string> = {
  search: '搜索',
  navigate: '导航',
  action: '操作',
  credential: '片段与资源',
  clipboard: '最近复制',
  snippet: '片段'
}

export function CommandList({ commands, onSelect, pending = false }: Props): JSX.Element {
  const groups = new Map<HudCommandCategory, HudCommand[]>()
  const order: HudCommandCategory[] = ['clipboard', 'snippet', 'credential', 'search', 'action', 'navigate']
  let number = 0
  for (const cmd of commands) {
    const bucket = groups.get(cmd.category) ?? []
    bucket.push(cmd)
    groups.set(cmd.category, bucket)
  }

  return (
    <Command.List className="max-h-[330px] overflow-y-auto p-1.5">
      {!pending ? <Command.Empty className="px-4 py-10 text-center text-[13px] text-[var(--ink-faint)]">
        未找到匹配的命令
      </Command.Empty> : null}
      {Array.from(groups.entries()).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([cat, items]) => (
        <Command.Group
          key={cat}
          heading={GROUP_LABELS[cat]}
          className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-[var(--ink-faint)]"
        >
          {items.map((cmd) => (
            <CommandItem key={cmd.id} cmd={{ ...cmd, shortcut: ++number <= 9 ? String(number) : cmd.shortcut }} onSelect={onSelect} />
          ))}
        </Command.Group>
      ))}
    </Command.List>
  )
}

export default CommandList
