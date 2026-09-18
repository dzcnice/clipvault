/**
 * 侧栏左下角小更新按钮：自动检测状态，一键检查 / 下载 / 重启
 */

import { useEffect, useState } from 'react'
import { Download, RefreshCw, AlertCircle, Sparkles } from 'lucide-react'
import { useUpdater } from '@renderer/hooks/useUpdater'
import type { UpdaterStatus } from '../../../types/updater'
import { showPixelToast } from './PixelToast'

export function sidebarUpdateLabel(input: {
  packaged: boolean
  status: UpdaterStatus
  busy: boolean
  version?: string
  percent?: number
}): string {
  if (!input.packaged) return '开发版'
  if (input.status === 'checking' || input.busy) return '检查中…'
  if (input.status === 'available') return `更新 ${input.version ?? ''}`.trim()
  if (input.status === 'downloading') {
    return `下载 ${Math.round(input.percent ?? 0)}%`
  }
  if (input.status === 'downloaded') return '重启安装'
  if (input.status === 'error') return '更新失败'
  if (input.status === 'not-available') return '已是最新'
  return '检查更新'
}

export function SidebarUpdateButton(): JSX.Element {
  const {
    status,
    info,
    progress,
    error,
    packaged,
    check,
    download,
    quitAndInstall
  } = useUpdater()
  const [busy, setBusy] = useState(false)

  // 有可用更新时轻提示一次（避免刷屏）
  useEffect(() => {
    if (status === 'available' && info?.version) {
      showPixelToast(`发现新版本 ${info.version}`)
    }
  }, [status, info?.version])

  const label = sidebarUpdateLabel({
    packaged,
    status,
    busy,
    version: info?.version,
    percent: progress?.percent
  })

  const Icon =
    !packaged
      ? RefreshCw
      : status === 'error'
        ? AlertCircle
        : status === 'available' || status === 'downloaded'
          ? Sparkles
          : status === 'downloading'
            ? Download
            : RefreshCw

  const accent =
    status === 'error'
      ? 'var(--destructive)'
      : status === 'available' || status === 'downloaded'
        ? 'var(--primary)'
        : 'var(--muted-foreground)'

  const onClick = async (): Promise<void> => {
    if (busy) return
    if (!packaged) {
      showPixelToast('开发态不检查更新，请用安装包')
      return
    }
    setBusy(true)
    try {
      if (status === 'available') {
        const ok = await download()
        if (!ok) showPixelToast(error || '下载失败')
        return
      }
      if (status === 'downloaded') {
        await quitAndInstall()
        return
      }
      // idle / error / not-available / checking → 重新检查
      const r = await check()
      if (r?.version) {
        showPixelToast(`发现 ${r.version}，再点一次开始下载`)
      } else if (status !== 'error') {
        showPixelToast('已是最新版本')
      }
    } finally {
      setBusy(false)
    }
  }

  const title = !packaged
    ? '开发态不走自动更新'
    : status === 'error'
      ? error || '更新失败，点击重试'
      : status === 'available'
        ? `有新版本 ${info?.version}，点击下载`
        : status === 'downloaded'
          ? '点击重启完成安装'
          : status === 'downloading'
            ? '正在下载更新…'
            : status === 'not-available'
              ? '已是最新版本'
              : '检查更新（自动检测已开启）'

  return (
    <button
      type="button"
      data-testid="sidebar-update-btn"
      title={title}
      onClick={() => void onClick()}
      disabled={busy || status === 'downloading' || (packaged && status === 'checking')}
      className="mt-1 flex w-full items-center gap-1.5 rounded-md border-2 px-2 py-1.5 text-left font-body text-[11px] transition-colors hover:bg-[var(--primary-soft)] disabled:opacity-60"
      style={{
        borderColor: 'var(--line)',
        color: accent,
        background: status === 'available' || status === 'downloaded' ? 'var(--primary-soft)' : 'transparent'
      }}
    >
      <Icon
        size={12}
        strokeWidth={2.5}
        className={packaged && (status === 'checking' || status === 'downloading') ? 'animate-spin' : ''}
      />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
    </button>
  )
}
