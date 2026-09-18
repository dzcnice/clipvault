/**
 * CredentialTOTPSection - 凭证详情里的 TOTP 挂载区
 *
 * 逻辑：
 *  - 查询 totp.get(credentialId)
 *  - 若已配置：渲染 <TOTPRing />
 *  - 若未配置：渲染"添加 TOTP"按钮，点击后弹 PromptDialog 输入 otpauth:// URI 或 Base32 secret
 */

import { useCallback, useEffect, useState } from 'react'
import TOTPRing from './TOTPRing'
import { usePromptDialog } from './PromptDialog'

interface Props {
  credentialId: string
}

interface Sprint11TotpApi {
  get: (id: string) => Promise<{ success: boolean; data?: unknown }>
  upsert: (input: {
    credentialId: string
    secret?: string
    uri?: string
  }) => Promise<{ success: boolean; error?: string }>
  parseUri?: (uri: string) => Promise<{ success: boolean; data?: unknown }>
  delete?: (id: string) => Promise<{ success: boolean }>
}

function getTotpApi(): Sprint11TotpApi | null {
  const w = window as unknown as { api?: { totp?: Sprint11TotpApi } }
  return w.api?.totp ?? null
}

export function CredentialTOTPSection({ credentialId }: Props): JSX.Element | null {
  const prompt = usePromptDialog()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const api = getTotpApi()
    if (!api) {
      setConfigured(false)
      return
    }
    try {
      const r = await api.get(credentialId)
      setConfigured(!!(r.success && r.data))
    } catch {
      setConfigured(false)
    }
  }, [credentialId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const handleAdd = useCallback(async () => {
    const api = getTotpApi()
    if (!api) {
      setMessage('当前运行环境未提供 TOTP 接口')
      return
    }
    const input = await prompt({
      title: '添加 TOTP',
      message: '粘贴 otpauth:// URI 或 Base32 Secret',
      placeholder: 'otpauth://totp/... 或 JBSWY3DPEHPK3PXP'
    })
    if (!input) return
    const trimmed = input.trim()
    const payload = trimmed.startsWith('otpauth://')
      ? { credentialId, uri: trimmed }
      : { credentialId, secret: trimmed }
    const r = await api.upsert(payload)
    if (r.success) {
      setMessage(null)
      await refresh()
    } else {
      setMessage(`添加失败：${r.error ?? '未知错误'}`)
    }
  }, [credentialId, prompt, refresh])

  if (configured === null) return null

  return (
    <section>
      <div className="mb-2 text-xs font-medium text-muted-foreground">两步验证（TOTP）</div>
      <div className="cv-panel p-4">
        {configured ? (
          <TOTPRing credentialId={credentialId} />
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">尚未配置 TOTP</span>
            <button
              type="button"
              className="cv-btn cv-btn-primary text-xs"
              onClick={() => void handleAdd()}
            >
              添加 TOTP
            </button>
          </div>
        )}
        {message ? (
          <div className="mt-2 text-xs" style={{ color: 'var(--destructive)' }}>
            {message}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default CredentialTOTPSection
