import { scanSecrets } from '../workbench/secret-scan'
import { looksLikeAccountList } from './account-combo'
import type { ClipCategory } from '../../types/clipboard'
import type { WorkProject } from '../../types/workbench'
export type { ClipCategory } from '../../types/clipboard'
export const CLIP_CATEGORIES: ClipCategory[] = ['code', 'error', 'command', 'link', 'path', 'credential', 'secret', 'image', 'text']
export function classifyClip(input: { type: string; text: string; sourceApp?: string }): { category: ClipCategory; signals: string[] } {
  const text = input.text.slice(0, 24_000).trim()
  const result = (category: ClipCategory, signal: string): { category: ClipCategory; signals: string[] } => ({ category, signals: [signal] })
  if (input.type === 'image') return result('image', '图片格式')
  if (/otpauth:\/\//i.test(text) || scanSecrets(text, []).some(hit => hit.kind === 'format')) return result('secret', '密钥或验证码种子格式')
  if (/(?:username|user|account|email|用户名|账号|邮箱)["']?\s*[:=：]/i.test(text) && /(?:password|passwd|pwd|密码)["']?\s*[:=：]/i.test(text) && !/\b(?:interface|type|def|function)\b/.test(text)) return result('credential', '包含账号与密码字段')
  if (looksLikeAccountList(text)) return result('credential', '账号串（账号|密码 等格式）')
  if (/\b(?:TypeError|ReferenceError|SyntaxError|RangeError|Exception|Error):|\bTraceback\b|\bat\s+\S+\s*\([^\n]+:\d+[:)]|npm ERR!|error TS\d+|\bpanic:|\b[A-Z]\w*Exception\b|^ERROR\s+\d+/m.test(text)) return result('error', '报错或堆栈格式')
  if (/^https?:\/\/[^\s]+$/i.test(text) || /^mailto:[^\s]+@[^\s]+$/i.test(text)) return result('link', '完整链接')
  if (input.type === 'file' || /^(?:[A-Z]:[\\/]|\\\\[^\\]+\\|\/[^\s]+|\.\.?\/[^\s]+)[^\r\n]*$/i.test(text)) return result('path', '文件路径')
  if (!text.includes('\n') && (/^(?:[$>#]\s*)?(?:npm|npx|node|git|docker|sudo|pnpm|yarn|bun|python3?|pip3?|curl|wget|ssh|ls|cd|mkdir|dotnet|cargo|go|pwsh|powershell|Get-\w+|Set-\w+)\b/i.test(text) || /\s&&\s/.test(text))) return result('command', '单行命令')
  if (/\b(?:const|let|var|function|class|interface|import|export|return|async|await|def|print|public|SELECT|INSERT|UPDATE|DELETE|FROM)\b|#include\s|<[a-z][^>]*>|^[\w.$]+\([^\n]*\)[;]?$/m.test(text) || /^[{[]/.test(text)) return result('code', '代码语法')
  if (scanSecrets(text, []).some(hit => hit.kind === 'assignment')) return result('secret', '独立敏感字段字面量')
  return result('text', '普通文本')
}
export function matchProject(text: string, projects: WorkProject[]): string | null {
  const normalized = text.replace(/\\/g, '/').toLowerCase()
  for (const project of [...projects].filter(item => !item.archived).sort((a, b) => b.directory.length - a.directory.length)) {
    const directory = project.directory.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const at = normalized.indexOf(directory), next = normalized[at + directory.length]
    if (directory && at >= 0 && (!next || /[\s/:'"\])}]/.test(next))) return project.id
    const names = [directory.split('/').at(-1), project.packageName].filter((value): value is string => !!value && value.length > 2)
    if (names.some(name => new RegExp(`(?:^|[^\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^\\w-])`, 'i').test(text))) return project.id
  }
  return null
}
