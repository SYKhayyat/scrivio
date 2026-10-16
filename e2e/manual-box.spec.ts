import { test, expect } from '@playwright/test'

test('draw a box, confirm it, and insert a chunk', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /draw box/i }).click()
  const overlay = page.getByTestId('source-draw-overlay')
  await expect(overlay).toBeVisible()
  const box = await overlay.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10)
  await page.mouse.down()
  await page.mouse.move((box?.x ?? 0) + 100, (box?.y ?? 0) + 80)
  await page.mouse.up()
  await page.getByRole('button', { name: /confirm/i }).click()
  await expect(page.locator('img.chunk')).toHaveCount(1, { timeout: 15_000 })
})
