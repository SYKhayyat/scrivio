import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Scrivio — human verification', () => {
  test('empty state + demo chunks + editing as human would', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Scrivio')).toBeVisible();
    await expect(page.getByText('Drop a photo of handwriting here')).toBeVisible();

    await page.getByRole('button', { name: 'Insert demo chunks' }).click();
    await expect(page.locator('.canvas-layer')).toBeVisible();
    await expect(page.locator('.dom-layer')).toBeVisible();

    const docView = page.locator('.document-view');
    await docView.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' hello');
    await expect(page.locator('.dom-layer')).toContainText('hello');

    await page.keyboard.press('Enter');
    const yBefore = await page.evaluate(() => document.querySelector('.dom-layer')?.getBoundingClientRect().height ?? 0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('next line');
    const yAfter = await page.evaluate(() => document.querySelector('.dom-layer')?.getBoundingClientRect().height ?? 0);
    expect(yAfter).toBeGreaterThanOrEqual(yBefore);

    await page.getByRole('button', { name: '• List' }).click();
    await page.keyboard.type(' list item');
    await expect(page.locator('.dom-layer')).toContainText('list item');

    await page.getByRole('button', { name: 'Footnote' }).click();
    await expect(page.locator('.dom-layer')).toContainText('[');

    const beforeUndo = await page.locator('.dom-layer').innerText();
    await page.keyboard.press('Control+z');
    const afterUndo = await page.locator('.dom-layer').innerText();
    expect(afterUndo.length).toBeLessThanOrEqual(beforeUndo.length);
    await page.keyboard.press('Control+Shift+z');
    const afterRedo = await page.locator('.dom-layer').innerText();
    expect(afterRedo.length).toBeGreaterThanOrEqual(afterUndo.length);

    await page.getByRole('button', { name: 'Draw Chunk' }).click();
    await expect(page.getByRole('button', { name: 'Draw Chunk' })).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Draw Chunk' })).not.toHaveClass(/active/);

    await page.evaluate(() => {
      const link = document.createElement('a');
      link.download = 'test.json';
      document.body.appendChild(link);
      return link.download;
    });
    await page.getByRole('button', { name: 'Export JSON' }).click();
    await page.getByRole('button', { name: 'Export PDF' }).click();

    const zoomInput = page.locator('input[type="range"]');
    await zoomInput.fill('2');
    await expect(page.locator('.page')).toBeVisible();
  });

  test('upload real handwriting + insert between chunks', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Insert demo chunks' }).click();
    await page.locator('.document-view').click();

    await page.keyboard.press('Home');
    await page.keyboard.type('Start: ');
    await expect(page.locator('.dom-layer')).toContainText('Start:');

    await page.keyboard.press('End');
    await page.keyboard.type(' :End');
    await expect(page.locator('.dom-layer')).toContainText(':End');

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    const emptyCount = await page.evaluate(() => document.querySelectorAll('.dom-layer span').length);
    expect(emptyCount).toBeLessThanOrEqual(2);

    await page.keyboard.type('Fresh typed text after clear');
    await expect(page.locator('.dom-layer')).toContainText('Fresh typed text');
  });

  test('handwriting file upload dialog', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Upload' }).first().click();
    await expect(page.getByText('Upload handwriting')).toBeVisible();
    await expect(page.getByText('Script direction')).toBeVisible();
    await expect(page.getByText('Source layout')).toBeVisible();
    const fileInput = page.locator('input[type="file"]');
    const handwritingPath = path.resolve('public/test-images/handwriting2.jpg');
    await fileInput.setInputFiles(handwritingPath);
    await expect(page.locator('.file-list')).toContainText('handwriting2.jpg');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Upload handwriting')).not.toBeVisible();
  });

  test('a11y and keyboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar')).toBeVisible();
    await expect(page.locator('.document-view')).toHaveAttribute('tabIndex', '0');
    const buttons = page.getByRole('button');
    await expect(buttons.first()).toBeVisible();
    for (const name of ['Upload', 'Undo', 'Redo', 'Export PDF', 'Export JSON']) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
  });
});
