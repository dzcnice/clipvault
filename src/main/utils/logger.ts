/**
 * 主进程 Logger（B-1）
 *
 * 目标：
 * - 统一替换散落在主进程的 console.log/warn/error
 * - 按天滚动写入 %APPDATA%/clipvault/logs/main-YYYY-MM-DD.log
 * - 仅保留最近 7 天
 * - 零依赖（Node 内置 fs），生产环境避免引入 winston 体积
 */

import { app } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { join } from 'path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_TAG: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR'
}

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gray
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // yellow
  error: '\x1b[31m' // red
}
const COLOR_RESET = '\x1b[0m'

const LOG_RETAIN_DAYS = 7

let logsDirCache: string | null = null
let writeToFileEnabled = true

/** 延迟到首次写日志时才取 userData（此时 app 已 ready） */
function getLogsDir(): string {
  if (logsDirCache) return logsDirCache
  try {
    const base = app.getPath('userData')
    const dir = join(base, 'logs')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
    }
    logsDirCache = dir
    return dir
  } catch {
    // app 未 ready 时 getPath 会抛；此时只写 console 不落盘
    writeToFileEnabled = false
    return ''
  }
}

function todayStamp(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * ρ8 · 日志文件按 ClipVault 版本号区分。
 * 例：v2.1.0-b5 → main-2026-04-16-v2.1.0-b5.log
 *
 * 这样升级到新 build 后日志自动新文件，不会和老版本混在一起，
 * 排查问题时一眼看清当前版本日志范围。
 */
let appVersionCache: string | null = null
function getAppVersion(): string {
  if (appVersionCache) return appVersionCache
  try {
    appVersionCache = app?.getVersion?.() ?? 'unknown'
  } catch {
    appVersionCache = 'unknown'
  }
  return appVersionCache
}

function cleanupOldLogs(dir: string): void {
  try {
    const now = Date.now()
    const maxAge = LOG_RETAIN_DAYS * 24 * 60 * 60 * 1000
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('main-') || !name.endsWith('.log')) continue
      const full = join(dir, name)
      const st = statSync(full)
      if (now - st.mtime.getTime() > maxAge) {
        unlinkSync(full)
      }
    }
  } catch {
    // 清理失败不影响主流程
  }
}

function safeStringify(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.message}\n${arg.stack ?? ''}`
  }
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function write(level: LogLevel, args: unknown[]): void {
  const timestamp = new Date().toISOString()
  const tag = LEVEL_TAG[level]
  const msg = args.map(safeStringify).join(' ')
  const line = `[${timestamp}] [${tag}] ${msg}`

  // 开发时彩色；生产纯文本
  const isDev = !app?.isPackaged
  if (isDev) {
    const color = LEVEL_COLOR[level]
    // eslint-disable-next-line no-console
    console.log(`${color}${line}${COLOR_RESET}`)
  } else {
    // eslint-disable-next-line no-console
    console.log(line)
  }

  if (!writeToFileEnabled) return
  try {
    const dir = getLogsDir()
    if (!dir) return
    const file = join(dir, `main-${todayStamp()}-v${getAppVersion()}.log`)
    appendFileSync(file, line + '\n')
    // 每 100 行左右清理一次；这里简单每次都尝试（小开销）
    cleanupOldLogs(dir)
  } catch {
    // 写入失败，关闭落盘避免爆日志
    writeToFileEnabled = false
  }
}

export const logger = {
  debug: (...args: unknown[]): void => write('debug', args),
  info: (...args: unknown[]): void => write('info', args),
  warn: (...args: unknown[]): void => write('warn', args),
  error: (...args: unknown[]): void => write('error', args)
}

export type { LogLevel }
