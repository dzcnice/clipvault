/**
 * E2E: 凭证 CRUD · v3.1
 */

import { test, expect } from './fixtures/electron'
import { completeOnboarding, navigateTo } from './fixtures/helpers'

test.describe('Credential CRUD', () => {
  test('创建凭证后列表立刻出现', async ({ page }) => {
    await completeOnboarding(page)
    await navigateTo(page, '凭证')

    await expect(page.getByPlaceholder('搜索凭证…')).toBeVisible({
      timeout: 5_000
    })

    await page.getByRole('button', { name: /^新建$/ }).click()

    await expect(page.getByText('新建凭证')).toBeVisible()
    await page.getByPlaceholder('例如：OpenAI API Key').fill('e2e-cred-1')
    await page.getByPlaceholder('粘贴密钥…').fill('sk-e2e-test-12345')

    await page.getByRole('button', { name: /^创建$|^保存$/ }).click()

    await expect(page.getByText('e2e-cred-1')).toBeVisible({ timeout: 5_000 })
  })

  test('搜索关键词能过滤出对应凭证', async ({ page }) => {
    await completeOnboarding(page)
    await navigateTo(page, '凭证')

    for (const name of ['alpha-key', 'beta-key']) {
      await page.getByRole('button', { name: /^新建$/ }).click()
      await page.getByPlaceholder('例如：OpenAI API Key').fill(name)
      await page.getByPlaceholder('粘贴密钥…').fill(`sk-${name}-val`)
      await page.getByRole('button', { name: /^创建$|^保存$/ }).click()
      await expect(page.getByText(name)).toBeVisible({ timeout: 5_000 })
    }

    await page.getByPlaceholder('搜索凭证…').fill('alpha')
    await expect(page.getByText('alpha-key')).toBeVisible()
    await expect(page.locator('text=beta-key')).toHaveCount(0, {
      timeout: 3_000
    })
  })

  test('空列表显示占位文案', async ({ page }) => {
    await completeOnboarding(page)
    await navigateTo(page, '凭证')
    await expect(page.getByText('还没有钥匙')).toBeVisible({
      timeout: 5_000
    })
  })
})
