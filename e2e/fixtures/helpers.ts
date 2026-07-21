/**
 * E2E helpers · v3.1 无密码个人版
 *
 * Onboarding：welcome → shortcut → import
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

function onboardingStep(page: Page, stepId: string) {
  return page.getByTestId(`onboarding-step-${stepId}`)
}

function onboardingNext(page: Page, stepId: string) {
  return page.getByTestId(`onboarding-${stepId}-next`)
}

function onboardingSkip(page: Page, stepId: string) {
  return page.getByTestId(`onboarding-${stepId}-skip`)
}

/** 侧栏 / hash 路由别名（个人版） */
const ROUTE_ALIASES: Array<{ pattern: RegExp; path: string }> = [
  { pattern: /dashboard|概览|仪表盘/i, path: '/dashboard' },
  { pattern: /clipboard|剪贴板/i, path: '/clipboard' },
  { pattern: /credential|credentials|凭证|密钥|密码/i, path: '/credentials' },
  { pattern: /snippet|snippets|片段/i, path: '/snippets' },
  { pattern: /health|健康/i, path: '/health' },
  { pattern: /settings|设置/i, path: '/settings' }
]

/**
 * 走完 v3.1 onboarding：欢迎 → 快捷键(跳过) → 导入(完成)
 */
export async function completeOnboarding(page: Page): Promise<void> {
  await expect(onboardingStep(page, 'welcome')).toBeVisible({ timeout: 15_000 })
  await onboardingNext(page, 'welcome').click()

  await expect(onboardingStep(page, 'shortcut')).toBeVisible({ timeout: 5_000 })
  await onboardingSkip(page, 'shortcut').click()

  await expect(onboardingStep(page, 'import')).toBeVisible({ timeout: 5_000 })
  await onboardingNext(page, 'import').click()

  // 主界面：侧栏「剪贴板」或「概览」
  await expect(
    page.getByRole('link', { name: /剪贴板|概览|凭证/ }).first()
  ).toBeVisible({ timeout: 15_000 })
}

/** 通过侧栏可见文案或 hash 别名导航 */
export async function navigateTo(page: Page, label: string): Promise<void> {
  const matcher = new RegExp(label, 'i')
  const link = page.getByRole('link', { name: matcher }).first()
  if (await link.count()) {
    await link.click()
    return
  }

  const route = ROUTE_ALIASES.find((entry) => entry.pattern.test(label))?.path
  if (!route) {
    throw new Error(`No navigation match found for label: ${label}`)
  }

  await page.evaluate((nextRoute) => {
    window.location.hash = `#${nextRoute}`
  }, route)
  await page.waitForURL(new RegExp(`#${route.replace(/\//g, '\\/')}$`))
}
