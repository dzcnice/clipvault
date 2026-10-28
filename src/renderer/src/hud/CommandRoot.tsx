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
import { buildMixedDataCommands } from './commands/mixed-data'
import JarvisView, { SLASH, type JarvisInput } from './JarvisView'
import { Sparkles } from 'lucide-react'

/** 看起来像在提问时，把「问 Jarvis」放在结果最前面。 */
export function looksLikeQuestion(text: string): boolean {
  const value = text.trim()
  return value.startsWith('/') || /[?？吗呢么]$/.test(value) || /^(怎么|如何|为什么|为啥|什么|哪|帮我|请|给我|写|翻译|解释|总结|改写|what|how|why|can|could|explain|translate|write)/i.test(value) || value.split(/s+/).length >= 4 || value.length >= 18
}

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
  const [aiHint, setAiHint] = useState(''), [aiRequest, setAiRequest] = useState(0)
  const [commands, setCommands] = useState<HudCommand[]>([])
  const [actions, setActions] = useState<HudCommand[]>()
  const rootRef = useRef<HTMLDivElement>(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selecting = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [jarvis, setJarvis] = useState<JarvisInput | null>(null)
  const jarvisOpen = useRef(false)
  jarvisOpen.current = !!jarvis

  useHudKeyboardNav(!jarvis)
  // Alt+Shift+S 截图后，主进程把截图交给浮窗。
  useEffect(() => window.api?.hud?.onJarvisOpen?.(input => setJarvis({ text: input.text, autoSend: input.autoSend === true, mentions: input.clipboardId ? [{ kind: 'clipboard', id: input.clipboardId, label: input.text?.includes('图') ? '截图 / 图片' : '剪贴板资料' }] : [] })), [])
  useEffect(() => { inputRef.current?.focus() }, [actions])
  useEffect(() => {
    let alive = true; setAiHint('')
    if (!value.trim() || (!aiRequest && !(value.length > 6 && /\s/.test(value))) || !window.api?.workbench?.recall) return
    const timer = setTimeout(() => { void window.api.workbench.recall(value).then(async result => { if (!alive || !result.success || !result.data?.usedAI) return; const commands = await buildMixedDataCommands(value, result.data.filter); if (alive) { setCommands(commands); setAiHint('AI 理解为：' + result.data.labels.map(item => item.text).join(' · ') + '；未发送历史内容') } }).catch(() => {}) }, 650)
    return () => { alive = false; clearTimeout(timer) }
  }, [value, revision, aiRequest])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setCommands([])
    const timer = setTimeout(() => {
      void loadAllCommands(value.trim()).then((list) => {
        if (!cancelled) setCommands(list)
      }).catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '搜索失败')
      }).finally(() => {
        if (!cancelled) setLoading(false)
      })
    }, value.trim() ? 120 : 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, revision])

  useEffect(() => {
    const api = getApi()
    if (!api) {
      inputRef.current?.focus()
      return
    }
    const offShown = api.onShown(() => {
      if (jarvisOpen.current) return
      setActions(undefined)
      setValue('')
      setRevision((v) => v + 1)
      requestAnimationFrame(() => inputRef.current?.focus())
    })
    inputRef.current?.focus()
    return () => {
      offShown()
    }
  }, [])

  const query = value.trim()
  const ask: HudCommand | null = query ? { id: 'jarvis:ask', title: `问 Jarvis：${query}`, subtitle: SLASH.find(item => query.startsWith(item.cmd))?.hint ?? '随手问 · 可联网 · 回答可直接粘贴', category: 'action', Icon: Sparkles, keywords: [query], perform: () => {} } : null
  const withAsk = !ask ? commands : looksLikeQuestion(query) ? [ask, ...commands] : [...commands, ask]
  const handleSelect = async (cmd: HudCommand): Promise<void> => {
    if (cmd.id === 'jarvis:ask') { setJarvis({ text: query, autoSend: query !== '/截图' && !SLASH.some(item => item.cmd === query) }); return }
    if (cmd.actions) { setActions(cmd.actions); return }
    if (selecting.current || loading) return
    selecting.current = true
    setBusy(true)
    setError(null)
    try {
      await cmd.perform()
      const api = getApi()
      if (api) await api.hide()
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试')
    } finally {
      selecting.current = false
      setBusy(false)
    }
  }

  return (
    <div
      ref={rootRef}
      onKeyDownCapture={event => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); setAiRequest(number => number + 1) }
        if (event.key === 'Tab' && !event.shiftKey && !actions) {
          const selected = rootRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.dataset.commandId || rootRef.current?.querySelector<HTMLElement>('[cmdk-item]')?.dataset.commandId
          const match = selected?.match(/^(clip|snip|resource):([^:]+)$/)
          if (match) { event.preventDefault(); event.stopPropagation(); setJarvis({ mentions: [{ kind: match[1] === 'resource' ? 'resource' : 'clipboard', id: match[2]!, label: rootRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.textContent?.slice(0, 40) ?? undefined }] }) }
        }
      }}
      onKeyDown={event => {
        if (!event.ctrlKey && !event.altKey && !event.metaKey && /^[1-9]$/.test(event.key) && (!value || event.target !== inputRef.current)) {
          const rows = rootRef.current?.querySelectorAll<HTMLElement>('[cmdk-item]:not([hidden])')
          const id = rows?.[Number(event.key) - 1]?.dataset.commandId
          const command = (actions ?? commands).find(item => item.id === id)
          if (command) { event.preventDefault(); event.stopPropagation(); void handleSelect(command) }
        }
        if (event.key === 'ArrowLeft' && actions) { event.preventDefault(); setActions(undefined) }
        if (event.key === 'ArrowRight' && !actions) { const id = rootRef.current?.querySelector<HTMLElement>('[cmdk-item][data-selected="true"]')?.dataset.commandId; const command = commands.find(item => item.id === id); if (command?.actions) { event.preventDefault(); setActions(command.actions) } }
      }}
      className={`cv-pop mx-auto mt-1 max-w-full overflow-hidden rounded-[16px] bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow-lg)] ${jarvis ? 'h-[calc(100vh-28px)] w-[656px]' : 'w-[520px]'}`}
    >
      {jarvis ? <JarvisView key={JSON.stringify(jarvis)} initial={jarvis} onExit={() => { setJarvis(null); void window.api?.hud?.mode?.('search'); requestAnimationFrame(() => inputRef.current?.focus()) }} /> : <Command key={actions ? 'actions' : 'search'} shouldFilter={false} label="ClipVault Command Palette" className="flex flex-col">
        {actions && <button className="cv-btn cv-btn-ghost mx-2 mt-2 w-fit !h-7 text-xs" onClick={() => setActions(undefined)}>← 返回搜索</button>}
        <CommandInput ref={inputRef} value={actions ? '' : value} onValueChange={actions ? () => {} : setValue} placeholder={actions ? '选择取用方式' : undefined} />
        {error ? <p role="alert" className="mx-3 mt-2 rounded-[9px] bg-[var(--bad-soft)] px-3 py-2 text-[13px] text-[var(--destructive)]">{error}</p> : null}
        {aiHint && <p className="mx-3 mt-2 rounded-[9px] bg-[var(--primary-soft)] px-3 py-2 text-xs text-[var(--blue)]">{aiHint}</p>}
        {loading || busy ? <p role="status" className="cv-shimmer px-4 pt-2.5 text-xs">{busy ? '正在复制…' : '搜索全部记录…'}</p> : null}
        <CommandList commands={actions ?? withAsk} onSelect={handleSelect} pending={loading || Boolean(error)} />
        <div className="flex items-center gap-3 border-t border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-2 text-[11.5px] text-[var(--ink-faint)]">
          {([['↵', '粘贴'], ['1–9', '直接选'], ['Tab', '问 Jarvis'], ['→', '更多'], ['Esc', '关闭']] as const).map(([key, label]) => <span key={label} className="flex items-center gap-1.5"><kbd className="cv-kbd">{key}</kbd>{label}</span>)}
          <span className="ml-auto font-mono">{commands.length}</span>
        </div>
      </Command>}
    </div>
  )
}

export default CommandRoot
