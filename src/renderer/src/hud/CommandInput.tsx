import { Command } from 'cmdk'
import { forwardRef } from 'react'
import { Search } from 'lucide-react'

interface Props {
  value: string
  onValueChange: (v: string) => void
  placeholder?: string
}

export const CommandInput = forwardRef<HTMLInputElement, Props>(function CommandInput(
  { value, onValueChange, placeholder = '搜索剪贴板、片段、资源…' },
  ref
) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--line)] px-4">
      <Search size={17} strokeWidth={1.75} className="shrink-0 text-[var(--ink-faint)]" />
      <Command.Input
        ref={ref}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        className="h-[54px] min-w-0 flex-1 bg-transparent text-[16px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
      />
    </div>
  )
})

export default CommandInput
