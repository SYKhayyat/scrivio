import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Scrivio — human verification', () => {
  test('empty state + typing + formatting as a human would', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Scrivio')).toBeVisible();
    await expect(page.getByRole('button', { name: /Open handwriting/ })).toBeVisible();

    const docView = page.locator('.document-view');
    await docView.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type(' hello');
    await expect(page.locator('.dom-layer')).toContainText('hello');

    await page.keyboard.press('Enter');
    const yBefore = await page.evaluate(() => document.querySelector('.dom-layer')?.getBoundingClientRect().height ?? 0);
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

    await page.getByRole('button', { name: 'Draw' }).click();
    await expect(page.getByRole('button', { name: 'Draw' })).toHaveClass(/active/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Draw' })).not.toHaveClass(/active/);

    await page.getByRole('button', { name: 'Export JSON' }).click();
    await page.getByRole('button', { name: 'Export PDF' }).click();

    const zoomInput = page.locator('input[type="range"]');
    await zoomInput.fill('2');
    await expect(page.locator('.page')).toBeVisible();
  });

  test('menu bar: Help → About and File → Open triggers the file picker', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: /About Scrivio/ }).click();
    await expect(page.getByText(/Version 1\.0\.0/)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Open…/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(path.resolve('public/test-images/handwriting2.jpg'));
    // The original pane opens with the file auto-segmented.
    await expect(page.getByRole('heading', { name: 'Original' })).toBeVisible();
    await expect(page.locator('.import-chunk').first()).toBeVisible({ timeout: 20000 });
  });

  test('import workflow: pick file → auto-segment → select chunks → insert at cursor', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('.source-pane input[type="file"]');
    const handwritingPath = path.resolve('public/test-images/handwriting2.jpg');
    await fileInput.setInputFiles(handwritingPath);

    await expect(page.locator('.source-tab-name')).toContainText('handwriting2.jpg');
    // Auto-segmentation runs; wait for chunk boxes to appear on the preview.
    await expect(page.locator('.import-chunk').first()).toBeVisible({ timeout: 20000 });
    const chunkCount = await page.locator('.import-chunk').count();
    expect(chunkCount).toBeGreaterThan(0);

    // The footer confirm is visible and enabled once chunks exist.
    const insertBtn = page.getByRole('button', { name: 'Insert selection at cursor' });
    await expect(insertBtn).toBeVisible();
    await expect(insertBtn).toBeEnabled();
    const footerCount = page.locator('.source-pane-footer .muted');
    await expect(footerCount).toContainText(`${chunkCount} chunks selected`);

    // Clicking a box toggles it off (footer count drops by one), then All restores.
    await page.locator('.import-chunk').first().click({ force: true });
    await expect(footerCount).toContainText(`${chunkCount - 1} chunks selected`);
    await page.locator('.source-controls').getByRole('button', { name: 'All', exact: true }).click();
    await expect(footerCount).toContainText(`${chunkCount} chunks selected`);

    // Insert at cursor.
    await insertBtn.click();
    // All chunks land in the document at once (no progressive trickle).
    await expect(page.locator('.dom-layer span[aria-label="handwritten chunk"]')).toHaveCount(chunkCount);
    await expect(page.locator('.canvas-layer')).toBeVisible();
  });

  test('region drawing adds a section with column control', async ({ page }) => {
    await page.goto('/');
    const fileInput = page.locator('.source-pane input[type="file"]');
    await fileInput.setInputFiles(path.resolve('public/test-images/handwriting2.jpg'));
    await expect(page.locator('.import-chunk').first()).toBeVisible({ timeout: 20000 });

    await page.getByRole('button', { name: 'Draw section…' }).click();
    const surface = page.locator('.import-surface');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 180, box.y + 120, { steps: 8 });
      await page.mouse.up();
    }
    await expect(page.locator('.import-region').first()).toBeVisible();
    await expect(page.locator('.import-region-label').first()).toHaveText('Section 1');
    // Divider handles appear for the default 2 columns and are draggable.
    const divider = page.locator('.import-divider').first();
    await expect(divider).toBeVisible();
    const before = await divider.boundingBox();
    expect(before).not.toBeNull();
    if (before) {
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.mouse.down();
      await page.mouse.move(before.x + 70, before.y + before.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      const after = await divider.boundingBox();
      expect(after).not.toBeNull();
      expect(after!.x).toBeGreaterThan(before.x + 40);
    }
  });

  test('a11y and keyboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar')).toBeVisible();
    await expect(page.locator('.document-view')).toHaveAttribute('tabIndex', '0');
    await expect(page.locator('.statusbar')).toBeVisible();
    const buttons = page.getByRole('button');
    await expect(buttons.first()).toBeVisible();
    for (const name of ['Open', 'Undo', 'Redo', 'Export PDF', 'Export JSON']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });
});
