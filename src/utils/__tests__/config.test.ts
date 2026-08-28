import { describe, it, expect } from 'vitest';
import { createConfig, mmToPx, pxToMm } from '../../core/config';

describe('config', () => {
  it('createConfig merges overrides', () => {
    const c = createConfig({ document: { pageWidthMm: 300 } as never });
    expect(c.document.pageWidthMm).toBe(300);
    expect(c.reflow.dirtyRegionEnabled).toBe(true);
  });
  it('mmToPx and pxToMm invert', () => {
    const px = mmToPx(10, 96, 1);
    expect(pxToMm(px, 96, 1)).toBeCloseTo(10);
  });
});
