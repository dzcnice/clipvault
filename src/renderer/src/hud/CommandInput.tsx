import { Command } from 'cmdk'
import { forwardRef } from 'react'
import { Search } from 'lucide-react'

interface Props {
  value: string
  onValueChange: (v: string) => void
  placeholder?: string
}

export const CommandInput = forwardRef<HTMLInputElement, Props>(function CommandInput(
  { value, onValueChange, placeholder = '搜索凭证、剪贴板或命令…' },
  ref
) {
  return (
    <div
      className="flex items-center gap-3 border-b-2 border-[var(--line)] px-3"
      style={{ background: 'var(--surface-2)' }}
    >
      <Search size={16} strokeWidth={2.5} style={{ color: 'var(--primary)' }} />
      <Command.Input
        ref={ref}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        className="font-body h-12 flex-1 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
})

export default CommandInput
