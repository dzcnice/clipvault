import { useEffect, useState } from 'react'
import { Check, Keyboard, Sparkles, UserRound } from 'lucide-react'
import { unwrap } from '../hooks/useWorkbench'

type Settings = { about: string; aboutLimit: number; hints: { error: boolean; image: boolean; credential: boolean; translate: boolean } }
const HINTS: Array<{ key: keyof Settings['hints']; label: string; hint: string }> = [
  { key: 'error', label: '复制报错时', hint: '提示「问 Jarvis 怎么修」' },
  { key: 'image', label: '截图后', hint: '提示「问这张图」' },
  { key: 'credential', label: '复制账号串或密钥时', hint: '提示「存为资源」' },
  { key: 'translate', label: '复制长段英文时', hint: '提示「翻译」' }
]
const KEYS: Array<[string, string]> = [
  ['Alt Space', '浮窗：搜索粘贴，输入问题回车直接问 Jarvis'], ['Alt Shift S', '框选截图，交给 Jarvis 看图'], ['Alt Shift V', '依次粘贴下一个账号字段 / 验证码'],
  ['Ctrl Space', '显示或隐藏主窗口'], ['Tab（浮窗里）', '把选中的剪贴板或资源交给 Jarvis'], ['Alt Enter（浮窗里）', '把 Jarvis 的回答粘贴回刚才的窗口']
]

export default function JarvisSettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings>(), [about, setAbout] = useState(''), [saved, setSaved] = useState(false), [error, setError] = useState('')
  useEffect(() => { void window.api.workbench.jarvisSettings().then(result => { if (result.success && result.data) { setSettings(result.data); setAbout(result.data.about) } else setError(result.error || '读取失败') }) }, [])
  const save = async (input: { about?: string; hints?: Partial<Settings['hints']> }): Promise<void> => {
    setError('')
    try { const next = await unwrap(window.api.workbench.saveJarvisSettings(input)); setSettings(next); if (input.about !== undefined) { setAbout(next.about); setSaved(true); setTimeout(() => setSaved(false), 1600) } }
    catch (err) { setError(err instanceof Error ? err.message : '保存失败') }
  }
  return <div className="flex h-full min-w-0 flex-col">
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--line)] pl-6 pr-3">
      <span className="cv-jarvis-orb !h-[18px] !w-[18px]" aria-hidden /><h1 className="text-[14px] font-medium tracking-[-.01em]">Jarvis</h1>
      <p className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-faint)]">常驻身边的助手：记住你的偏好，在你复制和截图时搭把手。</p>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto p-6"><div className="max-w-2xl space-y-6">
      {error && <p role="alert" className="rounded-[10px] bg-[var(--bad-soft)] px-3.5 py-2.5 text-[13px] text-[var(--destructive)]">{error}</p>}
      <section className="cv-rise rounded-[16px] p-5 shadow-[inset_0_0_0_1px_var(--line)]">
        <h2 className="flex items-center gap-2 text-[14px] font-medium"><UserRound size={15} strokeWidth={1.75} />关于我</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--ink-faint)]">写下希望 Jarvis 一直记得的事：怎么称呼你、常用语言、技术栈、回答风格。加密保存在本机，每次对话作为背景发给模型；不要写密码或密钥。Jarvis 提议记住的内容也会在你批准后出现在这里。</p>
        <textarea aria-label="关于我" rows={7} maxLength={settings?.aboutLimit ?? 4000} value={about} onChange={event => setAbout(event.target.value)} placeholder={'例如：\n- 叫我主人\n- 默认用中文回答，技术术语保留英文\n- 主要写 TypeScript / Electron，Windows 环境'}
          className="cv-input mt-3 min-h-[150px] w-full resize-y font-sans leading-relaxed" />
        <div className="mt-2 flex items-center gap-3"><button className="cv-btn cv-btn-primary" disabled={!settings || about === settings.about} onClick={() => void save({ about })}>{saved ? <><Check size={14} strokeWidth={2.2} />已保存</> : '保存'}</button><span className="ml-auto font-mono text-xs text-[var(--ink-faint)]">{about.length}/{settings?.aboutLimit ?? 4000}</span></div>
      </section>
      <section className="cv-rise rounded-[16px] p-5 shadow-[inset_0_0_0_1px_var(--line)]" style={{ '--i': 1 } as React.CSSProperties}>
        <h2 className="flex items-center gap-2 text-[14px] font-medium"><Sparkles size={15} strokeWidth={1.75} />轻提示</h2>
        <p className="mt-1 text-[12.5px] text-[var(--ink-faint)]">只在你自己复制或截图之后出现，同类 30 秒内最多一次；不会在后台截屏，也不会自动发给模型。</p>
        <div className="mt-3 divide-y divide-[var(--line)]">{HINTS.map(item => <label key={item.key} className="flex cursor-pointer items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1"><span className="block text-[13.5px]">{item.label}</span><span className="text-xs text-[var(--ink-faint)]">{item.hint}</span></span>
          <input type="checkbox" role="switch" aria-label={item.label} className="h-4 w-4 accent-[var(--blue)]" disabled={!settings} checked={settings?.hints[item.key] ?? false} onChange={event => void save({ hints: { [item.key]: event.target.checked } })} />
        </label>)}</div>
      </section>
      <section className="cv-rise rounded-[16px] p-5 shadow-[inset_0_0_0_1px_var(--line)]" style={{ '--i': 2 } as React.CSSProperties}>
        <h2 className="flex items-center gap-2 text-[14px] font-medium"><Keyboard size={15} strokeWidth={1.75} />随时叫它</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[13px]">{KEYS.map(([key, text]) => <div key={key} className="contents"><dt><kbd className="cv-kbd">{key}</kbd></dt><dd className="text-[var(--ink-soft)]">{text}</dd></div>)}</dl>
        <p className="mt-3 text-xs text-[var(--ink-faint)]">快捷键被其他软件占用时，可以在设置的快捷键里改。</p>
      </section>
    </div></div>
  </div>
}
