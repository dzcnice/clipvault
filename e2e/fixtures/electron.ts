/**
 * Electron 启动 fixtures（τ1）
 *
 * 每个测试文件拿到独立的 `app` + `page`：
 *  - 基于临时 userData 目录启动（避免污染真实 Vault 数据）
 *  - 注入 CLIPVAULT_E2E=1 给主进程识别测试态
 *  - 退出时关闭 app + 递归删除临时目录
 *
 * 参考：https://playwright.dev/docs/api/class-electron
 */

import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

type Fixtures = {
  app: ElectronApplication
  page: Page
  userDataDir: string
}

async function closeElectronApp(app: ElectronApplication): Promise<void> {
  const closeTimer = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('APP_CLOSE_TIMEOUT')), 10_000)
  })

  try {
    await Promise.race([app.close(), closeTimer])
  } catch {
    const pid = app.process()?.pid
    if (pid) {
      try {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        /* ignore force-kill errors */
      }
    }
  }
}

export const test = base.extend<Fixtures>({
  userDataDir: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clipvault-e2e-'))
    await use(dir)
    // 尽力清理，失败不抛（Windows 下 better-sqlite3 锁可能残留）
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  },
  app: async ({ userDataDir }, use) => {
    const mainEntry = path.join(process.cwd(), 'out', 'main', 'index.js')
    const app = await electron.launch({
      args: [mainEntry, `--user-data-dir=${userDataDir}`],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        CLIPVAULT_E2E: '1'
      },
      timeout: 30_000
    })
    // 诊断：把主进程 stdout/stderr 输出到控制台（设 CLIPVAULT_E2E_DEBUG=1 开启）
    if (process.env.CLIPVAULT_E2E_DEBUG === '1') {
      app.process().stdout?.on('data', (d: Buffer) => {
        process.stdout.write(`[main:stdout] ${d.toString()}`)
      })
      app.process().stderr?.on('data', (d: Buffer) => {
        process.stderr.write(`[main:stderr] ${d.toString()}`)
      })
    }
    await use(app)
    await closeElectronApp(app)
  },
  page: async ({ app }, use) => {
    // Bug #2：app 会 preheat 一个 HUD 窗口（hash=#hud），firstWindow 可能拿到 HUD。
    // 必须跳过 HUD，等待主窗口（URL 结尾不是 #hud）。
    const isMainWindow = (url: string): boolean =>
      !url.includes('#hud') && !url.endsWith('#')
    // 已创建的窗口里找主窗口
    const existing = app.windows().find((w) => isMainWindow(w.url()))
    let page = existing
    if (!page) {
      // 没有就等
      page = await app.waitForEvent('window', {
        predicate: (w) => isMainWindow(w.url()),
        timeout: 30_000
      })
    }
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'
