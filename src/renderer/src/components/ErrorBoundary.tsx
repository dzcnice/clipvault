/**
 * React ErrorBoundary（P1-2）
 *
 * - 捕获渲染期异常，避免整个应用白屏
 * - 通过 IPC 上报至主进程 console / 日志文件
 */

import { Component, ErrorInfo, ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  errorMessage?: string
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 异步上报，失败不影响降级 UI
    try {
      window.api?.log
        ?.rendererError?.({
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack
        })
        .catch(() => {
          /* 忽略上报失败 */
        })
    } catch {
      // logger 自身依赖 window.api，此处再抛 IPC 失败只能走浏览器控制台兜底
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] 上报失败', error)
    }
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen w-screen flex items-center justify-center p-6"
          style={{ color: 'var(--text-primary)' }}
        >
          <div className="glass-card p-8 max-w-md text-center space-y-4">
            <h2 className="text-xl font-semibold">出错了</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {this.state.errorMessage || '应用发生了一个未预期的错误。'}
            </p>
            <button className="glass-btn glass-btn-primary px-4 py-2" onClick={this.handleReload}>
              重启应用
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
