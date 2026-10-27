import { randomUUID } from 'node:crypto'
import { getDatabase } from '../../db/connection'
import * as vault from '../crypto/vault'
import * as store from '../../db/workbench-store'
import { boundedText } from './input'
import { redactForOutput as redactInput } from './redaction'
import type { TaskTemplate } from '../../types/workbench'

export const DEFAULT_TEMPLATES: TaskTemplate[] = [
  { id: 'fix', name: '定位并修复报错', prompt: '读取本次报错和相关代码，先定位原因，再给出最小必要修改，保护现有未提交内容。', acceptance: '复现原问题，运行相关测试，说明修改文件、验证结果和未验证范围。' },
  { id: 'review', name: '审查代码与安全边界', prompt: '检查当前项目的实际代码，重点寻找可复现的正确性、数据保护和安全问题，按影响排序。先审查，不直接改文件。', acceptance: '每个发现包含文件位置、触发条件、影响和建议；没有证据的问题标为待确认。' },
  { id: 'api', name: '排查 API 与环境配置', prompt: '核对项目请求代码和本次授权资源的环境、端点及字段，使用受控接口验证排查连接问题，不回显任何密钥。', acceptance: '明确区分网络连通与业务响应匹配；需要改文件时展示差异，获准后验证。' }
]
export function templates(): TaskTemplate[] {
  const row = getDatabase().prepare("SELECT data FROM wb_settings WHERE key='task-templates'").get() as { data: string } | undefined
  return [...DEFAULT_TEMPLATES.map(item => ({ ...item, builtIn: true })), ...(row ? JSON.parse(vault.decryptWithDEK(row.data)) as TaskTemplate[] : [])]
}
export function saveTemplate(input: Omit<TaskTemplate, 'id'>): TaskTemplate {
  const custom = templates().filter(item => !DEFAULT_TEMPLATES.some(value => value.id === item.id))
  if (custom.length >= 30) throw new Error('最多保存 30 个自定义模板')
  const secrets = store.resourceSecrets(store.listResources().map(resource => resource.id))
  const clean = (text: string): string => redactInput(text, secrets).text
  const item = { id: randomUUID(), name: clean(boundedText(input.name, '模板名称', 80, true)), prompt: clean(boundedText(input.prompt, '任务目标', 50_000, true)), acceptance: clean(boundedText(input.acceptance, '验收标准', 4000)) }
  getDatabase().prepare("INSERT INTO wb_settings (key,data) VALUES ('task-templates',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(vault.encryptWithDEK(JSON.stringify([...custom, item])))
  return item
}
export function deleteTemplate(id: string): void {
  boundedText(id, '模板 ID', 100, true)
  if (DEFAULT_TEMPLATES.some(item => item.id === id)) throw new Error('内置模板不能删除')
  const custom = templates().filter(item => !item.builtIn && item.id !== id)
  getDatabase().prepare("INSERT INTO wb_settings (key,data) VALUES ('task-templates',?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(vault.encryptWithDEK(JSON.stringify(custom)))
}
export function taskHandoff(id: string): string {
  const { task, runs, changes, events } = store.getTaskDetail(id)
  const sections = [
    '# 编程任务上下文', `项目：${store.getProject(task.projectId).name}\n环境：${task.environment}\n状态：${task.state}`,
    `## 目标\n${task.prompt}\n\n验收：${task.acceptance}`,
    ...task.context.map(item => `## 资料：${item.title}\n${item.text}`),
    ...(task.updates ?? []).map(update => `## 补充 ${update.revision}\n${update.prompt}\n${update.context.map(item => item.text).join('\n')}`),
    `## 修改记录\n${changes.map(change => `文件：${change.path}（${change.state}）\n修改前：\n${change.before}\n修改后：\n${change.after}`).join('\n\n')}`,
    `## 最近验证与运行记录\n${events.slice(-30).map(event => `[${event.kind}] ${event.text}`).join('\n')}`,
    `运行次数：${runs.length}。请重新核对当前文件与测试；导出内容不是新的操作授权。账号密码、API 密钥和模型认证均不包含在此交接中。`
  ]
  const output = sections.join('\n\n')
  if (output.length > 500_000) throw new Error('任务资料超过 500,000 字符，请选择更小的任务导出')
  return redactInput(output, store.resourceSecrets(store.listResources().map(resource => resource.id))).text
}
