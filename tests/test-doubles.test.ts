import { describe, expect, it } from 'vitest'
import { fakeMeasurer } from './fake-measurer'
import { fakeSegmentation, fixedSegmentationResult } from './fake-segmentation'
import { fakePagination, fixedPageLayout, fixedPageSpec } from './fake-pagination'

describe('documented test doubles', () => {
  it('provides a deterministic monospace TextMeasurer without canvas', () => {
    const style = { fontPt: 10, lineHeight: 1.2 }
    expect(fakeMeasurer.widthOf('abcd', style, 'ltr')).toBe(fakeMeasurer.widthOf('abcd', style, 'rtl'))
    expect(fakeMeasurer.widthOf('abcd', style, 'ltr')).toBeGreaterThan(fakeMeasurer.widthOf('ab', style, 'ltr'))
    expect(fakeMeasurer.ascentOf(style)).toBeGreaterThan(0)
  })

  it('returns a fixed segmentation result while preserving substitutability', async () => {
    const result = await fakeSegmentation.segment({ data: new Uint8ClampedArray(4), width: 1, height: 1 }, { direction: 'ltr', columns: 1, crop: true, jpegQuality: 0.82 })
    expect(result).toEqual(fixedSegmentationResult)
    if (result.ok) result.boxes.push({ x0: 0, y0: 0, x1: 0, y1: 0 })
    expect(fixedSegmentationResult.ok && fixedSegmentationResult.boxes).toHaveLength(1)
  })

  it('returns a fixed PageLayout for exporter fidelity tests', () => {
    const result = fakePagination.paginate({ sourcePages: [], blocks: [], footnotes: [] }, fixedPageSpec, fakeMeasurer, new Map())
    expect(result).toEqual(fixedPageLayout)
    expect(result.pages[0]?.lines[0]?.xMm).toBe(31.25)
  })
})
