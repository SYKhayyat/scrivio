import { describe, it, expect } from 'vitest';
import { ReflowEngine } from '../reflow-engine';
import type { DocumentElement } from '../../../core/types';
import { DEFAULT_SETTINGS } from '../../../core/config';

function typed(id: string, w = 10, h = 4): DocumentElement {
  return { kind: 'typed-word', id, text: id, fontFamily: 'serif', fontSize: 4, bold: false, italic: false, underline: false, x: 0, y: 0, width: w, height: h };
}
function chunk(id: string, w = 12, h = 6): DocumentElement {
  return { kind: 'chunk', id, sourceImageId: 's', boundingBox: { x: 0, y: 0, w: 10, h: 10 }, x: 0, y: 0, width: w, height: h };
}

describe('ReflowEngine', () => {
  const engine = new ReflowEngine();
  const settings = { ...DEFAULT_SETTINGS, pageWidthMm: 100, marginLeftMm: 10, marginRightMm: 10 };

  it('lays out elements left to right', () => {
    const els: DocumentElement[] = [typed('a', 10), typed('b', 10), typed('c', 10)];
    const out = engine.reflow(els, settings);
    expect(out[0].x).toBe(10);
    expect(out[1].x).toBe(20);
    expect(out[2].x).toBe(30);
    expect(out[0].y).toBe(0);
  });

  it('wraps when exceeding page width', () => {
    const els: DocumentElement[] = [typed('a', 40), typed('b', 40), typed('c', 40)];
    const out = engine.reflow(els, settings);
    expect(out[2].y).toBeGreaterThan(0);
    expect(out[2].x).toBe(10);
  });

  it('handles line-break', () => {
    const els: DocumentElement[] = [typed('a', 10), { kind: 'line-break', id: 'br', x: 0, y: 0, width: 0, height: 0 }, typed('b', 10)];
    const out = engine.reflow(els, settings);
    expect(out[2].y).toBeGreaterThan(0);
    expect(out[2].x).toBe(10);
  });

  it('handles paragraph-break with spacing', () => {
    const els: DocumentElement[] = [typed('a', 10, 4), { kind: 'paragraph-break', id: 'p', x: 0, y: 0, width: 0, height: 0 }, typed('b', 10, 4)];
    const out = engine.reflow(els, settings);
    expect(out[2].y).toBeGreaterThan(4);
  });

  it('dirty-region reflowFrom', () => {
    const els: DocumentElement[] = [typed('a', 10), typed('b', 10), typed('c', 10), typed('d', 10)];
    const full = engine.reflow(els, settings);
    const partial = engine.reflowFrom(els, settings, 2);
    expect(partial[2].x).toBe(full[2].x);
    expect(partial[2].y).toBe(full[2].y);
  });

  it('page breaks computed', () => {
    const els: DocumentElement[] = Array.from({ length: 10 }, (_, i) => typed(String(i), 80, 20));
    const flowed = engine.reflow(els, settings);
    const breaks = engine.computePageBreaks(flowed, 50);
    expect(breaks.length).toBeGreaterThan(0);
  });
});
