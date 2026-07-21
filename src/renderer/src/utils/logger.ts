/**
 * 渲染进程 Logger（B-1）
 *
 * 通过 IPC 透传到主进程 logger，同时在开发模式保留 console 输出
 * 生产模式不在 console 打印，保持渲染端 DevTools 干净
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// window.api 的全局类型由 src/preload/index.d.ts 提供

// Vite 的 import.meta.env.DEV 在构建时会被静态替换
const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

function consoleOut(level: LogLevel, args: unknown[]): void {
  if (!isDev) return
  /* eslint-disable no-console */
  const fn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(fn as any).apply(console, ['[renderer]', ...args])
  /* eslint-enable no-console */
}

function forwardToMain(level: LogLevel, args: unknown[]): void {
  try {
    const payload = {
      level,
      message: args
        .map((a) => {
          if (a instanceof Error) return `${a.message}\n${a.stack}`
          if (typeof a === 'string') return a
          try {
            return JSON.stringify(a)
          } catch {
            return String(a)
          }
        })
        .join(' '),
      at: new Date().toISOString()
    }
    window.api?.log.rendererError(payload)
  } catch {
    // 忽略：日志链路自身不能再抛错
  }
}

export const logger = {
  debug: (...args: unknown[]): void => {
    consoleOut('debug', args)
    // debug 不上报
  },
  info: (...args: unknown[]): void => {
    consoleOut('info', args)
  },
  warn: (...args: unknown[]): void => {
    consoleOut('warn', args)
    forwardToMain('warn', args)
  },
  error: (...args: unknown[]): void => {
    consoleOut('error', args)
    forwardToMain('error', args)
  }
}
