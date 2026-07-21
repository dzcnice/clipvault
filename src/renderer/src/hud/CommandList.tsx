/**
 * HUD 命令列表（v2.0 Sprint 6 · TASK-035）
 */

import { Command } from 'cmdk'
import type { HudCommand, HudCommandCategory } from './types'
import { CommandItem } from './CommandItem'

interface Props {
  commands: HudCommand[]
  onSelect: (cmd: HudCommand) => void
}

const GROUP_LABELS: Record<HudCommandCategory, string> = {
  search: '搜索',
  navigate: '导航',
  action: '操作'
}

export function CommandList({ commands, onSelect }: Props): JSX.Element {
  const groups = new Map<HudCommandCategory, HudCommand[]>()
  for (const cmd of commands) {
    const bucket = groups.get(cmd.category) ?? []
    bucket.push(cmd)
    groups.set(cmd.category, bucket)
  }

  return (
    <Command.List className="max-h-[360px] overflow-y-auto p-2">
      <Command.Empty className="px-4 py-6 text-center text-sm opacity-60">
        未找到匹配的命令
      </Command.Empty>
      {Array.from(groups.entries()).map(([cat, items]) => (
        <Command.Group
          key={cat}
          heading={GROUP_LABELS[cat]}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:opacity-50"
        >
          {items.map((cmd) => (
            <CommandItem key={cmd.id} cmd={cmd} onSelect={onSelect} />
          ))}
        </Command.Group>
      ))}
    </Command.List>
  )
}

export default CommandList
