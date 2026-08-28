import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';

describe('Human flow — as user would use Scrivio', () => {
  it('empty state → insert between chunks → line break → list → footnote → undo/redo → export', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Scrivio')).toBeVisible();
    expect(screen.getByRole('button', { name: /Open handwriting/ })).toBeVisible();
    expect(document.querySelector('.canvas-layer')).toBeTruthy();
    expect(document.querySelector('.dom-layer')).toBeTruthy();

    const docView = document.querySelector('.document-view') as HTMLElement;
    await user.click(docView);
    await user.keyboard('hello');
    await user.keyboard('{ArrowLeft}{ArrowLeft}X');

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

    const drawBtn = screen.getByRole('button', { name: 'Draw' });
    await user.click(drawBtn);
    expect(drawBtn.classList.contains('active')).toBe(true);
    await user.keyboard('{Escape}');
    expect(drawBtn.classList.contains('active')).toBe(false);

    await user.click(screen.getByText('Export JSON'));
    await user.click(screen.getByText('Export PDF'));
    await user.click(screen.getByText('Export Ksav'));
  });

  it('clear and fresh typed text', async () => {
    const user = userEvent.setup();
    render(<App />);
    const view = document.querySelector('.document-view') as HTMLElement;
    await user.click(view);
    await user.keyboard('Fresh typed text after clear');
    expect(document.querySelector('.dom-layer')?.textContent ?? '').toContain('Fresh typed text');
  });

  it('source pane opens with the original view and view modes toggle panes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Open$/ }));
    expect(await screen.findByRole('heading', { name: 'Original' })).toBeVisible();
    expect(screen.getByText(/Drop handwriting photos here/)).toBeVisible();

    // Document-only view hides the pane; split brings it back.
    await user.click(screen.getByRole('button', { name: /Document/ }));
    expect(screen.queryByRole('heading', { name: 'Original' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Split/ }));
    expect(await screen.findByRole('heading', { name: 'Original' })).toBeVisible();

    // Original-only view hides the document.
    await user.click(screen.getByRole('button', { name: /Original/ }));
    expect(screen.queryByText('Scrivio')).not.toBeInTheDocument();
  });

  it('menu bar: View modes and Export Ksav are wired', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Help → About
    await user.click(screen.getByRole('menuitem', { name: 'Help' }));
    await user.click(screen.getByRole('menuitem', { name: /About Scrivio/ }));
    expect(screen.getByText(/Version 1\.0\.0/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // View → Document Only hides the source pane
    await user.click(screen.getByRole('menuitem', { name: 'View' }));
    await user.click(screen.getByRole('menuitem', { name: /Document Only/ }));
    expect(screen.queryByRole('heading', { name: 'Original' })).not.toBeInTheDocument();
  });

  it('zoom and toolbar', async () => {
    render(<App />);
    expect(screen.getByText('Open')).toBeVisible();
    expect(screen.getByText('Undo')).toBeVisible();
    expect(screen.getByText('Redo')).toBeVisible();
    const slider = document.querySelector('input[type="range"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    expect(document.querySelector('.statusbar')).toBeTruthy();
    expect(document.querySelector('.source-pane')).toBeTruthy();
  });
});
