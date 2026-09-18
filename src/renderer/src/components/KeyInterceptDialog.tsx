/**
 * 密钥拦截弹窗 · v3.0 个人本地版
 *
 * 检测到密钥时弹窗：保存到本地凭证库 / 取消
 */

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { ShieldAlert } from 'lucide-react'

interface KeyInterceptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 拦截到的内容（已脱敏预览） */
  content: string
  /** key-detector 识别到的类型 */
  detectedType?: string
  /** 可选 prompt id，区分多条拦截请求 */
  promptId?: string
  /** 兼容旧调用方；个人版等同 saveLocalOnly */
  onShareAsCredential?: (name: string) => void
  onSaveLocalOnly: (name: string) => void
  onCancel: () => void
}

/** 内部表单：用 props 作为 state lazy init，open key 切换时整体重新挂载 */
/** 根据类型生成默认名：标签 · YYYY-MM-DD。禁止把密钥片段写进名称。 */
export function suggestCredentialName(detectedType?: string, content?: string): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const t = (detectedType ?? '').toLowerCase()

  let label = '密钥'
  if (t.includes('openai') || t.startsWith('sk-')) label = 'OpenAI'
  else if (t.includes('github') || t.includes('ghp_') || t.includes('github_pat')) label = 'GitHub'
  else if (t.includes('aws') || t.includes('akia')) label = 'AWS'
  else if (t.includes('ssh')) label = 'SSH'
  else if (t.includes('jwt') || t.includes('bearer') || t.includes('token')) label = 'Token'
  else if (t.includes('stripe')) label = 'Stripe'
  else if (t.includes('slack')) label = 'Slack'
  else if (t.includes('google') || t.includes('gcp')) label = 'Google'
  else if (detectedType) label = detectedType

  // 仅用前缀判断类型，不把 content 切片拼进名称
  if (label === '密钥' && content) {
    const c = content.trim()
    if (c.startsWith('sk-')) label = 'OpenAI'
    else if (c.startsWith('ghp_') || c.startsWith('github_pat_')) label = 'GitHub'
    else if (c.startsWith('AKIA')) label = 'AWS'
    else if (c.includes('BEGIN') && c.includes('PRIVATE KEY')) label = 'SSH'
  }

  return `${label} · ${stamp}`
}

function InterceptForm(props: {
  content: string
  detectedType?: string
  onSaveLocalOnly: (name: string) => void
  onCancel: () => void
}): JSX.Element {
  const { content, detectedType, onSaveLocalOnly, onCancel } = props
  const [name, setName] = useState(() => suggestCredentialName(detectedType, content))

  const preview =
    content.length > 24 ? `${content.slice(0, 6)}…${content.slice(-4)}` : content

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs">
          <div className="text-muted-foreground">检测类型：{detectedType ?? '未知密钥'}</div>
          <div className="mt-1 break-all">{preview}</div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cred-name">凭证名称</Label>
          <Input
            id="cred-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="为该凭证起一个易记名称"
          />
        </div>
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={() => onSaveLocalOnly(name)}>保存到凭证库</Button>
      </DialogFooter>
    </>
  )
}

export function KeyInterceptDialog({
  open,
  onOpenChange,
  content,
  detectedType,
  promptId,
  onSaveLocalOnly,
  onCancel
}: KeyInterceptDialogProps): JSX.Element {
  // 用 promptId / content 作为 key，确保不同拦截重置表单
  const formKey = useMemo(() => {
    if (!open) return 'closed'
    return promptId ?? `c:${content}`
  }, [open, promptId, content])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <ShieldAlert className="h-5 w-5" />
            检测到敏感密钥
          </DialogTitle>
          <DialogDescription>
            是否将此内容保存到本地凭证库？取消则仅保留在剪贴板历史。
          </DialogDescription>
        </DialogHeader>

        <InterceptForm
          key={formKey}
          content={content}
          detectedType={detectedType}
          onSaveLocalOnly={onSaveLocalOnly}
          onCancel={onCancel}
        />
      </DialogContent>
    </Dialog>
  )
}
