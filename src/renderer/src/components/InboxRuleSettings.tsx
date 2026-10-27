import { useEffect, useState } from 'react'
import type { InboxKind } from '@/types/inbox'
import { unwrap } from '../hooks/useWorkbench'

export default function InboxRuleSettings(): JSX.Element {
  const [muted, setMuted] = useState<InboxKind[]>([]), [error, setError] = useState('')
  useEffect(() => { void window.api.workbench?.inboxMuted?.().then(result => { if (result.success && result.data) setMuted(result.data) }).catch(() => setError('规则暂不可用')) }, [])
  return <section className="space-y-3 border-b py-4"><h2 className="font-medium">收件箱本地规则</h2><p className="text-xs text-muted-foreground">识别和提醒不调用模型。关闭的规则可以随时恢复。</p>{error && <p role="alert">{error}</p>}<div className="flex flex-wrap gap-4">{([['error_fix', '报错'], ['save_resource', '账号资料'], ['duplicate_secret', '重复密钥'], ['organize', '整理建议'], ['rotate', '轮换提醒'], ['weak_password', '弱密码']] as const).map(([key, name]) => <label className="flex items-center gap-2 text-sm" key={key}><input type="checkbox" checked={!muted.includes(key)} onChange={event => { const disabled = !event.target.checked; void unwrap(window.api.workbench.muteInbox(key, disabled)).then(() => setMuted(old => disabled ? [...old, key] : old.filter(item => item !== key))).catch(error => setError(error.message)) }} />{name}</label>)}</div></section>
}
