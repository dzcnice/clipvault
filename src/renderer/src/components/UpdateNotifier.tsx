/**
 * UpdateNotifier (TASK-072)
 *
 * 通过 useUpdater 监听 autoUpdater 状态，向用户展示：
 *   - 有新版本 → 显示下载按钮
 *   - 下载中 → 进度条
 *   - 已下载 → "立即重启安装"按钮
 *   - 错误 → 简短提示
 *
 * 采用低侵入式右下角 toast；未挂载 API 时静默无害。
 */

import { useMemo } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Download, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useUpdater } from '@renderer/hooks/useUpdater'

export function UpdateNotifier(): JSX.Element | null {
  const { status, info, progress, error, download, quitAndInstall } = useUpdater()

  const visible = useMemo(
    () =>
      status === 'available' ||
      status === 'downloading' ||
      status === 'downloaded' ||
      status === 'error',
    [status]
  )

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border bg-background p-4 shadow-lg"
      data-testid="update-notifier"
    >
      {status === 'available' && (
        <>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" /> 发现新版本 {info?.version}
          </div>
          {info?.releaseNotes && (
            <p className="mb-3 max-h-24 overflow-auto text-xs text-muted-foreground">
              {info.releaseNotes}
            </p>
          )}
          <Button size="sm" onClick={() => void download()}>
            <Download className="mr-1 h-4 w-4" /> 下载更新
          </Button>
        </>
      )}

      {status === 'downloading' && (
        <>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
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
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-green-500" /> 更新已就绪
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            版本 {info?.version} 已下载，重启后生效
          </p>
          <Button size="sm" onClick={() => void quitAndInstall()}>
            立即重启安装
          </Button>
        </>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>更新失败：{error ?? '未知错误'}</span>
        </div>
      )}
    </div>
  )
}
