/**
 * TASK-024  凭证引用 token 渲染（cred:{id}）
 *
 * 在剪贴板/共享列表中，凭证引用以一个带锁卡片展示，
 * 点击后跳转到对应的团队凭证详情页。
 */

import { Lock, ExternalLink } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface CredentialReferenceProps {
  /** 形如 "cred:abcd1234" 的引用 token */
  token: string
  /** 已知的凭证名（如果上层能查到的话） */
  resolvedName?: string
  onClick?: (credentialId: string) => void
  className?: string
}

export function CredentialReference({
  token,
  resolvedName,
  onClick,
  className
}: CredentialReferenceProps): JSX.Element {
  const credentialId = token.startsWith('cred:') ? token.slice(5) : token
  const handleClick = (): void => {
    if (onClick) onClick(credentialId)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-50/40 px-2.5 py-1.5 text-xs text-amber-700 transition-colors hover:bg-amber-100/60 dark:bg-amber-500/5 dark:text-amber-300',
        className
      )}
      title={`团队凭证引用：${credentialId}`}
    >
      <Lock className="h-3 w-3" />
      <span className="font-medium">
        {resolvedName ?? `团队凭证 ${credentialId.slice(0, 6)}`}
      </span>
      <ExternalLink className="h-3 w-3 opacity-60" />
    </button>
  )
}

/** 检测一段文本是否是凭证引用 */
export function isCredentialReference(text: string): boolean {
  return /^cred:[A-Za-z0-9_-]{4,}$/.test(text.trim())
}

/** 从文本里抽取所有 cred:{id} */
export function extractCredentialReferences(text: string): string[] {
  const re = /cred:([A-Za-z0-9_-]{4,})/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.push(m[1])
  }
  return out
}
