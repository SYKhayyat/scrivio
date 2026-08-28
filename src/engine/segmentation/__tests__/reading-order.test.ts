import { describe, it, expect } from 'vitest';
import { orderChunksByRegions, columnReadingIndex } from '../reading-order';

type Chunk = { id: string; x: number; y: number; w: number; h: number };

const c = (id: string, x: number, y: number, w = 10, h = 10): Chunk => ({ id, x, y, w, h });
const ids = (chunks: Chunk[]) => chunks.map((ch) => ch.id);

describe('orderChunksByRegions', () => {
  it('orders a single-column page top-to-bottom, left-to-right for LTR', () => {
    const chunks = [c('b', 50, 0), c('a', 10, 0), c('d', 50, 30), c('c', 10, 30)];
    const out = orderChunksByRegions(chunks, 'ltr');
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('orders a single-column page right-to-left for RTL', () => {
    const chunks = [c('b', 50, 0), c('a', 10, 0), c('d', 50, 30), c('c', 10, 30)];
    const out = orderChunksByRegions(chunks, 'rtl');
    expect(ids(out)).toEqual(['b', 'a', 'd', 'c']);
  });

  it('reads a 2-column page column-by-column (column-major), not interleaved', () => {
    // Left column at x=0..100, right column at x=100..200, 2 lines each.
    const chunks = [
      c('l1', 10, 0),
      c('r1', 110, 0),
      c('l2', 10, 40),
      c('r2', 110, 40),
    ];
    const out = orderChunksByRegions(chunks, 'ltr', undefined, 2);
    // Column-major LTR: left column top-to-bottom, then right column.
    expect(ids(out)).toEqual(['l1', 'l2', 'r1', 'r2']);
  });

  it('reads a 2-column page right column first for RTL', () => {
    const chunks = [c('l1', 10, 0), c('r1', 110, 0), c('l2', 10, 40), c('r2', 110, 40)];
    const out = orderChunksByRegions(chunks, 'rtl', undefined, 2);
    expect(ids(out)).toEqual(['r1', 'r2', 'l1', 'l2']);
  });

  it('respects custom divider positions within a region', () => {
    // Region spans x 0..200, but the divider sits at 150, so the "right"
    // column is narrow (150..200) and the left column is wide.
    const region = { x: 0, y: 0, w: 200, h: 100, columns: 2, dividers: [150] };
    const chunks = [c('wide', 20, 0), c('narrow', 170, 0), c('wide2', 20, 40), c('narrow2', 170, 40)];
    const out = orderChunksByRegions(chunks, 'ltr', [region]);
    expect(ids(out)).toEqual(['wide', 'wide2', 'narrow', 'narrow2']);
    const rtl = orderChunksByRegions(chunks, 'rtl', [region]);
    expect(ids(rtl)).toEqual(['narrow', 'narrow2', 'wide', 'wide2']);
  });

  it('reads regions in the order given, not by position', () => {
    // Region A = right half, Region B = left half. A must read first.
    const right = { id: 'a', x: 100, y: 0, w: 100, h: 100, columns: 1, dividers: [] as number[] };
    const left = { id: 'b', x: 0, y: 0, w: 100, h: 100, columns: 1, dividers: [] as number[] };
    const chunks = [c('rightChunk', 150, 0), c('leftChunk', 20, 0)];
    const out = orderChunksByRegions(chunks, 'ltr', [right, left]);
    expect(ids(out)).toEqual(['rightChunk', 'leftChunk']);
  });

  it('appends chunks outside any region last', () => {
    const region = { x: 0, y: 0, w: 100, h: 100, columns: 1, dividers: [] as number[] };
    const chunks = [c('inside', 20, 0), c('outside', 300, 0)];
    const out = orderChunksByRegions(chunks, 'ltr', [region]);
    expect(ids(out)).toEqual(['inside', 'outside']);
  });
});

describe('columnReadingIndex', () => {
  it('RTL: rightmost column reads first', () => {
    const region = { x: 0, y: 0, w: 200, h: 100, columns: 2, dividers: [100] };
    expect(columnReadingIndex(c('right', 150, 0), region, 'rtl')).toBe(0);
    expect(columnReadingIndex(c('left', 20, 0), region, 'rtl')).toBe(1);
    expect(columnReadingIndex(c('right', 150, 0), region, 'ltr')).toBe(1);
    expect(columnReadingIndex(c('left', 20, 0), region, 'ltr')).toBe(0);
  });

  it('three columns with custom dividers', () => {
    const region = { x: 0, y: 0, w: 300, h: 100, columns: 3, dividers: [80, 220] };
    expect(columnReadingIndex(c('mid', 150, 0), region, 'ltr')).toBe(1);
    expect(columnReadingIndex(c('mid', 150, 0), region, 'rtl')).toBe(1);
    expect(columnReadingIndex(c('right', 250, 0), region, 'rtl')).toBe(0);
    expect(columnReadingIndex(c('left', 10, 0), region, 'rtl')).toBe(2);
  });
});
