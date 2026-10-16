import { test, expect } from '@playwright/test'

test('export HTML without network references and export a non-trivial PDF', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /export/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const htmlDownload = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /html/i }).click()
  const htmlPath = await (await htmlDownload).path()
  expect(htmlPath).toBeTruthy()
  const html = await (await htmlDownload).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of html!) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString()).not.toMatch(/http/i)

  await page.getByRole('button', { name: /export/i }).click()
  const pdfDownload = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: /pdf/i }).click()
  const pdf = await (await pdfDownload).path()
  expect(pdf).toBeTruthy()
  const pdfBytes = await (await pdfDownload).createReadStream()
  const pdfChunks: Buffer[] = []
  for await (const chunk of pdfBytes!) pdfChunks.push(Buffer.from(chunk))
  expect(Buffer.concat(pdfChunks).subarray(0, 5).toString()).toBe('%PDF-')
  expect(Buffer.concat(pdfChunks).length).toBeGreaterThan(100)
})
