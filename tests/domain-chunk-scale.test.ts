import { describe, expect, it } from 'vitest'
import { MM_PER_PT } from '../src/domain/units'
import { computeChunkScale, targetInkMm } from '../src/domain/chunk-scale'

function chunk(chunkId: string, inkH: number, inkW = 50, boxW = 60, boxH = 110) {
  return { chunkId, inkW, inkH, boxW, boxH }
}

describe('domain/chunk-scale', () => {
  it('is a no-op when the photo ink is already at the target height', () => {
    const result = computeChunkScale({
      photoWidthPx: 2_100,
      chunks: [chunk('a', 100)],
      pageWidthMm: 210,
      targetInkMm: 10,
    })
    expect(result.scaleMmPerPx).toBeCloseTo(0.1)
    expect(result.sizes.get('a')).toEqual({ w: 6, h: 11 })
  })

  it('uses the median rather than the mean for one ten-times outlier', () => {
    const ordinary = [chunk('a', 100), chunk('b', 100), chunk('c', 100), chunk('d', 100), chunk('e', 100)]
    const withOutlier = [...ordinary, chunk('outlier', 1_000)]
    const input = { photoWidthPx: 1_000, pageWidthMm: 100, targetInkMm: 10 }
    expect(computeChunkScale({ ...input, chunks: ordinary }).scaleMmPerPx)
      .toBeCloseTo(computeChunkScale({ ...input, chunks: withOutlier }).scaleMmPerPx)
  })

  it('clamps a pathological blob while neighbours remain at the target', () => {
    const result = computeChunkScale({
      photoWidthPx: 1_000,
      chunks: [chunk('a', 100), chunk('b', 100), chunk('c', 100), chunk('d', 100), chunk('e', 100), chunk('pathological', 1_000)],
      pageWidthMm: 100,
      targetInkMm: 10,
    })
    expect(result.sizes.get('a')?.h).toBeCloseTo(11)
    expect(result.sizes.get('pathological')?.h).toBeCloseTo(16 * 1.1)
  })

  it('normalises different-resolution photos to the same median display height per photo', () => {
    const first = computeChunkScale({
      photoWidthPx: 1_000,
      chunks: [chunk('first', 100)],
      pageWidthMm: 210,
      targetInkMm: 10,
    })
    const second = computeChunkScale({
      photoWidthPx: 2_000,
      chunks: [chunk('second', 200)],
      pageWidthMm: 210,
      targetInkMm: 10,
    })
    expect(first.sizes.get('first')?.h).toBeCloseTo(second.sizes.get('second')?.h ?? NaN)
    expect(first.scaleMmPerPx).not.toBe(second.scaleMmPerPx)
  })

  it('preserves each cropped box aspect ratio', () => {
    const result = computeChunkScale({
      photoWidthPx: 1_000,
      chunks: [chunk('wide', 100, 40, 80, 100)],
      pageWidthMm: 100,
      targetInkMm: 10,
    })
    const size = result.sizes.get('wide')
    expect(size).toBeDefined()
    expect((size?.w ?? 0) / (size?.h ?? 1)).toBeCloseTo(0.8)
  })

  it('returns the natural scale and no sizes for all-degenerate input', () => {
    const result = computeChunkScale({
      photoWidthPx: 1_000,
      chunks: [],
      pageWidthMm: 100,
      targetInkMm: 10,
    })
    expect(result).toEqual({ scaleMmPerPx: 0.1, sizes: new Map() })
  })

  it('derives the target ink height from the type size', () => {
    expect(targetInkMm(11)).toBeCloseTo(11 * 0.72 * MM_PER_PT)
  })
})
