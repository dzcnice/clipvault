/**
 * Playwright E2E 配置（τ1：真实启动全功能冒烟）
 *
 * 运行方式：
 *   npm run test:e2e          # 依赖 build 产物 out/main/index.js
 *   npm run test:e2e:ui       # Playwright UI 模式
 *
 * 约束：
 *   - 必须在 `npm run build` 之后跑（electron 需要 out/main/index.js）
 *   - workers=1：Electron 单实例，不并行
 *   - 每个 spec 由 fixtures/electron.ts 托管一个独立 userData 目录，避免互相污染
 */

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e-report', open: 'never' }]
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  outputDir: 'e2e-results'
})
