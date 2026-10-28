/**
 * HUD 混合数据源 · 空查询显示最近使用，有关键词时查询全库。
 * cmdk 保留导航项与拼音过滤；所有复制都由主进程执行。
 */

import { ClipboardList, FileText, KeyRound, FolderOpen, PanelsTopLeft } from 'lucide-react'
import { CredentialSortBy, SortDirection } from '@/types'
import { fuzzyMatch } from '@/utils/fuzzy-search'
import { matchScore } from '@/utils/window-match'
import type { HudCommand, HudCommandSource } from '../types'
import type { ClipboardFilter } from '@/types/clipboard'

export async function buildMixedDataCommands(query = '', filter?: ClipboardFilter): Promise<HudCommand[]> {
  const cmds: HudCommand[] = []
  if (typeof window === 'undefined' || !window.api) return cmds
  const api = window.api

  const recentCredentials = { limit: 40, sortBy: CredentialSortBy.LAST_USED, sortDir: SortDirection.DESC }
  const [credRes, clipRes, snipRes, recentRes, workRes, foreground] = await Promise.all([
    api.credential.list({
      ...recentCredentials,
      filter: query ? { keyword: query } : undefined,
    }),
    api.clipboard.getHistory({ limit: query ? 40 : 20, filter: filter ?? (query ? { keyword: query, fuzzyPreview: true } : undefined), requestKey: 'hud' }),
    api.clipboard.getSnippets(),
    query ? api.credential.list(recentCredentials) : Promise.resolve(undefined),
    api.workbench?.quickIndex?.() ?? Promise.resolve(undefined),
    api.hud?.foreground?.().catch(() => undefined) ?? Promise.resolve(undefined)
  ])
  const front = foreground?.success && foreground.data ? foreground.data : { title: '', process: '' }
  for (const result of [credRes, clipRes, snipRes, recentRes]) {
    if (result && !result.success) throw new Error(result.error || '搜索失败，请重试')
  }

  if (workRes?.success && workRes.data) {
    // 与前台窗口匹配的账号排最前（例如浏览器停在 GitHub 登录页时，GitHub 账号在第一位）。
    const ranked = workRes.data.resources.filter(resource => resource.state !== 'revoked').map(resource => ({ resource, score: matchScore(front, resource) })).sort((a, b) => b.score - a.score)
    for (const { resource, score } of ranked) {
      const searchable = [resource.name, resource.environment, resource.purpose, resource.endpoint, ...resource.aliases ?? []].join(' ')
      if (query && !fuzzyMatch(query, searchable)) continue
      const actions: HudCommand[] = []
      const run = async (request: Promise<{ success: boolean; error?: string }>): Promise<void> => { const result = await request; if (!result.success) throw new Error(result.error || '资源操作未完成') }
      const typable = resource.fields.some(field => field.role === 'username') && resource.fields.some(field => field.role === 'password')
      if (typable) actions.push({ id: `autotype:${resource.id}`, title: '自动输入', subtitle: '用户名 → Tab → 密码，不提交；验证码按 Alt+Shift+V', category: 'action', Icon: KeyRound, perform: () => run(api.workbench.autoType(resource.id)) })
      if (resource.fields.some(field => ['username', 'password', 'totp_seed'].includes(field.role ?? ''))) actions.push({ id: `sequence:${resource.id}`, title: '依次粘贴', category: 'action', perform: () => run(api.workbench.sequence(resource.id)) })
      for (const field of resource.fields) {
        actions.push({ id: `resource:${resource.id}:${field.name}`, title: `复制 ${field.role === 'totp_seed' ? '验证码' : field.name}`, subtitle: '只复制到系统剪贴板', category: 'action', Icon: KeyRound,
          perform: async () => {
            const result = await api.workbench.copyField(resource.id, field.name, resource.version)
            if (!result.success) throw new Error(result.error || '复制失败')
          } })
      }
      if (resource.loginUrl || resource.endpoint) actions.push({ id: `open:${resource.id}`, title: '打开登录页', category: 'action', perform: () => run(api.workbench.openResource(resource.id)) })
      if (resource.kind === 'account' && resource.endpoint) actions.push({ id: `login:${resource.id}`, title: '辅助登录', category: 'action', perform: () => run(api.workbench.login(resource.id)) })
      cmds.push({ id: `resource:${resource.id}`, title: resource.name, subtitle: `${score ? '匹配当前窗口 · ' : ''}资源 · ${resource.environment} · ${typable ? '回车自动输入' : '→ 取用'}`, category: 'credential', Icon: KeyRound, keywords: [query, searchable], actions,
        perform: typable ? () => run(api.workbench.autoType(resource.id)) : () => {} })
    }
    for (const project of workRes.data.projects.filter(project => !query || fuzzyMatch(query, project.name)).slice(0, 15)) cmds.push({ id: `project:${project.id}`, title: project.name, subtitle: `项目 · ${project.environment}`, category: 'navigate', Icon: FolderOpen,
      keywords: [query, project.name, '项目'], perform: async () => { await api.hud.navigate(`/workbench?project=${encodeURIComponent(project.id)}`) } })
    for (const task of workRes.data.tasks.filter(task => !query || fuzzyMatch(query, task.title)).slice(0, 15)) cmds.push({ id: `task:${task.id}`, title: task.title, subtitle: '工作台任务', category: 'navigate', Icon: PanelsTopLeft,
      keywords: [query, task.title, '任务'], perform: async () => { await api.hud.navigate(`/workbench?task=${encodeURIComponent(task.id)}`) } })
  }
  if (credRes.success && credRes.data?.items) {
    // 保留原有最近凭证的模糊/拼音能力，同时纳入服务器查到的远期结果。
    const matches = new Map(credRes.data.items.map(c => [c.id, c]))
    for (const c of recentRes?.data?.items ?? []) {
      if ([c.name, c.type, ...(c.tags ?? [])].some(value => fuzzyMatch(query, value))) matches.set(c.id, c)
    }
    for (const c of matches.values()) {
      cmds.push({
        id: `cred:${c.id}`,
        title: c.name,
        subtitle: `凭证 · ${c.type}`,
        category: 'credential',
        keywords: [
          query, c.name,
          c.type,
          '凭证',
          'credential',
          ...(c.tags ?? [])
        ],
        Icon: KeyRound,
        perform: async () => {
          const result = await api.credential.copy(c.id)
          if (!result.success) throw new Error(result.error || '复制凭证失败')
        }
      })
    }
  }
  if (clipRes.success && clipRes.data?.items) {
    for (const item of clipRes.data.items) {
      if (item.isSnippet) continue
      const preview = ['secret', 'credential'].includes(item.category || '') ? '敏感资料 · ••••••' : (item.preview || item.content || '[图片]').slice(0, 80)
      cmds.push({
        id: `clip:${item.id}`,
        title: preview,
        subtitle: `${item.isSaved ? '长期保存' : '剪贴板'} · ${item.type}`,
        category: 'clipboard',
        keywords: [query, preview, item.type, '剪贴板', 'clipboard'],
        Icon: ClipboardList,
        perform: async () => {
          const result = await api.clipboard.copyItem(item.id, { paste: true })
          if (!result.success) throw new Error(result.error || '复制失败')
        }
      })
    }
  }
  const list = snipRes?.success ? snipRes.data : null
  if (Array.isArray(list)) {
    const matched = list.filter((s) => !query
      || s.content?.toLowerCase().includes(query.toLowerCase())
      || [s.snippetName, s.preview, ...(s.tags ?? [])].some(value => value && fuzzyMatch(query, value)))
    for (const s of matched.slice(0, 40)) {
      const name = s.snippetName || s.preview || '片段'
      cmds.push({
        id: `snip:${s.id}`,
        title: name,
        subtitle: '片段',
        category: 'snippet',
        keywords: [query, name, s.preview || '', '片段', 'snippet'],
        Icon: FileText,
        perform: async () => {
          const result = await api.clipboard.copyItem(s.id, { paste: true })
          if (!result.success) throw new Error(result.error || '复制片段失败')
        }
      })
    }
  }

  return cmds
}

export const mixedDataSource: HudCommandSource = {
  id: 'mixed-data',
  label: '数据',
  // 同步测试路径返回空；运行时 loadAllCommands 走 async
  list: (query) => {
    if (typeof window === 'undefined') return []
    return buildMixedDataCommands(query)
  }
}
