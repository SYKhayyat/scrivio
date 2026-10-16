import { test, expect } from '@playwright/test'

test('?stress=20 completes and reports timings without console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/?stress=20')
  const report = page.getByRole('region', { name: /stress report/i })
  await expect(report).toBeVisible({ timeout: 120_000 })
  await expect(report).toContainText(/segmentation/i)
  await expect(report).toContainText(/first.*editable|first.*paint/i)
  await expect(report).toContainText(/typing/i)
  await expect(report).toContainText(/scroll/i)
  expect(errors).toEqual([])
})
