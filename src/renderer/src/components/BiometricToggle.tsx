/**
 * BiometricToggle · v3.1 个人版
 *
 * 设置页：展示平台支持情况 + 启用/关闭。
 * 日常无主密码；vault 一般已由 ensureOpen 自动开库。
 * 若会话未开，先 ensureOpen，再 enroll（DEK 由主进程从内存取，不经 UI 传密码）。
 */

import { useEffect, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { useBiometric } from '../hooks/useBiometric'

interface Props {
  /** 兼容旧调用：仅在 ensureOpen 失败且确需密码时作为后备 */
  onRequestPassword?: () => Promise<string | null>
}

interface VaultAPIShape {
  isUnlocked: () => Promise<{ success: boolean; data?: boolean }>
  ensureOpen?: () => Promise<{ success: boolean; error?: string }>
  unlock?: (
    password: string
  ) => Promise<{ success: boolean; data?: boolean; error?: string }>
}

function getVaultApi(): VaultAPIShape | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { api?: { vault?: VaultAPIShape } }).api
  return api?.vault ?? null
}

export function BiometricToggle({ onRequestPassword }: Props): JSX.Element {
  const { availability, loading, enroll, disable } = useBiometric()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [vaultUnlocked, setVaultUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    const api = getVaultApi()
    if (!api) {
      setVaultUnlocked(false)
      return
    }
    void (async () => {
      const r = await api.isUnlocked()
      setVaultUnlocked(Boolean(r.data))
    })()
  }, [])

  const platformLabel =
    availability?.mechanism === 'dpapi'
      ? 'Windows 本机用户会话校验（DPAPI，无 Hello 弹窗）'
      : availability?.mechanism === 'touch-id'
        ? 'macOS Touch ID'
        : '当前平台不支持'

  const handleEnable = async (): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const api = getVaultApi()

      // 1) 已解锁 → 直接 enroll
      if (api) {
        const unlocked = await api.isUnlocked()
        if (unlocked.data) {
          const r = await enroll('')
          setMessage(r.success ? '已启用生物识别确认' : `启用失败：${r.error ?? ''}`)
          setVaultUnlocked(true)
          return
        }

        // 2) 未解锁 → 个人版优先 ensureOpen（safeStorage）
        if (api.ensureOpen) {
          const openRes = await api.ensureOpen()
          if (openRes.success) {
            const r = await enroll('')
            setMessage(r.success ? '已启用生物识别确认' : `启用失败：${r.error ?? ''}`)
            setVaultUnlocked(true)
            return
          }
          // ensureOpen 失败时再尝试旧主密码路径（极少见）
          if (openRes.error && !openRes.error.includes('旧版') && !openRes.error.includes('主密码')) {
            setMessage(openRes.error || '无法打开保险库')
            return
          }
        }

        if (onRequestPassword && api.unlock) {
          const password = (await onRequestPassword()) ?? ''
          if (!password) {
            setMessage('需要先打开保险库会话')
            return
          }
          const unlockRes = await api.unlock(password)
          if (!unlockRes.success || !unlockRes.data) {
            setMessage(`打开失败${unlockRes.error ? `：${unlockRes.error}` : ''}`)
            return
          }
          setVaultUnlocked(true)
          const r = await enroll('')
          setMessage(r.success ? '已启用生物识别确认' : `启用失败：${r.error ?? ''}`)
          return
        }

        setMessage('请先完成应用启动（保险库未打开）')
        return
      }

      const r = await enroll('')
      setMessage(r.success ? '已启用生物识别确认' : `启用失败：${r.error ?? ''}`)
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async (): Promise<void> => {
    setBusy(true)
    try {
      await disable()
      setMessage('已关闭生物识别确认')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">加载生物识别状态…</div>
  }

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="cv-icon-slot !h-9 !w-9 shrink-0"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Fingerprint size={16} strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">生物识别确认</div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            平台：{platformLabel}
            {vaultUnlocked === false ? ' · 会话未打开' : ''}
            。用于敏感操作二次确认，不是日常登录门槛。
          </p>
          <div className="mt-1 text-xs text-muted-foreground">
            状态：{availability?.enrolled ? '已启用' : '未启用'}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {availability?.isAvailable && !availability.enrolled ? (
              <button
                type="button"
                className="cv-btn cv-btn-primary text-xs"
                disabled={busy}
                onClick={() => void handleEnable()}
              >
                {busy ? '处理中…' : '启用'}
              </button>
            ) : null}
            {availability?.enrolled ? (
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                disabled={busy}
                onClick={() => void handleDisable()}
              >
                {busy ? '处理中…' : '关闭'}
              </button>
            ) : null}
            {!availability?.isAvailable ? (
              <span className="text-xs text-muted-foreground">此设备不可用</span>
            ) : null}
          </div>

          {message ? (
            <p className="mt-2 text-xs text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
