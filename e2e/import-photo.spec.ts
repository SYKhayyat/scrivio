import { test, expect } from '@playwright/test'

const tinyPng = {
  name: 'note.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
}

test('load, upload one photo, and show chunks plus source boxes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('main', { name: 'Scrivio' })).toBeVisible()
  await page.getByLabel(/import photo/i).setInputFiles(tinyPng)
  await expect(page.locator('img.chunk').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid^="detected-box-"]').first()).toBeVisible()
})
