import { describe, expect, it } from 'vitest'
import { clusterLines } from '../src/engine/segmentation/lines'
import { THRESH } from '../src/engine/segmentation/thresholds'
import { testBlob } from './helpers'

describe('engine/segmentation/lines', () => {
  it('clusters blobs on one row and separates rows far apart', () => {
    const blobs = [
      testBlob(0, 40, 10, 49, 19), testBlob(1, 70, 11, 79, 20),
      testBlob(2, 50, 60, 59, 69), testBlob(3, 90, 61, 99, 70),
    ]
    const lines = clusterLines(blobs, THRESH)
    expect(lines).toHaveLength(2)
    expect(lines[0]?.blobs).toHaveLength(2)
    expect(lines[1]?.blobs).toHaveLength(2)
  })

  it('uses the same global height tolerance when a different-height blob shares a centre', () => {
    const blobs = [
      testBlob(0, 10, 10, 19, 19),
      testBlob(1, 30, 5, 39, 24),
      testBlob(2, 50, 11, 59, 20),
    ]
    expect(clusterLines(blobs, THRESH)).toHaveLength(1)
  })

  it('uses the lowest ink bottom as the line baseline', () => {
    const lines = clusterLines([
      testBlob(0, 10, 10, 19, 19),
      testBlob(1, 30, 8, 39, 25),
    ], THRESH)
    expect(lines[0]?.baseline).toBe(25)
  })

  it('returns lines top-to-bottom and breaks ties by the left edge', () => {
    const lines = clusterLines([
      testBlob(0, 90, 50, 99, 59),
      testBlob(1, 10, 10, 19, 19),
      testBlob(2, 40, 50, 49, 59),
      testBlob(3, 30, 10, 39, 19),
    ], THRESH)
    expect(lines.map((line) => line.blobs[0]?.x0)).toEqual([10, 40])
    expect(lines[0]?.blobs.map((blob) => blob.x0)).toEqual([10, 30])
    expect(lines[1]?.blobs.map((blob) => blob.x0)).toEqual([40, 90])
  })

  it('clusters 3000 blobs without an accidental quadratic sweep', () => {
    const blobs = Array.from({ length: 3_000 }, (_, index) => {
      const row = index % 3
      const x = Math.floor(index / 3) * 2
      return testBlob(index, x, row * 30 + 10, x + 1, row * 30 + 19)
    })
    const start = performance.now()
    const lines = clusterLines(blobs, THRESH)
    const elapsed = performance.now() - start
    expect(lines).toHaveLength(3)
    expect(elapsed).toBeLessThan(50)
  }, 1_000)
})
