/**
 * ClipVault v3.1 · 无密码启动 + 暖纸工作室
 */

import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { ClipClearToast } from './components/ClipClearToast'
import { UpdateNotifier } from './components/UpdateNotifier'
import { KeyInterceptDialog } from './components/KeyInterceptDialog'
import { useKeyIntercept } from './hooks/useKeyIntercept'
import CommandPalette, { openCommandPalette } from './components/CommandPalette'
import { logger } from './utils/logger'
import { focusGlobalSearch } from './hooks/useGlobalSearch'
import { isOnboarded } from './hooks/useOnboarding'
import { WorkspaceProvider } from './contexts/WorkspaceContext'
import { PixelToastHost, showPixelToast } from './components/PixelToast'
import { Loader2, Shield } from 'lucide-react'

const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CredentialPage = lazy(() => import('./pages/CredentialPage'))
const ClipboardPage = lazy(() => import('./pages/ClipboardPage'))
const SnippetsPage = lazy(() => import('./pages/SnippetsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HealthReportPage = lazy(() => import('./pages/HealthReportPage'))
const TotpPage = lazy(() => import('./pages/TotpPage'))
const AuditLogPage = lazy(() =>
  import('./pages/AuditLogPage').then((m) => ({ default: m.AuditLogPage }))
)
const RecoveryPage = lazy(() =>
  import('./pages/RecoveryPage').then((m) => ({ default: m.RecoveryPage }))
)
const ImportWizardPage = lazy(() =>
  import('./pages/ImportWizard').then((m) => ({ default: m.ImportWizard }))
)
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))

type Stage = 'loading' | 'legacy-migrate' | 'onboarding' | 'ready' | 'error'

function EventBridge(): null {
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)

  useEffect(() => {
    navigateRef.current = navigate
  }, [navigate])

  useEffect(() => {
    const offs: Array<() => void> = []

    offs.push(
      window.api.events.on('navigate', (path) => {
        if (typeof path === 'string') navigateRef.current(path)
      })
    )
    offs.push(
      window.api.events.on('shortcut:focus-search', () => {
        focusGlobalSearch()
      })
    )
    offs.push(
      window.api.events.on('shortcut:action', (action) => {
        logger.info('[shortcut] action received:', action)
        if (action === 'ensure-open') {
          void window.api.vault
            .ensureOpen()
            .then(() => showPixelToast('保险库已重新打开'))
            .catch((err) => showPixelToast((err as Error).message || '开库失败'))
          return
        }
        if (action === 'new-credential') {
          navigateRef.current('/credentials')
          openCommandPalette()
          return
        }
        openCommandPalette()
      })
    )
    offs.push(
      window.api.events.on('shortcut:paste-recent', async () => {
        try {
          const res = await window.api.clipboard.getHistory({ limit: 1 })
          const item = res.data?.items?.[0]
          if (item) await window.api.clipboard.copyItem(item.id)
        } catch (err) {
          logger.error('[shortcut:paste-recent] failed:', err)
        }
      })
    )
    offs.push(
      window.api.events.on('clipboard:toggle-monitor', async (paused) => {
        try {
          await window.api.clipboard.toggleMonitor(!(paused === true))
        } catch (err) {
          logger.error('[clipboard:toggle-monitor] failed:', err)
        }
      })
    )

    // 锁定事件：个人无密码版自动重新 ensureOpen
    offs.push(
      window.api.vault.onLocked(() => {
        void window.api.vault.ensureOpen().catch((err) => {
          logger.error('[vault] re-open after lock failed:', err)
        })
      })
    )

    return () => offs.forEach((off) => off())
  }, [])

  return null
}

function mapDetectedTypeToCredentialType(detected?: string): string {
  const t = (detected ?? '').toLowerCase()
  if (t.includes('ssh')) return 'ssh_key'
  if (t.includes('token') || t.includes('jwt') || t.includes('bearer')) return 'token'
  if (t.includes('password') || t.includes('secret')) return 'password'
  return 'api_key'
}

function KeyInterceptBridge(): JSX.Element | null {
  const { prompt, decide } = useKeyIntercept()
  if (!prompt) return null

  const saveToVault = async (name: string): Promise<void> => {
    const d = new Date()
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const trimmed =
      name.trim() || `${prompt.detectedKeyType || '密钥'} · ${stamp}`
    try {
      const res = await window.api.credential.create({
        name: trimmed,
        type: mapDetectedTypeToCredentialType(prompt.detectedKeyType) as never,
        value: prompt.content,
        tags: prompt.detectedKeyType ? [prompt.detectedKeyType] : undefined,
        metadata: prompt.detectedKeyType
          ? { provider: prompt.detectedKeyType }
          : undefined
      })
      if (res.success) {
        decide('saveLocalOnly')
        showPixelToast(`已收入钥匙箱 · ${trimmed}`)
      } else {
        showPixelToast(res.error || '保存失败')
      }
    } catch (err) {
      logger.error('[KeyIntercept] create failed:', err)
      showPixelToast('保存失败')
    }
  }

  return (
    <KeyInterceptDialog
      open={true}
      onOpenChange={(open: boolean) => {
        if (!open) decide('cancel')
      }}
      content={prompt.content}
      detectedType={prompt.detectedKeyType}
      onShareAsCredential={(name) => {
        void saveToVault(name)
      }}
      onSaveLocalOnly={(name) => {
        void saveToVault(name)
      }}
      onCancel={() => decide('cancel')}
    />
  )
}

