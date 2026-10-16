import { describe, expect, it } from 'vitest'
import { orderReading } from '../src/engine/segmentation/reading-order'
import type { Line } from '../src/engine/segmentation/lines'
import { testBlob } from './helpers'

const leftTop = testBlob(0, 10, 10, 19, 19)
const rightTop = testBlob(1, 50, 10, 59, 19)
const leftBottom = testBlob(2, 10, 50, 19, 59)
const rightBottom = testBlob(3, 50, 50, 59, 59)
const boxes = [leftTop, rightTop, leftBottom, rightBottom]
const lines: Line[] = [
  { blobs: [leftTop, rightTop], top: 10, bottom: 19, baseline: 19, medianCy: 14.5 },
  { blobs: [leftBottom, rightBottom], top: 50, bottom: 59, baseline: 59, medianCy: 54.5 },
]

describe('engine/segmentation/reading-order', () => {
  it('orders two lines left-to-right for LTR', () => {
    expect(orderReading(boxes, lines, { direction: 'ltr', columns: 1 })).toEqual([
      leftTop, rightTop, leftBottom, rightBottom,
    ])
  })

  it('orders the same fixture as the exact mirror for RTL', () => {
    expect(orderReading(boxes, lines, { direction: 'rtl', columns: 1 })).toEqual([
      rightTop, leftTop, rightBottom, leftBottom,
    ])
  })

  it('keeps lines top-to-bottom regardless of direction', () => {
    for (const direction of ['ltr', 'rtl'] as const) {
      const ordered = orderReading(boxes, lines, { direction, columns: 1 })
      expect(ordered.map((box) => box.y0)).toEqual(direction === 'ltr' ? [10, 10, 50, 50] : [10, 10, 50, 50])
    }
  })

  it('throws naming the unimplemented multi-column option', () => {
    expect(() => orderReading(boxes, lines, { direction: 'ltr', columns: 2 }))
      .toThrow(/column.*2|2.*column|unimplemented/i)
  })
})
