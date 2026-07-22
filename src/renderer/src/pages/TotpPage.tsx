/**
 * TOTP 总览 · 目标形态：全部验证码一页实时刷新
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw, Shield } from 'lucide-react'
import TOTPRing from '../components/TOTPRing'
import { showPixelToast } from '../components/PixelToast'

interface TotpRow {
  credentialId: string
  credentialName: string
  issuer?: string
  account?: string
}

export default function TotpPage(): JSX.Element {
  const [rows, setRows] = useState<TotpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const api = (
        window as unknown as {
          api?: {
            sprint11?: {
              totp?: {
                list?: () => Promise<{
                  success: boolean
                  data?: TotpRow[]
                  error?: string
                }>
              }
            }
          }
        }
      ).api
      const res = await api?.sprint11?.totp?.list?.()
      if (!res?.success) {
        setError(res?.error || '加载失败')
        setRows([])
        return
      }
      setRows(res.data ?? [])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const copyCode = async (id: string): Promise<void> => {
    try {
      const res = await window.api.credential.copy(id, {
        field: 'totp'
      } as never)
      if (res.success) showPixelToast('验证码已复制 · 将按设置自动清空')
      else showPixelToast(res.error || '复制失败')
    } catch (err) {
      showPixelToast((err as Error).message || '复制失败')
    }
  }

  return (
    <div className="cv-page">
      <div className="cv-page-inner max-w-3xl">
        <header className="mb-6 flex items-end justify-between gap-3">
          <div>
            <p className="cv-kicker mb-1">安全</p>
            <h1 className="cv-page-title">TOTP 验证码</h1>
            <p className="cv-page-desc">绑定了二次验证的凭证，倒计时实时刷新</p>
          </div>
          <button type="button" className="cv-btn cv-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={14} /> 刷新列表
          </button>
        </header>

        {loading && rows.length === 0 ? (
          <div className="cv-empty">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="cv-empty text-destructive">{error}</div>
        ) : rows.length === 0 ? (
          <div className="cv-empty">
            <Shield size={28} />
            <p className="font-pixel font-bold">还没有 TOTP</p>
            <p className="text-sm text-muted-foreground">
              在凭证详情里绑定 otpauth 或密钥后会出现在这里
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.credentialId} className="cv-panel flex items-center gap-4 p-4">
                <TOTPRing credentialId={r.credentialId} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.credentialName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[r.issuer, r.account].filter(Boolean).join(' · ') || r.credentialId}
                  </div>
                </div>
                <button
                  type="button"
                  className="cv-btn cv-btn-primary text-xs"
                  onClick={() => void copyCode(r.credentialId)}
                >
                  复制验证码
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
