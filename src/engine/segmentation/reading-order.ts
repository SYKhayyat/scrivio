/**
 * Reading-order sorting for segmented chunks.
 *
 * Reading order is: regions in the order given → columns within a region
 * (rightmost first for RTL, leftmost first for LTR) → lines top-to-bottom →
 * left/right within a line.
 *
 * Coordinates are in the same space as the chunks (typically the downscaled
 * image). Regions use divider x-positions to split columns; when dividers are
 * missing or inconsistent, equal-width splits are used.
 */

export type OrderableChunk = { x: number; y: number; w: number; h: number };
export type OrderRegion = { x: number; y: number; w: number; h: number; columns: number; dividers: number[] };

export function orderChunksByRegions<T extends OrderableChunk>(
  chunks: T[],
  direction: 'ltr' | 'rtl',
  regions?: OrderRegion[],
  columns?: number,
): T[] {
  if (chunks.length === 0) return [];

  let effectiveRegions = regions;
  if (!effectiveRegions || effectiveRegions.length === 0) {
    const minX = Math.min(...chunks.map((l) => l.x));
    const maxX = Math.max(...chunks.map((l) => l.x + l.w));
    const minY = Math.min(...chunks.map((l) => l.y));
    const maxY = Math.max(...chunks.map((l) => l.y + l.h));
    const cols = columns && columns > 1 ? Math.min(6, Math.round(columns)) : 1;
    const width = Math.max(1, maxX - minX);
    const dividers = cols > 1 ? Array.from({ length: cols - 1 }, (_, i) => minX + ((i + 1) / cols) * width) : [];
    effectiveRegions = [{ x: minX, y: minY, w: width, h: Math.max(1, maxY - minY), columns: cols, dividers }];
  }

  type Assigned<T> = { chunk: T; regionIdx: number; colIdx: number };

  const assigned: Assigned<T>[] = chunks.map((chunk) => {
    const cx = chunk.x + chunk.w / 2;
    const cy = chunk.y + chunk.h / 2;
    let regionIdx = -1;
    for (let i = 0; i < effectiveRegions!.length; i++) {
      const r = effectiveRegions![i];
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) {
        regionIdx = i;
        break;
      }
    }
    const colIdx = regionIdx === -1 ? 0 : columnReadingIndex(chunk, effectiveRegions![regionIdx], direction);
    return { chunk, regionIdx, colIdx };
  });

  const heights = assigned.map((a) => a.chunk.h).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 4;
  const lineTolerance = medianH * 0.5;

  assigned.sort((a, b) => {
    const regionA = a.regionIdx === -1 ? effectiveRegions!.length : a.regionIdx;
    const regionB = b.regionIdx === -1 ? effectiveRegions!.length : b.regionIdx;
    if (regionA !== regionB) return regionA - regionB;
    if (a.colIdx !== b.colIdx) return a.colIdx - b.colIdx;
    const ya = a.chunk.y + a.chunk.h / 2;
    const yb = b.chunk.y + b.chunk.h / 2;
    if (Math.abs(ya - yb) > lineTolerance) return ya - yb;
    if (direction === 'rtl') return b.chunk.x + b.chunk.w - (a.chunk.x + a.chunk.w);
    return a.chunk.x - b.chunk.x;
  });

  return assigned.map((a) => a.chunk);
}

/**
 * 0-based reading-order index of the column a chunk belongs to inside a
 * region. For LTR the leftmost column is 0; for RTL the rightmost is 0.
 */
export function columnReadingIndex(
  chunk: OrderableChunk,
  region: OrderRegion,
  direction: 'ltr' | 'rtl',
): number {
  const cols = Math.max(1, region.columns || 1);
  if (cols === 1) return 0;
  const cx = chunk.x + chunk.w / 2;
  let dividers = region.dividers;
  if (!dividers || dividers.length !== cols - 1) {
    dividers = Array.from({ length: cols - 1 }, (_, i) => region.x + ((i + 1) / cols) * region.w);
  }
  let colFromLeft = 0;
  for (const d of dividers) if (cx > d) colFromLeft++;
  colFromLeft = Math.min(cols - 1, colFromLeft);
  return direction === 'rtl' ? cols - 1 - colFromLeft : colFromLeft;
}
