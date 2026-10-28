import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export interface ForegroundWindow { process: string; title: string; at: number }

const PS = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class CvFgw {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$h = [CvFgw]::GetForegroundWindow(); $procId = 0
[void][CvFgw]::GetWindowThreadProcessId($h, [ref]$procId)
$sb = New-Object System.Text.StringBuilder 512
[void][CvFgw]::GetWindowText($h, $sb, 512)
$name = ''; $p = Get-Process -Id $procId -ErrorAction SilentlyContinue; if ($p) { $name = $p.ProcessName }
@{ process = $name; title = $sb.ToString() } | ConvertTo-Json -Compress
`.trim()

let latest: Promise<ForegroundWindow> | null = null

/** 在浮窗抢走焦点之前记下前台窗口（只在本机用于把匹配的账号排在前面）。 */
export function captureForeground(probe: () => Promise<ForegroundWindow> = probeWindows): void {
  latest = probe().catch(() => ({ process: '', title: '', at: Date.now() }))
}
export async function lastForeground(): Promise<ForegroundWindow> {
  return latest ? latest : { process: '', title: '', at: 0 }
}
async function probeWindows(): Promise<ForegroundWindow> {
  if (process.platform !== 'win32') return { process: '', title: '', at: Date.now() }
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { timeout: 2500, windowsHide: true, encoding: 'utf8' })
  const value = JSON.parse(stdout.trim() || '{}') as { process?: string; title?: string }
  return { process: String(value.process ?? '').slice(0, 120), title: String(value.title ?? '').slice(0, 300), at: Date.now() }
}

export { matchScore } from '../../utils/window-match'
