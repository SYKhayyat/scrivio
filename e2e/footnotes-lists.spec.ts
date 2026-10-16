import { test, expect } from '@playwright/test'

test('put three chunks in a bullet list and attach a visible footnote', async ({ page }) => {
  await page.goto('/')
  const editor = page.locator('[contenteditable="true"]').first()
  await editor.click()
  await page.getByRole('button', { name: /bullet list/i }).click()
  await page.keyboard.type('one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('two')
  await page.keyboard.press('Enter')
  await page.keyboard.type('three')
  await expect(page.locator('ul li')).toHaveCount(3)
  await page.getByRole('button', { name: /attach footnote/i }).click()
  await expect(page.locator('sup[data-footnote-id], .fn-marker')).toBeVisible()
  await expect(page.locator('.footnote-strip, [data-footnote-panel]')).toContainText(/1/)
})
