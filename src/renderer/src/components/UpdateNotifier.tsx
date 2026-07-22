/**
 * UpdateNotifier · 应用内更新提示
 *
 * - 有新版本 → 下载
 * - 下载中 → 进度
 * - 已下载 → 立即重启安装
 * - 错误 → 文案 + 重试 + 诊断 + 打开 Release
 */

import { useMemo, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Download, RefreshCw, AlertCircle, CheckCircle2, X, ExternalLink, Copy } from 'lucide-react'
import { useUpdater } from '@renderer/hooks/useUpdater'
import { showPixelToast } from './PixelToast'

export function UpdateNotifier(): JSX.Element | null {
  const {
    status,
    info,
    progress,
    error,
    download,
    quitAndInstall,
    check,
    getDiagnostics,
    openReleasePage
  } = useUpdater()
  const [dismissed, setDismissed] = useState(false)

  const visible = useMemo(() => {
    if (dismissed && status !== 'downloading' && status !== 'downloaded') {
      return false
    }
    return (
      status === 'available' ||
      status === 'downloading' ||
      status === 'downloaded' ||
      status === 'error'
    )
  }, [status, dismissed])

  const copyDiag = async (): Promise<void> => {
    try {
      const d = await getDiagnostics()
      if (!d) {
        showPixelToast('无法获取诊断信息')
        return
      }
      const text = JSON.stringify(d, null, 2)
      await navigator.clipboard.writeText(text)
      showPixelToast('诊断信息已复制')
    } catch {
      showPixelToast('复制失败')
    }
  }

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-background p-4 shadow-lg"
      data-testid="update-notifier"
      style={{ borderColor: 'var(--line)', boxShadow: 'var(--px-shadow)' }}
    >
      <button
        type="button"
        className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label="关闭"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {status === 'available' && (
        <>
          <div className="mb-2 flex items-center gap-2 pr-6 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> 发现新版本 {info?.version}
          </div>
          {info?.releaseNotes ? (
            <p className="mb-3 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {info.releaseNotes}
            </p>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">
              建议在空闲时更新。下载不会影响当前使用。
            </p>
          )}
          {info?.releaseDate ? (
            <p className="mb-2 text-[10px] text-muted-foreground">
              发布于 {new Date(info.releaseDate).toLocaleString()}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void download()}>
              <Download className="mr-1 h-4 w-4" /> 下载更新
            </Button>
            <Button size="sm" variant="outline" onClick={() => void openReleasePage()}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> 发布页
            </Button>
          </div>
        </>
      )}

      {status === 'downloading' && (
        <>
          <div className="mb-2 flex items-center gap-2 pr-6 text-sm font-semibold">
            <Download className="h-4 w-4 animate-pulse" /> 正在下载 {info?.version}
          </div>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-primary transition-all"
              style={{ width: `${Math.round(progress?.percent ?? 0)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {Math.round(progress?.percent ?? 0)}%
            {progress?.bytesPerSecond
              ? ` · ${Math.round(progress.bytesPerSecond / 1024)} KB/s`
              : ''}
          </p>
        </>
      )}

      {status === 'downloaded' && (
        <>
          <div className="mb-2 flex items-center gap-2 pr-6 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> 更新已就绪
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            版本 {info?.version} 已下载完成。本地数据会保留，重启后完成安装。
          </p>
          <Button size="sm" onClick={() => void quitAndInstall()}>
            立即重启安装
          </Button>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="mb-2 flex items-center gap-2 pr-6 text-sm font-semibold text-destructive">
            <AlertCircle className="h-4 w-4" /> 更新出错
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{error || '未知错误'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void check()}>
              重试检查
            </Button>
            <Button size="sm" variant="outline" onClick={() => void openReleasePage()}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> 手动下载
            </Button>
            <Button size="sm" variant="outline" onClick={() => void copyDiag()}>
              <Copy className="mr-1 h-3.5 w-3.5" /> 复制诊断
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
