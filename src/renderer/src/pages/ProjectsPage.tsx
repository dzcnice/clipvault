import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Plus } from 'lucide-react'
import type { ProjectInput } from '@/types/workbench'
import { useWorkbench, unwrap } from '../hooks/useWorkbench'
import { Field, WorkbenchFrame } from '../components/WorkbenchParts'

const blank: ProjectInput = { name: '', directory: '', environment: 'development', description: '' }
export default function ProjectsPage(): JSX.Element {
  const work = useWorkbench(), [form, setForm] = useState<ProjectInput>(blank)
  const change = (key: keyof ProjectInput, value: string): void => setForm(old => ({ ...old, [key]: value }))
  return <WorkbenchFrame title="项目" description="让目录、环境、资料和任务保持对应。" {...work}>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
      <div className="space-y-3">
        {!work.data?.projects.length && <div className="cv-panel-soft p-6"><FolderOpen size={28} className="mb-3" /><h2 className="font-semibold">添加你的第一个代码项目</h2><p className="mt-2 text-sm text-muted-foreground">选择具体项目目录，给它起个名字。工作台会把任务和资源归到这里。</p></div>}
        {work.data?.projects.map(project => <article key={project.id} className="cv-panel-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{project.name}</h2><span className="cv-badge">{project.environment}</span></div>
          <p className="my-3 break-all font-mono text-xs text-muted-foreground">{project.directory}</p>
          <p className="mb-4 whitespace-pre-wrap text-sm">{project.description || '尚未填写项目说明'}</p>{project.preanalysis && <p className="mb-3 text-xs text-[var(--blue)]">已开启报错预分析（只读、后台）</p>}{project.web && <p className="mb-3 text-xs text-[var(--blue)]">已允许联网查资料</p>}
          <div className="flex flex-wrap gap-2"><Link to="/sessions" state={{ projectId: project.id }} className="cv-btn cv-btn-primary">新会话</Link><button className="cv-btn cv-btn-secondary" onClick={() => setForm(project)}>编辑项目</button></div>
        </article>)}
      </div>
      <form className="cv-panel-soft space-y-4 self-start p-5" onSubmit={event => { event.preventDefault(); void work.act(async () => { await unwrap(window.api.workbench.saveProject(form)); setForm(blank) }, '项目已保存') }}>
        <h2 className="flex items-center gap-2 font-semibold"><Plus size={16} />{form.id ? '编辑项目' : '新建项目'}</h2>
        <Field label="项目名称"><input required maxLength={120} className="cv-input" value={form.name} onChange={event => change('name', event.target.value)} placeholder="例如：我的 AI 编程工作台" /></Field>
        <Field label="代码目录"><div className="flex gap-2"><input required className="cv-input min-w-0" readOnly value={form.directory} placeholder="选择项目文件夹" /><button type="button" className="cv-btn cv-btn-secondary shrink-0" disabled={work.busy} onClick={() => void work.act(async () => { const path = await unwrap(window.api.workbench.chooseDirectory()); if (path) change('directory', path) })}>选择</button></div></Field>
        <Field label="环境"><input required maxLength={40} className="cv-input" value={form.environment} onChange={event => change('environment', event.target.value)} placeholder="development / staging / production" /></Field>
        <Field label="项目说明"><textarea rows={3} maxLength={4000} className="cv-input" value={form.description} onChange={event => change('description', event.target.value)} placeholder="这个项目做什么，有哪些约定？" /></Field>
        <label className="flex cursor-pointer items-start gap-3 rounded-[12px] p-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--blue)]" checked={form.preanalysis === true} onChange={event => setForm(old => ({ ...old, preanalysis: event.target.checked }))} />
          <span className="text-[13px] leading-relaxed"><span className="font-medium">复制报错时自动预分析</span>
            <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">开启后，复制到本项目的报错会在后台用只读权限先分析一遍，结论放进收件箱。会把脱敏后的报错和相关代码发给模型；每次最多 6 次请求、3 分钟，每天最多 10 次；不修改文件、不运行命令。默认关闭。</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-[12px] p-3 shadow-[inset_0_0_0_1px_var(--line)]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--blue)]" checked={form.web === true} onChange={event => setForm(old => ({ ...old, web: event.target.checked }))} />
          <span className="text-[13px] leading-relaxed"><span className="font-medium">允许联网查资料</span>
            <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">开启后，本项目的会话可以搜索和读取公开网页（由本应用代为访问，拒绝局域网和本机地址，网址里出现已保存的密钥会被拦下）。网页内容只作资料，不当作指令。默认关闭。</span></span>
        </label>
        <div className="flex gap-2"><button className="cv-btn cv-btn-primary" disabled={work.busy || !form.directory}>保存项目</button>{form.id && <button type="button" className="cv-btn cv-btn-secondary" onClick={() => setForm(blank)}>取消编辑</button>}</div>
      </form>
    </div>
  </WorkbenchFrame>
}
