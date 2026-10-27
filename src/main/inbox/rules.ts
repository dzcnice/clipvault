import type { ClipboardItem } from '../../types/clipboard'
import { addInbox } from '../../db/inbox-store'
import { classifyClip } from '../clipboard/classify'
import { parseResourceText } from '../workbench/input'
import { duplicateSecretResources } from '../resources/secret-index'
import { outboundRedact } from '../workbench/redaction'

/** Local capture path: this module deliberately has no Host or model dependency. */
export function suggestForClipboard(item: ClipboardItem): string | null {
  if (item.decryptError || item.isSnippet || item.isSaved) return null
  const { signals } = classifyClip({ type: item.type, text: item.content || '' }), base = { sourceId: item.id, projectId: item.projectId || null }
  if (item.category === 'error' && item.projectId) return addInbox({ ...base, type: 'error_fix', data: { title: '这段报错可以在项目中定位', reason: signals.join('；'), preview: outboundRedact(item.preview).text, prompt: '定位并修复这段报错，补一条复现测试', ids: [item.id] } })
  if (item.category === 'secret' || item.category === 'credential') {
    const text = (item.content || '').slice(0, 100000), fields = parseResourceText(text).fields
    const duplicates = duplicateSecretResources([text.trim(), ...fields.filter(field => field.secret).map(field => field.value)])
    return addInbox({ ...base, type: duplicates.length ? 'duplicate_secret' : 'save_resource', data: { title: duplicates.length ? '这份密钥已保存在资源库' : '把账号或密钥保存为资源', reason: duplicates.length ? '本地 HMAC 与已有资源匹配，未调用模型' : signals.join('；'), preview: '敏感资料 · ••••••••', ids: [item.id], resourceIds: duplicates, action: 'resource' } })
  }
  return null
}