function RouteFallback(): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      加载中
    </div>
  )
}

/** 仅旧版 password vault 一次性迁移 */
function LegacyMigratePanel({
  onDone,
  errorHint
}: {
  onDone: () => void
  errorHint?: string | null
}): JSX.Element {
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(errorHint ?? null)

  const handleMigrate = async (): Promise<void> => {
    setError(null)
    setSubmitting(true)
    try {
      const res = await window.api.vault.migrateToSafe(password)
      if (!res.success) {
        setError(res.error || '迁移失败')
        return
      }
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center p-6">
      <div className="cv-panel w-full max-w-md p-8 animate-scaleIn">
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              升级本地保险库
            </h1>
            <p className="text-sm text-muted-foreground">
              检测到旧版主密码库。输入一次旧密码后，以后将免登录打开。
            </p>
          </div>
        </div>
        <label className="mb-1.5 block text-sm text-muted-foreground">旧主密码</label>
        <input
          type="password"
          className="cv-input mb-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleMigrate()
          }}
          autoFocus
        />
        {error ? (
          <p className="mb-3 text-sm" style={{ color: 'var(--destructive)' }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="cv-btn cv-btn-primary w-full py-2.5"
          disabled={submitting || !password}
          onClick={() => void handleMigrate()}
        >
          {submitting ? '迁移中…' : '完成迁移并进入'}
        </button>
      </div>
    </div>
  )
}

function BootSplash({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-md"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        <Shield size={26} strokeWidth={1.75} />
      </div>
      <div className="text-center">
        <div className="text-base font-semibold tracking-tight text-foreground">ClipVault</div>
        <div className="mt-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {label}
        </div>
      </div>
    </div>
  )
}

function App(): JSX.Element {
  const [stage, setStage] = useState<Stage>('loading')
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [legacyHint, setLegacyHint] = useState<string | null>(null)

  const enterApp = (): void => {
    setStage(isOnboarded() ? 'ready' : 'onboarding')
  }

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      try {
        const res = await window.api.vault.ensureOpen()
        if (cancelled) return
        if (res.success) {
          enterApp()
          return
        }
        // 旧 password vault
        if (res.error?.includes('旧版') || res.error?.includes('主密码')) {
          setLegacyHint(res.error ?? null)
          setStage('legacy-migrate')
          return
        }
        setBootstrapError(res.error || '无法打开保险库')
        setStage('error')
      } catch (err) {
        if (cancelled) return
        logger.error('[App] ensureOpen failed:', err)
        setBootstrapError(err instanceof Error ? err.message : String(err))
        setStage('error')
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  if (stage === 'loading') {
    return <BootSplash label="正在打开本地工作台…" />
  }

  if (stage === 'error') {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="cv-panel max-w-md p-8">
          <h1 className="text-lg font-semibold text-foreground">启动失败</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {bootstrapError || '请尝试重新加载应用'}
          </p>
          <button
            type="button"
            className="cv-btn cv-btn-primary mt-6"
            onClick={() => location.reload()}
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'legacy-migrate') {
    return (
      <LegacyMigratePanel
        errorHint={legacyHint}
        onDone={() => enterApp()}
      />
    )
  }

  if (stage === 'onboarding') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <OnboardingPage
          vaultInitialized={true}
          onFinished={() => {
            try {
              localStorage.setItem('clipvault:onboarded:v2', 'true')
            } catch {
              /* ignore */
            }
            setStage('ready')
          }}
        />
      </Suspense>
    )
  }

  return (
    <WorkspaceProvider>
      <HashRouter>
        <EventBridge />
        <CommandPalette />
        <ClipClearToast />
        <UpdateNotifier />
        <KeyInterceptBridge />
        <PixelToastHost />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Navigate to="/clipboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="credentials" element={<CredentialPage />} />
              <Route path="clipboard" element={<ClipboardPage />} />
              <Route path="snippets" element={<SnippetsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="recovery" element={<RecoveryPage />} />
              <Route path="health" element={<HealthReportPage />} />
              <Route path="totp" element={<TotpPage />} />
              <Route path="import" element={<ImportWizardPage />} />
              {/* 已下线功能：统一回剪贴板 / 设置 */}
              <Route path="share-packages" element={<Navigate to="/settings" replace />} />
              <Route path="team/*" element={<Navigate to="/clipboard" replace />} />
              <Route path="file-transfer" element={<Navigate to="/clipboard" replace />} />
              <Route path="audit/ai" element={<Navigate to="/settings" replace />} />
              <Route path="dev-tools" element={<Navigate to="/settings" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </WorkspaceProvider>
  )
}

export default App
