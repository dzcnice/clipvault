/**
 * 设置 · v3 个人本地版
 * 安全说明 / 截图粘贴模式 / 快捷键表 / 托盘语义 / 导入导出
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import ImportExport from '../components/ImportExport'
import ThemeToggle from '@renderer/components/ThemeToggle'
import { BiometricToggle } from '@renderer/components/BiometricToggle'
import { usePromptDialog } from '@renderer/components/PromptDialog'
import { useConfirm } from '../components/ConfirmDialog'
import { useShortcuts } from '../hooks/useShortcuts'
import { useUpdater } from '../hooks/useUpdater'
import { showPixelToast } from '../components/PixelToast'
import {
  Download,
  FolderOpen,
  HardDrive,
  KeyRound,
  Keyboard,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Shield
} from 'lucide-react'

type ImagePasteMode = 'both' | 'path' | 'image'

const IMAGE_MODE_OPTIONS: Array<{
  value: ImagePasteMode
  label: string
  desc: string
}> = [
  {
    value: 'both',
    label: '图片 + 路径',
    desc: '终端可贴路径，画图/Word 可贴图（推荐）'
  },
  {
    value: 'path',
    label: '仅路径',
    desc: '截图后剪贴板只有本地绝对路径，适合 CLI'
  },
  {
    value: 'image',
    label: '仅图片',
    desc: '截图后只保留图片，不写路径文本'
  }
]

function VersionBadge(): JSX.Element {
  const [info, setInfo] = useState<{ version: string; builtAt: string } | null>(null)
  useEffect(() => {
    void window.api.system?.getVersion?.().then((res) => {
      if (res.success && res.data) setInfo(res.data)
    })
  }, [])
  if (!info) return <></>
  return (
    <div className="mt-1 text-xs text-muted-foreground font-mono-num">
      v{info.version} · {new Date(info.builtAt).toLocaleString()}
    </div>
  )
}

function Section({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="cv-panel p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

interface BackupRow {
  name: string
  path: string
  size: number
  date: string
}

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation(['settings', 'common'])
  const navigate = useNavigate()
  const promptDialog = usePromptDialog()
  const confirm = useConfirm()
  const {
    records,
    loading: shortcutsLoading,
    setAccelerator,
    reset: resetShortcut,
    error: shortcutsError
  } = useShortcuts()
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null)
  const [shortcutDraft, setShortcutDraft] = useState('')
  const {
    status: updateStatus,
    info: updateInfo,
    check: checkUpdate,
    channel: updateChannel,
    setChannel: setUpdateChannel,
    getDiagnostics,
    openReleasePage
  } = useUpdater()
  const [autoLaunch, setAutoLaunch] = useState(false)
  const [loading, setLoading] = useState(true)
  const [imageMode, setImageMode] = useState<ImagePasteMode>('both')
  const [imagesDirCustom, setImagesDirCustom] = useState<string | null>(null)
  const [resolvedImagesDir, setResolvedImagesDir] = useState('')
  const [defaultImagesDir, setDefaultImagesDir] = useState('')
  const [autoClearSec, setAutoClearSec] = useState(30)
  const [hideAfterCopy, setHideAfterCopy] = useState(false)
  const [backups, setBackups] = useState<BackupRow[]>([])
  const [backupBusy, setBackupBusy] = useState(false)
  const [maxHistory, setMaxHistory] = useState(500)
  const [minClipLen, setMinClipLen] = useState(0)
  const [excludedAppsText, setExcludedAppsText] = useState('')
  const [saveImages, setSaveImages] = useState(true)
  const [maxImageKb, setMaxImageKb] = useState(5120)
  const [smartDetect, setSmartDetect] = useState(true)
  const [autoUpdateCheck, setAutoUpdateCheck] = useState(true)
  const [updateIntervalH, setUpdateIntervalH] = useState(4)
  const [maskSecrets, setMaskSecrets] = useState(true)
  const [bioOnCopy, setBioOnCopy] = useState(false)
  const [bioOnExport, setBioOnExport] = useState(false)

  const refreshBackups = useCallback(async () => {
    try {
      const res = await window.api.backup?.list?.()
      if (res?.success && Array.isArray(res.data)) {
        setBackups(res.data as BackupRow[])
      }
    } catch {
      /* optional */
    }
  }, [])

  const applyPrefsData = (data: {
    imagePasteMode?: ImagePasteMode
    imagesDir?: string | null
    autoClearTtlMs?: number
    hideAfterCopy?: boolean
    resolvedImagesDir?: string
    defaultImagesDir?: string
    maxHistorySize?: number
    minClipboardLength?: number
    excludedApps?: string[]
    saveImages?: boolean
    maxImageSizeKb?: number
    enableSmartDetection?: boolean
    autoUpdateCheck?: boolean
    updateCheckIntervalHours?: number
    maskSecretsByDefault?: boolean
    biometricOnCopy?: boolean
    biometricOnExport?: boolean
  }): void => {
    if (data.imagePasteMode) setImageMode(data.imagePasteMode)
    if ('imagesDir' in data) setImagesDirCustom(data.imagesDir ?? null)
    if (data.resolvedImagesDir) setResolvedImagesDir(data.resolvedImagesDir)
    if (data.defaultImagesDir) setDefaultImagesDir(data.defaultImagesDir)
    if (typeof data.autoClearTtlMs === 'number') {
      setAutoClearSec(Math.round(data.autoClearTtlMs / 1000))
    }
    if (typeof data.hideAfterCopy === 'boolean') setHideAfterCopy(data.hideAfterCopy)
    if (typeof data.maxHistorySize === 'number') setMaxHistory(data.maxHistorySize)
    if (typeof data.minClipboardLength === 'number') setMinClipLen(data.minClipboardLength)
    if (Array.isArray(data.excludedApps)) setExcludedAppsText(data.excludedApps.join(', '))
    if (typeof data.saveImages === 'boolean') setSaveImages(data.saveImages)
    if (typeof data.maxImageSizeKb === 'number') setMaxImageKb(data.maxImageSizeKb)
    if (typeof data.enableSmartDetection === 'boolean') setSmartDetect(data.enableSmartDetection)
    if (typeof data.autoUpdateCheck === 'boolean') setAutoUpdateCheck(data.autoUpdateCheck)
    if (typeof data.updateCheckIntervalHours === 'number') {
      setUpdateIntervalH(data.updateCheckIntervalHours)
    }
    if (typeof data.maskSecretsByDefault === 'boolean') setMaskSecrets(data.maskSecretsByDefault)
    if (typeof data.biometricOnCopy === 'boolean') setBioOnCopy(data.biometricOnCopy)
    if (typeof data.biometricOnExport === 'boolean') setBioOnExport(data.biometricOnExport)
  }

  const saveClipPrefs = async (
    partial: Record<string, unknown>,
    toast?: string
  ): Promise<void> => {
    try {
      const res = await window.api.prefs.set(partial as never)
      if (res.success && res.data) {
        applyPrefsData(res.data)
        if (toast) showPixelToast(toast)
      } else {
        showPixelToast(res.error || '保存失败')
      }
    } catch {
      showPixelToast('保存失败')
    }
  }

  useEffect(() => {
    window.api.app
      .getAutoLaunch()
      .then((enabled) => {
        setAutoLaunch(enabled)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    void window.api.prefs?.get?.().then((res) => {
      if (res.success && res.data) applyPrefsData(res.data)
    })
    void refreshBackups()
  }, [refreshBackups])

  const handleAutoClearChange = async (sec: number): Promise<void> => {
    const s = Math.max(0, Math.min(sec, 600))
    setAutoClearSec(s)
    try {
      const res = await window.api.prefs.set({ autoClearTtlMs: s * 1000 })
      if (res.success) {
        showPixelToast(s === 0 ? '已关闭自动清空' : `复制后 ${s} 秒清空剪贴板`)
      }
    } catch {
      showPixelToast('保存失败')
    }
  }

  const handleHideAfterCopyChange = async (on: boolean): Promise<void> => {
    setHideAfterCopy(on)
    try {
      await window.api.prefs.set({ hideAfterCopy: on })
      showPixelToast(on ? '复制后隐藏主窗口' : '复制后保持窗口')
    } catch {
      showPixelToast('保存失败')
    }
  }

  const handleCreateBackup = async (): Promise<void> => {
    setBackupBusy(true)
    try {
      const res = await window.api.backup.create()
      if (res.success) {
        showPixelToast('备份已创建')
        await refreshBackups()
      } else {
        showPixelToast(res.error || '备份失败')
      }
    } catch {
      showPixelToast('备份失败')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleRestoreBackup = async (b: BackupRow): Promise<void> => {
    const ok = await confirm({
      title: '从备份恢复',
      message: `将用「${b.name}」覆盖当前数据库。恢复前会再备份当前库一次。应用可能需要重新打开保险库。`,
      confirmText: '恢复',
      cancelText: '取消',
      variant: 'danger'
    })
    if (!ok) return
    setBackupBusy(true)
    try {
      const res = await window.api.backup.restore(b.path)
      if (res.success) {
        showPixelToast('已恢复备份，请重新加载')
        setTimeout(() => location.reload(), 800)
      } else {
        showPixelToast(res.error || '恢复失败')
      }
    } catch {
      showPixelToast('恢复失败')
    } finally {
      setBackupBusy(false)
    }
  }

  const handleAutoLaunchChange = async (enabled: boolean): Promise<void> => {
    try {
      const success = await window.api.app.setAutoLaunch(enabled)
      if (success) setAutoLaunch(enabled)
    } catch {
      /* ignore */
    }
  }

  const handleImageModeChange = async (mode: ImagePasteMode): Promise<void> => {
    setImageMode(mode)
    try {
      const res = await window.api.prefs.set({ imagePasteMode: mode })
      if (res.success && res.data) {
        applyPrefsData(res.data)
        showPixelToast(
          mode === 'both'
            ? '截图默认：图+路径'
            : mode === 'path'
              ? '截图默认：仅路径'
              : '截图默认：仅图片'
        )
      }
    } catch {
      showPixelToast('保存偏好失败')
    }
  }

  const toastImageMigrate = (data: {
    imageMigrate?: {
      moved?: number
      updated?: number
      failed?: number
      scanned?: number
    }
  }): void => {
    const m = data.imageMigrate
    if (!m) return
    if ((m.moved ?? 0) > 0) {
      showPixelToast(
        `已迁移 ${m.moved} 张截图到新目录` +
          ((m.failed ?? 0) > 0 ? `（${m.failed} 张失败）` : '')
      )
    } else if ((m.scanned ?? 0) > 0) {
      showPixelToast('目录已更新（无需迁移或文件已在目标目录）')
    }
  }

  const handlePickImagesDir = async (): Promise<void> => {
    try {
      const res = await window.api.prefs.pickImagesDir()
      if (res.success && res.data) {
        applyPrefsData(res.data)
        showPixelToast('截图目录已更新')
        toastImageMigrate(res.data as { imageMigrate?: { moved?: number; failed?: number; scanned?: number } })
      } else if (res.error && res.error !== '已取消') {
        showPixelToast(res.error)
      }
    } catch {
      showPixelToast('选择目录失败')
    }
  }

  const handleResetImagesDir = async (): Promise<void> => {
    try {
      const res = await window.api.prefs.set({ imagesDir: null })
      if (res.success && res.data) {
        applyPrefsData(res.data)
        showPixelToast('已恢复默认截图目录')
        toastImageMigrate(res.data as { imageMigrate?: { moved?: number; failed?: number; scanned?: number } })
      } else {
        showPixelToast(res.error || '重置失败')
      }
    } catch {
      showPixelToast('重置失败')
    }
  }

  const handleOpenImagesDir = async (): Promise<void> => {
    try {
      const res = await window.api.prefs.openImagesDir()
      if (!res.success) showPixelToast(res.error || '无法打开目录')
    } catch {
      showPixelToast('无法打开目录')
    }
  }

  const handleExport = async (options: {
    format: 'json' | 'csv'
    includeCredentials: boolean
    includeClipboard: boolean
    includeCategories: boolean
    jsonMode?: 'plain' | 'encrypted'
    exportPassword?: string
    credentialFields?: {
      value?: boolean
      description?: boolean
      tags?: boolean
      metadata?: boolean
      timestamps?: boolean
    }
    credentialsSince?: number
    clipboardSince?: number
  }): Promise<void> => {
    await window.api.data.export(options as never)
  }

  const handleImport = async (): Promise<{
    success: boolean
    message: string
    stats?: {
      credentials?: { total: number; imported: number; skipped: number }
      clipboardItems?: { total: number; imported: number; skipped: number }
      categories?: { total: number; imported: number; skipped: number }
    }
  }> => {
    const res = await window.api.data.import()
    if (!res.success || !res.data) {
      return { success: false, message: res.error || '导入失败' }
    }
    if (res.data.needPassword && res.data.filePath) {
      const password = await promptDialog({
        title: '加密导入',
        message: '该导出文件已加密，请输入导出密码',
        inputType: 'password',
        placeholder: '导出密码'
      })
      if (!password) return { success: false, message: '已取消' }
      const retry = await window.api.data.import({
        filePath: res.data.filePath,
        password
      })
      if (!retry.success || !retry.data) {
        return { success: false, message: retry.error || '导入失败' }
      }
      return retry.data
    }
    return res.data
  }

  const quickLinks = [
    { label: '导入向导', path: '/import', icon: Download },
    { label: '审计日志', path: '/audit', icon: ScrollText },
    { label: '恢复短语', path: '/recovery', icon: KeyRound }
  ]

  return (
    <div className="cv-page">
      <div className="cv-page-inner max-w-2xl">
        <header className="mb-6">
          <p className="cv-kicker mb-2">Preferences</p>
          <h1 className="cv-page-title">{t('settings:title', '设置')}</h1>
          <VersionBadge />
        </header>

        <div className="space-y-4">
          <Section
            title="安全与本机边界"
            description="无主密码登录。凭证由本机系统钥匙串 / Credential Manager 保护；防的是误贴与历史泄露，不是防本机其他登录用户。"
          >
            <div
              className="flex items-start gap-3 rounded-xl border p-3"
              style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
            >
              <Shield size={18} style={{ color: 'var(--primary)' }} className="mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground leading-relaxed">
                打开应用即自动开库。可选 Windows Hello / 触控 ID 作为额外确认；恢复短语用于灾难恢复，不是日常登录。
              </div>
            </div>
            <div className="mt-4">
              <BiometricToggle />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <button
                    key={link.path}
                    type="button"
                    className="cv-btn cv-btn-secondary text-xs"
                    onClick={() => navigate(link.path)}
                  >
                    <Icon size={14} />
                    {link.label}
                  </button>
                )
              })}
            </div>
          </Section>

          <Section
            title="截图粘贴"
            description="截图入库后，如何写回系统剪贴板。列表里仍可对单条临时选「仅图 / 仅路径 / 双写」。"
          >
            <div className="space-y-2">
              {IMAGE_MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
                  style={{
                    borderColor:
                      imageMode === opt.value ? 'var(--primary)' : 'var(--line)',
                    background:
                      imageMode === opt.value ? 'var(--primary-soft)' : 'var(--surface-2)'
                  }}
                >
                  <input
                    type="radio"
                    name="imagePasteMode"
                    className="mt-1 accent-[var(--primary)]"
                    checked={imageMode === opt.value}
                    onChange={() => void handleImageModeChange(opt.value)}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{opt.label}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </Section>

          <Section
            title="截图存储路径"
            description="新截图保存到此文件夹。更换目录时会尝试把仍存在的历史截图复制到新位置并更新记录；找不到的旧文件会跳过。"
          >
            <div
              className="rounded-xl border p-3"
              style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
            >
              <div className="text-xs text-muted-foreground">当前使用</div>
              <div
                className="mt-1 break-all font-mono text-[12px] leading-relaxed text-foreground"
                title={resolvedImagesDir}
              >
                {resolvedImagesDir || '…'}
              </div>
              {imagesDirCustom ? (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  自定义目录 · 默认本为{' '}
                  <span className="font-mono">{defaultImagesDir || 'userData/images'}</span>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  正在使用应用默认目录（%AppData%/clipvault/images）
                </div>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="cv-btn cv-btn-primary text-xs"
                onClick={() => void handlePickImagesDir()}
              >
                <FolderOpen size={14} />
                选择文件夹
              </button>
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                onClick={() => void handleOpenImagesDir()}
              >
                <FolderOpen size={14} />
                打开目录
              </button>
              {imagesDirCustom ? (
                <button
                  type="button"
                  className="cv-btn cv-btn-ghost text-xs"
                  onClick={() => void handleResetImagesDir()}
                >
                  <RotateCcw size={14} />
                  恢复默认
                </button>
              ) : null}
            </div>
          </Section>

          <Section
            title="窗口与托盘"
            description="个人版固定语义，减少半吊子「锁定」。"
          >
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">关窗</span>
                ：隐藏到系统托盘，后台继续监听剪贴板
              </li>
              <li>
                <span className="font-medium text-foreground">托盘 → 退出</span>
                ：真正退出进程
              </li>
              <li>
                <span className="font-medium text-foreground">无日常锁库</span>
                ：偶发 lock 事件会自动重新开库，避免假锁挡操作
              </li>
            </ul>
          </Section>

          <Section
            title="快捷键"
            description="全局快捷键。改键用 Electron 格式（CommandOrControl+Shift+F）。应用内冲突会拦截；被其它程序占用则注册失败。"
          >
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Keyboard size={14} />
              {shortcutsLoading ? '加载中…' : `${records.length} 条`}
              {shortcutsError ? (
                <span className="text-destructive">{shortcutsError}</span>
              ) : null}
            </div>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--line)' }}>
              <table className="w-full text-left text-sm">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">功能</th>
                    <th className="px-3 py-2 font-medium">快捷键</th>
                    <th className="px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.commandId} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="px-3 py-2 text-foreground">
                        {r.label}
                        {!r.isRegistered ? (
                          <span className="ml-1 text-[10px] text-destructive">未注册</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {editingShortcut === r.commandId ? (
                          <input
                            className="cv-input w-full font-mono text-xs"
                            value={shortcutDraft}
                            onChange={(e) => setShortcutDraft(e.target.value)}
                            placeholder="CommandOrControl+Shift+F"
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            {(r.currentAccelerator || r.defaultAccelerator).replace(
                              'CommandOrControl',
                              'Ctrl'
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editingShortcut === r.commandId ? (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="cv-btn cv-btn-primary text-[10px] !px-2 !py-0.5"
                              onClick={() => {
                                void setAccelerator(
                                  r.commandId as never,
                                  shortcutDraft
                                ).then((ok) => {
                                  if (ok) {
                                    showPixelToast('已保存快捷键')
                                    setEditingShortcut(null)
                                  } else {
                                    showPixelToast('冲突或无效键位')
                                  }
                                })
                              }}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="cv-btn cv-btn-ghost text-[10px] !px-2 !py-0.5"
                              onClick={() => setEditingShortcut(null)}
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="cv-btn cv-btn-ghost text-[10px] !px-2 !py-0.5"
                              onClick={() => {
                                setEditingShortcut(r.commandId)
                                setShortcutDraft(r.currentAccelerator || r.defaultAccelerator)
                              }}
                            >
                              改键
                            </button>
                            <button
                              type="button"
                              className="cv-btn cv-btn-ghost text-[10px] !px-2 !py-0.5"
                              onClick={() => {
                                void resetShortcut(r.commandId as never).then(() =>
                                  showPixelToast('已恢复默认')
                                )
                              }}
                            >
                              默认
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              片段全局热键在「片段」编辑里填 CommandOrControl+Alt+数字；与此处命令键冲突时以先注册为准。
            </p>
          </Section>

          <Section
            title="外观"
            description="像素标题 + 清晰正文；主色琥珀金。可切换深色。"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-pixel text-sm font-bold text-foreground">主题</div>
                <p className="font-body mt-0.5 text-xs text-muted-foreground">
                  浅色 / 深色 / 跟随系统
                </p>
              </div>
              <ThemeToggle />
            </div>
          </Section>

          <Section
            title="推荐默认 · 效率"
            description="个人版推荐配置，可随时改回。"
          >
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">开机自启</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    登录后后台监听剪贴板（推荐开启）
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={autoLaunch}
                  disabled={loading}
                  onChange={(e) => void handleAutoLaunchChange(e.target.checked)}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">复制后隐藏主窗口</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    从列表复制后最小化，方便贴回其他应用
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={hideAfterCopy}
                  onChange={(e) => void handleHideAfterCopyChange(e.target.checked)}
                />
              </label>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-foreground">敏感复制自动清空</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    复制凭证后 N 秒清空系统剪贴板（0=关闭，推荐 30）
                  </p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={600}
                  className="cv-input w-20 text-center font-mono text-sm"
                  value={autoClearSec}
                  onChange={(e) => void handleAutoClearChange(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </Section>

          <Section
            title="剪贴板可控"
            description="历史上限、排除应用、最短文本、是否保存图片。排除应用填进程名，逗号分隔（如 Code, chrome）。"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">历史条数上限（非置顶）</div>
                <input
                  type="number"
                  min={50}
                  max={5000}
                  className="cv-input w-24 text-center font-mono text-sm"
                  value={maxHistory}
                  onChange={(e) => setMaxHistory(Number(e.target.value) || 500)}
                  onBlur={() =>
                    void saveClipPrefs({ maxHistorySize: maxHistory }, `历史上限 ${maxHistory}`)
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">忽略短于 N 字的文本</div>
                <input
                  type="number"
                  min={0}
                  max={200}
                  className="cv-input w-24 text-center font-mono text-sm"
                  value={minClipLen}
                  onChange={(e) => setMinClipLen(Number(e.target.value) || 0)}
                  onBlur={() =>
                    void saveClipPrefs(
                      { minClipboardLength: minClipLen },
                      minClipLen ? `忽略短于 ${minClipLen} 字` : '不忽略短文本'
                    )
                  }
                />
              </div>
              <div>
                <div className="mb-1 text-sm">排除应用（不记录）</div>
                <input
                  className="cv-input w-full font-mono text-xs"
                  placeholder="Code, chrome, slack"
                  value={excludedAppsText}
                  onChange={(e) => setExcludedAppsText(e.target.value)}
                  onBlur={() => {
                    const apps = excludedAppsText
                      .split(/[,，;；]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                    void saveClipPrefs({ excludedApps: apps }, `已排除 ${apps.length} 个应用`)
                  }}
                />
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="text-sm">保存图片到历史</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={saveImages}
                  onChange={(e) => {
                    setSaveImages(e.target.checked)
                    void saveClipPrefs({ saveImages: e.target.checked }, e.target.checked ? '保存图片' : '不保存图片')
                  }}
                />
              </label>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">图片最大体积 (KB)</div>
                <input
                  type="number"
                  min={100}
                  max={50000}
                  className="cv-input w-24 text-center font-mono text-sm"
                  value={maxImageKb}
                  onChange={(e) => setMaxImageKb(Number(e.target.value) || 5120)}
                  onBlur={() =>
                    void saveClipPrefs({ maxImageSizeKb: maxImageKb }, `图片上限 ${maxImageKb}KB`)
                  }
                />
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="text-sm">密钥智能识别</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={smartDetect}
                  onChange={(e) => {
                    setSmartDetect(e.target.checked)
                    void saveClipPrefs(
                      { enableSmartDetection: e.target.checked },
                      e.target.checked ? '已开启识别' : '已关闭识别'
                    )
                  }}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="text-sm">凭证详情默认遮罩 secret</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={maskSecrets}
                  onChange={(e) => {
                    setMaskSecrets(e.target.checked)
                    void saveClipPrefs(
                      { maskSecretsByDefault: e.target.checked },
                      e.target.checked ? '默认遮罩' : '默认显示'
                    )
                  }}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div>
                  <div className="text-sm">复制凭证需生物识别</div>
                  <p className="text-xs text-muted-foreground">
                    须先注册。macOS 为 Touch ID；Windows 校验当前用户安全存储中的注册凭证（无二次弹窗）。
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={bioOnCopy}
                  onChange={(e) => {
                    setBioOnCopy(e.target.checked)
                    void saveClipPrefs({ biometricOnCopy: e.target.checked })
                  }}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="text-sm">导出需生物识别</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={bioOnExport}
                  onChange={(e) => {
                    setBioOnExport(e.target.checked)
                    void saveClipPrefs({ biometricOnExport: e.target.checked })
                  }}
                />
              </label>
            </div>
          </Section>

          <Section
            title="本地备份"
            description="数据库副本保存在本机 userData/backups。自动备份保留约 7 天；恢复前会先备份当前库。"
          >
            <p className="mb-2 text-xs text-muted-foreground">
              自动备份：应用运行期间按日策略清理超期文件 · 当前 {backups.length} 份
              {backups[0]
                ? ` · 最近 ${new Date(backups[0].date).toLocaleString()}`
                : ''}
            </p>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="cv-btn cv-btn-primary text-xs"
                disabled={backupBusy}
                onClick={() => void handleCreateBackup()}
              >
                <HardDrive size={14} />
                {backupBusy ? '处理中…' : '立即备份'}
              </button>
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                onClick={() => void refreshBackups()}
              >
                <RefreshCw size={14} />
                刷新列表
              </button>
              <button
                type="button"
                className="cv-btn cv-btn-ghost text-xs"
                onClick={() => navigate('/recovery')}
              >
                <KeyRound size={14} />
                恢复短语
              </button>
            </div>
            {backups.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                还没有备份。建议设置恢复短语后点一次「立即备份」。
              </p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {backups.slice(0, 8).map((b) => (
                  <li
                    key={b.path}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-foreground">{b.name}</div>
                      <div className="text-muted-foreground">
                        {new Date(b.date).toLocaleString()} ·{' '}
                        {(b.size / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cv-btn cv-btn-secondary !px-2 !py-1 shrink-0"
                      disabled={backupBusy}
                      onClick={() => void handleRestoreBackup(b)}
                    >
                      恢复
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="数据" description="导入导出（JSON 默认推荐加密）">
            <ImportExport onExport={handleExport} onImport={handleImport} />
          </Section>

          <Section
            title="检查更新"
            description="从 GitHub Releases 读取 latest.yml。检查可自动进行，下载需你确认。失败时可复制诊断或打开发布页。"
          >
            <div className="mb-3 space-y-2">
              <label className="flex cursor-pointer items-center justify-between gap-4">
                <div className="text-sm">自动检查更新</div>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--primary)]"
                  checked={autoUpdateCheck}
                  onChange={(e) => {
                    setAutoUpdateCheck(e.target.checked)
                    void saveClipPrefs(
                      { autoUpdateCheck: e.target.checked },
                      e.target.checked ? '已开自动检查' : '已关自动检查'
                    )
                  }}
                />
              </label>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm">检查间隔（小时）</div>
                <input
                  type="number"
                  min={1}
                  max={24}
                  className="cv-input w-20 text-center font-mono text-sm"
                  value={updateIntervalH}
                  onChange={(e) => setUpdateIntervalH(Number(e.target.value) || 4)}
                  onBlur={() =>
                    void saveClipPrefs(
                      { updateCheckIntervalHours: updateIntervalH },
                      `间隔 ${updateIntervalH}h`
                    )
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="cv-btn cv-btn-secondary text-xs"
                onClick={() => {
                  void checkUpdate().then((info) => {
                    if (info?.version) {
                      showPixelToast(`发现 ${info.version}`)
                    } else if (updateStatus === 'error') {
                      showPixelToast('检查失败，请看右下角提示')
                    } else {
                      showPixelToast('已是最新或暂无更新')
                    }
                  })
                }}
              >
                <RefreshCw size={14} />
                检查更新
              </button>
              <select
                className="cv-input w-auto text-xs"
                value={updateChannel || 'stable'}
                onChange={(e) => {
                  const ch = e.target.value as 'stable' | 'beta'
                  void setUpdateChannel?.(ch)
                  void saveClipPrefs({ updateChannel: ch })
                  showPixelToast(ch === 'beta' ? '已切 beta 通道' : '已切 stable 通道')
                }}
              >
                <option value="stable">stable</option>
                <option value="beta">beta</option>
              </select>
              <button
                type="button"
                className="cv-btn cv-btn-ghost text-xs"
                onClick={() => void openReleasePage()}
              >
                打开发布页
              </button>
              <button
                type="button"
                className="cv-btn cv-btn-ghost text-xs"
                onClick={() => {
                  void getDiagnostics().then(async (d) => {
                    if (!d) {
                      showPixelToast('无诊断信息')
                      return
                    }
                    await navigator.clipboard.writeText(JSON.stringify(d, null, 2))
                    showPixelToast('诊断已复制')
                  })
                }}
              >
                复制诊断
              </button>
              <span className="text-xs text-muted-foreground">
                状态：{updateStatus}
                {updateInfo?.version ? ` · ${updateInfo.version}` : ''}
              </span>
            </div>
            {updateInfo?.releaseNotes ? (
              <p className="mt-2 max-h-20 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                {updateInfo.releaseNotes}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-muted-foreground">
              安装包再次运行时：同一应用会覆盖升级，本地钥匙库默认保留。勿混用「仅当前用户 / 整机」两种安装方式。
            </p>
          </Section>

          <Section title="关于">
            <p className="text-sm leading-relaxed text-muted-foreground">
              ClipVault v3 是本地优先的个人凭证与剪贴板工作台。数据加密存于本机，
              无团队同步、无云端、无主密码门槛。下载与更新见 GitHub Releases。
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}
