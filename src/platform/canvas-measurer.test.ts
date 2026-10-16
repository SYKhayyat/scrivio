import { describe, expect, it, vi } from 'vitest'
import { CanvasTextMeasurer } from './canvas-measurer'

describe('platform/canvas-measurer', () => {
  it('keys the bounded memo by direction, font, line height, and text', () => {
    const measureText = vi.fn(() => ({ width: 20, actualBoundingBoxAscent: 8 }))
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ getContext: vi.fn(() => ({ measureText })) })) })
    const measurer = new CanvasTextMeasurer()
    const style = { fontPt: 11, lineHeight: 1.2 }

    expect(measurer.widthOf('hello', style, 'ltr')).toBe(measurer.widthOf('hello', style, 'ltr'))
    expect(measurer.widthOf('hello', style, 'rtl')).toBe(measurer.widthOf('hello', style, 'rtl'))
    expect(measureText).toHaveBeenCalledTimes(2)
  })

  it('clears rather than growing past 20,000 cached measurements', () => {
    const measureText = vi.fn(() => ({ width: 1, actualBoundingBoxAscent: 1 }))
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ getContext: vi.fn(() => ({ measureText })) })) })
    const measurer = new CanvasTextMeasurer()
    for (let i = 0; i < 20_001; i += 1) measurer.widthOf(`word-${i}`, { fontPt: 11, lineHeight: 1.2 }, 'ltr')
    expect(measureText).toHaveBeenCalledTimes(20_001)
    measurer.widthOf('word-0', { fontPt: 11, lineHeight: 1.2 }, 'ltr')
    expect(measureText).toHaveBeenCalledTimes(20_002)
  })
})
