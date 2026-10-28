import { useState } from 'react'
import { unwrap } from '../hooks/useWorkbench'
import { Field } from './WorkbenchParts'

export default function DailyDataPanel({ busy, act }: { busy: boolean; act: <T>(action: () => Promise<T>, success?: string) => Promise<T | undefined> }): JSX.Element {
  const [password, setPassword] = useState(''), [result, setResult] = useState('')
  return <section className="cv-panel-soft space-y-3 p-4" aria-label="旧资料合并">
    <h2 className="font-semibold">把旧资料带进工作台</h2>
    <div className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[var(--surface)] p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <span className="min-w-0 flex-1 text-[13px]"><span className="block font-medium">从原版 ClipVault 导入</span><span className="text-xs text-muted-foreground">直接读取原版的资料目录（剪贴板、凭证、TOTP、图片），在本机解开；原版只读不改。原版设过主密码时填在下面的密码框。</span></span>
      <button className="cv-btn cv-btn-primary" disabled={busy} onClick={() => void act(async () => {
        const report = await unwrap(window.api.workbench.importLegacy({ password: password || undefined }))
        setPassword('')
        if (report) setResult(`已从原版导入 ${report.clipboard} 条剪贴板、${report.credentials} 条凭证、${report.images} 张图片；跳过 ${report.skipped} 条重复记录${report.missingImages ? `，${report.missingImages} 张原图缺失` : ''}。`)
      })}>自动查找并导入</button>
      <button className="cv-btn cv-btn-ghost" disabled={busy} onClick={() => void act(async () => {
        const report = await unwrap(window.api.workbench.importLegacy({ password: password || undefined, choose: true }))
        setPassword('')
        if (report) setResult(`已从原版导入 ${report.clipboard} 条剪贴板、${report.credentials} 条凭证、${report.images} 张图片；跳过 ${report.skipped} 条重复记录。`)
      })}>选择目录…</button>
    </div>
    <p className="text-xs text-muted-foreground">从完整加密备份合并剪贴板、凭证、TOTP、资源和项目。原库与当前资料都保留；任务历史和模型设置继续使用当前版本。</p>
    <Field label="旧备份密码（系统加密备份可留空）"><input className="cv-input" type="password" autoComplete="off" maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} /></Field>
    <button className="cv-btn cv-btn-secondary" disabled={busy} onClick={() => void act(async () => {
      const report = await unwrap(window.api.workbench.mergeBackup(password))
      setPassword('')
      if (report) setResult(`已合并 ${report.clipboard} 条剪贴板、${report.credentials} 条凭证、${report.resources} 条资源、${report.projects} 个项目；跳过 ${report.skipped} 条重复记录${report.missingImages ? `，${report.missingImages} 条原图缺失` : ''}。`)
    })}>选择备份并预检</button>
    {result && <p className="text-sm" role="status">{result}</p>}
    <button className="cv-btn cv-btn-ghost text-xs" disabled={busy} onClick={() => void act(async () => { const report = await unwrap(window.api.workbench.protectImages()); if (report) setResult(`已加密 ${report.converted} 张旧图；保留 ${report.retainedOriginals} 个外部或使用中的原副本；${report.failed} 张未完成。`) })}>备份并加密当前库的旧图片</button>
    <p className="text-xs text-muted-foreground">如果旧版的系统加密备份无法在此解锁，请从原应用导出带独立密码的备份，或使用原有凭证导入功能。不会尝试覆盖原资料目录。</p>
  </section>
}
