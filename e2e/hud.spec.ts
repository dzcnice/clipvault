/**
 * E2E: in-app command palette smoke coverage.
 *
 * OS-level global shortcuts like Alt+Space are harder to trigger reliably in
 * Playwright, so these tests focus on the renderer-level command palette
 * shortcuts that share the same visible UI.
 */

import { test, expect } from './fixtures/electron'
import { completeOnboarding } from './fixtures/helpers'

test.describe('HUD / Command Palette', () => {
  test('Ctrl+K opens the command palette', async ({ page }) => {
    await completeOnboarding(page)
    await page.keyboard.press('Control+K')
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId('command-palette-input')).toBeFocused({ timeout: 1_000 })
  })

  test('Ctrl+Shift+P opens the command palette', async ({ page }) => {
    await completeOnboarding(page)
    await page.keyboard.press('Control+Shift+P')
    await expect(page.getByTestId('command-palette')).toBeVisible({ timeout: 3_000 })
  })

  test('keyword filtering narrows the available commands', async ({ page }) => {
    await completeOnboarding(page)
    await page.keyboard.press('Control+K')
    await page.getByTestId('command-palette-input').fill('settings')
    await expect(page.getByRole('option')).toHaveCount(1, { timeout: 3_000 })
    await expect(page.getByText('/settings')).toBeVisible({ timeout: 3_000 })
  })

  test('Escape closes the command palette', async ({ page }) => {
    await completeOnboarding(page)
    await page.keyboard.press('Control+K')
    const palette = page.getByTestId('command-palette')
    await expect(palette).toBeVisible({ timeout: 3_000 })
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden({ timeout: 3_000 })
  })
})
