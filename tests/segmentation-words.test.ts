import { describe, expect, it } from 'vitest'
import { groupWords } from '../src/engine/segmentation/words'
import { THRESH } from '../src/engine/segmentation/thresholds'
import type { Line } from '../src/engine/segmentation/lines'
import { testBlob } from './helpers'

function line(blobs: ReturnType<typeof testBlob>[]): Line {
  return { blobs, top: 0, bottom: 10, baseline: 10, medianCy: 5 }
}

describe('engine/segmentation/words', () => {
  it('groups blobs separated by a space-sized gap into two words', () => {
    const result = groupWords(line([
      testBlob(0, 0, 0, 9, 9),
      testBlob(1, 30, 0, 39, 9),
    ]), 10, THRESH)
    expect(result).toHaveLength(2)
    expect(result.map((word) => word.blobIds)).toEqual([[0], [1]])
  })

  it('keeps blobs separated by a hairline gap in one word', () => {
    const result = groupWords(line([
      testBlob(0, 0, 0, 9, 9),
      testBlob(1, 11, 0, 19, 9),
    ]), 10, THRESH)
    expect(result).toHaveLength(1)
    expect(result[0]?.blobIds).toEqual([0, 1])
    expect(result[0]).toMatchObject({ x0: 0, x1: 19 })
  })

  it('keeps word grouping bucket-local to the line supplied', () => {
    const first = groupWords(line([testBlob(0, 0, 0, 9, 9), testBlob(1, 30, 0, 39, 9)]), 10, THRESH)
    const second = groupWords(line([testBlob(2, 0, 100, 9, 109), testBlob(3, 11, 100, 20, 109)]), 10, THRESH)
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(1)
  })

  it('returns words left-to-right', () => {
    const result = groupWords(line([
      testBlob(0, 40, 0, 49, 9),
      testBlob(1, 0, 0, 9, 9),
    ]), 10, THRESH)
    expect(result.map((word) => word.x0)).toEqual([0, 40])
  })

  it('returns a single blob as one word', () => {
    const result = groupWords(line([testBlob(7, 4, 2, 14, 12)]), 10, THRESH)
    expect(result).toHaveLength(1)
    expect(result[0]?.blobIds).toEqual([7])
  })
})
