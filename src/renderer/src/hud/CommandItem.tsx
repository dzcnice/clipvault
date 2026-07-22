import { Command } from 'cmdk'
import type { HudCommand } from './types'
import { toPinyinInitials } from '@/utils/fuzzy-search'

interface Props {
  cmd: HudCommand
  onSelect: (cmd: HudCommand) => void
}

export function CommandItem({ cmd, onSelect }: Props): JSX.Element {
  const { Icon } = cmd
  const titleInitials = toPinyinInitials(cmd.title)
  const kw = (cmd.keywords ?? []).join(' ')
  return (
    <Command.Item
      value={`${cmd.title} ${cmd.subtitle ?? ''} ${kw} ${titleInitials}`}
      onSelect={() => onSelect(cmd)}
      className="flex cursor-pointer items-center gap-3 border-2 border-transparent px-3 py-2.5 text-sm data-[selected=true]:border-[var(--line)] data-[selected=true]:bg-[var(--primary-soft)]"
    >
      {Icon ? (
        <span className="cv-icon-slot !h-8 !w-8">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-body truncate font-semibold text-foreground">{cmd.title}</span>
        {cmd.subtitle ? (
          <span className="font-mono truncate text-[10px] text-muted-foreground">
            {cmd.subtitle}
          </span>
        ) : null}
      </div>
      {cmd.shortcut ? (
        <kbd className="cv-badge ml-2 font-mono text-[10px]">{cmd.shortcut}</kbd>
      ) : null}
    </Command.Item>
  )
}

export default CommandItem
