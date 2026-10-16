import { test, expect } from '@playwright/test'

test('type between chunks and delete a chunk', async ({ page }) => {
  await page.goto('/')
  const editor = page.locator('[contenteditable="true"]').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.type('typed text')
  await expect(editor).toContainText('typed text')
  const chunk = page.locator('img.chunk').first()
  if (await chunk.count()) {
    await chunk.click()
    await page.keyboard.press('Backspace')
    await expect(chunk).toHaveCount(0)
  }
})
