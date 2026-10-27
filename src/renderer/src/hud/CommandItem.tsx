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
      data-command-id={cmd.id}
      value={`${cmd.title} ${cmd.subtitle ?? ''} ${kw} ${titleInitials}`}
      onSelect={() => onSelect(cmd)}
      className="group flex h-11 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] transition-colors duration-150 data-[selected=true]:bg-[var(--primary-soft)] data-[selected=true]:shadow-[inset_0_0_0_1px_var(--blue-line)]"
    >
      {Icon ? (
        <span className="cv-icon-slot !h-7 !w-7">
          <Icon className="h-[14px] w-[14px]" strokeWidth={1.75} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[var(--ink)]">{cmd.title}</span>
        {cmd.subtitle ? (
          <span className="truncate text-[11.5px] text-[var(--ink-faint)]">
            {cmd.subtitle}
          </span>
        ) : null}
      </div>
      {cmd.shortcut ? (
        <kbd className="cv-kbd ml-2 opacity-60 group-data-[selected=true]:opacity-100">{cmd.shortcut}</kbd>
      ) : null}
    </Command.Item>
  )
}

export default CommandItem
