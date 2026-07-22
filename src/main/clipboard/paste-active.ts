/**
 * 将当前剪贴板内容粘贴到前台应用（目标形态）
 *
 * Windows：SendKeys ^v
 * 其它平台：明确不支持（接口冻结，返回错误码）
 *
 * 调用方应先 writeText / writeImage，再 hide 主窗，再 invoke 本函数。
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { logger } from '../utils/logger'

const execFileAsync = promisify(execFile)

const PS_PASTE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 120
[System.Windows.Forms.SendKeys]::SendWait('^v')
`.trim()

export async function pasteToActiveApp(): Promise<{ ok: boolean; error?: string }> {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      error: 'paste-to-active 目前仅支持 Windows（接口已冻结，macOS/Linux 后续接 Accessibility）'
    }
  }
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS_PASTE],
      { timeout: 3000, windowsHide: true }
    )
    return { ok: true }
  } catch (err) {
    const msg = (err as Error).message
    logger.warn(`[paste-active] failed: ${msg}`)
    return { ok: false, error: msg }
  }
}
