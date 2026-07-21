/**
 * 搜索 · 像素输入
 */

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { useRegisterGlobalSearch } from '../hooks/useGlobalSearch'

interface SearchBarProps {
  placeholder?: string
  value: string
  onChange: (value: string) => void
  debounceMs?: number
  registerGlobal?: boolean
}

export default function SearchBar({
  placeholder = '搜索...',
  value,
  onChange,
  debounceMs = 300,
  registerGlobal = true
}: SearchBarProps): JSX.Element {
  const [localValue, setLocalValue] = useState(value)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useRegisterGlobalSearch(registerGlobal, inputRef)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = e.target.value
    setLocalValue(newValue)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      onChange(newValue)
    }, debounceMs)
  }

  const handleClear = (): void => {
    setLocalValue('')
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={2.5}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--primary)' }}
      />
      <input
        ref={inputRef}
        type="search"
        className="cv-input pl-9 pr-9"
        placeholder={placeholder}
        value={localValue}
        onChange={handleChange}
        aria-label={placeholder}
      />
      {localValue ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 border-2 border-[var(--line)] bg-[var(--surface-2)] p-0.5"
          aria-label="清除搜索"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  )
}
