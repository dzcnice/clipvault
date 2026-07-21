/**
 * E2E: 首次引导 · v3.1 无密码个人版
 *
 * 覆盖：
 *   1. 首次启动进入 Welcome
 *   2. Welcome → Shortcut → Import
 *   3. 完成后进入主界面
 */

import { test, expect } from './fixtures/electron'
import { completeOnboarding } from './fixtures/helpers'

test.describe('Onboarding · v3.1', () => {
  test('首次启动进入欢迎页', async ({ page }) => {
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible({
      timeout: 15_000
    })
    await expect(page.getByText('欢迎来到 ClipVault')).toBeVisible()
    await expect(page.getByTestId('onboarding-welcome-next')).toBeVisible()
  })

  test('欢迎页进入快捷键步骤', async ({ page }) => {
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible({
      timeout: 15_000
    })
    await page.getByTestId('onboarding-welcome-next').click()
    await expect(page.getByTestId('onboarding-step-shortcut')).toBeVisible({
      timeout: 5_000
    })
    await expect(
      page.getByRole('heading', { name: '快捷键与 HUD' })
    ).toBeVisible()
  })

  test('快捷键可跳过并进入导入步骤', async ({ page }) => {
    await expect(page.getByTestId('onboarding-step-welcome')).toBeVisible({
      timeout: 15_000
    })
    await page.getByTestId('onboarding-welcome-next').click()
    await expect(page.getByTestId('onboarding-step-shortcut')).toBeVisible()
    await page.getByTestId('onboarding-shortcut-skip').click()
    await expect(page.getByTestId('onboarding-step-import')).toBeVisible({
      timeout: 5_000
    })
  })

  test('完整走完 onboarding 进入主界面', async ({ page }) => {
    await completeOnboarding(page)
    await expect(page.getByRole('link', { name: /剪贴板/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /凭证/ })).toBeVisible()
  })
})
