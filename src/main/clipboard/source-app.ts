/**
 * 获取前台应用名（用于剪贴板 sourceApp）
 * Windows：user32 + process name；其它平台尽力返回空。
 * 结果缓存 1.5s，避免每次轮询都起进程。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../utils/logger'

const execFileAsync = promisify(execFile)

let cached: { name: string; at: number } | null = null
const CACHE_MS = 1500

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CvFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$hwnd = [CvFg]::GetForegroundWindow()
if ($hwnd -eq [IntPtr]::Zero) { ''; exit 0 }
$pid = 0
[void][CvFg]::GetWindowThreadProcessId($hwnd, [ref]$pid)
if ($pid -le 0) { ''; exit 0 }
$p = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($null -eq $p) { ''; exit 0 }
$p.ProcessName
`.trim()

async function probeWindows(): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
      { timeout: 2000, windowsHide: true, maxBuffer: 64 * 1024 }
    )
    return (stdout || '').trim().replace(/\r?\n/g, '')
  } catch (err) {
    logger.warn(`[source-app] probe failed: ${(err as Error).message}`)
    return ''
  }
}

/** 同步接口：返回缓存；后台刷新 */
export function getForegroundAppName(): string {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) {
    return cached.name
  }
  // 异步刷新，本次返回旧缓存或空
  if (process.platform === 'win32') {
    void probeWindows().then((name) => {
      cached = { name, at: Date.now() }
    })
  }
  return cached?.name ?? ''
}

/** 强制刷新（写入历史前调用，尽量拿到最新） */
export async function refreshForegroundAppName(): Promise<string> {
  if (process.platform !== 'win32') {
    cached = { name: '', at: Date.now() }
    return ''
  }
  const name = await probeWindows()
  cached = { name, at: Date.now() }
  return name
}

/** 判断应用名是否在排除列表（不区分大小写，支持不含 .exe） */
export function isAppExcluded(appName: string | undefined, excluded: string[]): boolean {
  if (!appName || !excluded.length) return false
  const n = appName.toLowerCase().replace(/\.exe$/i, '')
  return excluded.some((raw) => {
    const e = raw.trim().toLowerCase().replace(/\.exe$/i, '')
    return e.length > 0 && (n === e || n.includes(e) || e.includes(n))
  })
}
