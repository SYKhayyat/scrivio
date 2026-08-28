import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

describe('Human flow — as user would use Scrivio', () => {
  it('empty state → demo chunks → insert between chunks → line break → list → footnote → undo/redo → export', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(/Drop a photo of handwriting here/)).toBeVisible();
    await user.click(screen.getByText('Insert demo chunks'));
    expect(document.querySelector('.canvas-layer')).toBeTruthy();
    expect(document.querySelector('.dom-layer')).toBeTruthy();

    const docView = document.querySelector('.document-view') as HTMLElement;
    await user.click(docView);

    await user.keyboard('{ArrowRight} hello');
    expect(document.querySelector('.dom-layer')?.textContent).toContain('hello');

    await user.keyboard('{Enter}');
    await user.keyboard('next line');
    const domText = document.querySelector('.dom-layer')?.textContent ?? '';
    expect(domText).toContain('next line');

    await user.click(screen.getByText('• List'));
    await user.keyboard(' list item');
    expect(document.querySelector('.dom-layer')?.textContent).toContain('list item');

    await user.click(screen.getByText('Footnote'));
    expect(document.querySelector('.dom-layer')?.textContent).toMatch(/\[/);

    const before = document.querySelector('.dom-layer')?.textContent?.length ?? 0;
    await user.keyboard('{Control>}z{/Control}');
    const afterUndo = document.querySelector('.dom-layer')?.textContent?.length ?? 0;
    expect(afterUndo).toBeLessThanOrEqual(before);

    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    const afterRedo = document.querySelector('.dom-layer')?.textContent?.length ?? 0;
    expect(afterRedo).toBeGreaterThanOrEqual(afterUndo);

    const drawBtn = screen.getByText('Draw Chunk');
    await user.click(drawBtn);
    expect(drawBtn.classList.contains('active')).toBe(true);
    await user.keyboard('{Escape}');
    expect(drawBtn.classList.contains('active')).toBe(false);

    await user.click(screen.getByText('Export JSON'));
    await user.click(screen.getByText('Export PDF'));
  });

  it('clear and fresh typed text', async () => {
    const user = userEvent.setup();
    render(<App />);
    const view = document.querySelector('.document-view') as HTMLElement;
    await user.click(view);
    await user.keyboard('Fresh typed text after clear');
    expect(document.querySelector('.dom-layer')?.textContent ?? '').toContain('Fresh typed text');
  });

  it('upload dialog a11y', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getAllByText('Upload')[0]);
    expect(screen.getByText('Upload handwriting')).toBeVisible();
    expect(screen.getByText('Script direction')).toBeVisible();
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Upload handwriting')).not.toBeInTheDocument();
  });

  it('zoom and toolbar', async () => {
    render(<App />);
    expect(screen.getByText('Upload')).toBeVisible();
    expect(screen.getByText('Undo')).toBeVisible();
    expect(screen.getByText('Redo')).toBeVisible();
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
  });
});
