/**
 * HUD · 像素命令板（CSS 入场，无 framer-motion）
 */

import { Command } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import { loadAllCommands } from './registry'
import type { HudCommand } from './types'
import { CommandInput } from './CommandInput'
import { CommandList } from './CommandList'
import { useHudKeyboardNav } from './useKeyboardNav'

interface HudAPILike {
  hide: () => Promise<{ success: boolean }>
  onShown: (cb: () => void) => () => void
  onHidden: (cb: () => void) => () => void
}

function getApi(): HudAPILike | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { api?: { hud?: HudAPILike } }).api?.hud ?? null
}

export function CommandRoot(): JSX.Element {
  const [value, setValue] = useState('')
  const [commands, setCommands] = useState<HudCommand[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useHudKeyboardNav(true)

  useEffect(() => {
    let cancelled = false
    void loadAllCommands().then((list) => {
      if (!cancelled) setCommands(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const api = getApi()
    if (!api) {
      inputRef.current?.focus()
      return
    }
    const offShown = api.onShown(() => {
      setValue('')
      requestAnimationFrame(() => inputRef.current?.focus())
    })
    inputRef.current?.focus()
    return () => {
      offShown()
    }
  }, [])

  const handleSelect = async (cmd: HudCommand): Promise<void> => {
    try {
      await cmd.perform()
    } finally {
      const api = getApi()
      if (api) await api.hide()
    }
  }

  return (
    <div
      className="mx-auto mt-10 w-[620px] animate-fadeIn overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: '3px solid var(--line)',
        boxShadow: 'var(--px-shadow)',
        color: 'var(--ink)'
      }}
    >
      <Command shouldFilter={true} label="ClipVault Command Palette" className="flex flex-col">
        <CommandInput ref={inputRef} value={value} onValueChange={setValue} />
        <CommandList commands={commands} onSelect={handleSelect} />
        <div
          className="flex items-center justify-between border-t-2 border-[var(--line)] px-3 py-2 font-mono text-[10px] text-muted-foreground"
          style={{ background: 'var(--surface-2)' }}
        >
          <span>↑↓ 选择 · Enter · Esc</span>
          <span className="font-mono-num">{commands.length}</span>
        </div>
      </Command>
    </div>
  )
}

export default CommandRoot
