import { describe, expect, it } from 'vitest'
import { connectedComponents } from '../src/engine/segmentation/components'

function mask(width: number, height: number, points: Array<[number, number]>): Uint8Array {
  const result = new Uint8Array(width * height)
  for (const [x, y] of points) result[y * width + x] = 1
  return result
}

describe('engine/segmentation/components', () => {
  it('joins squares one pixel apart but keeps squares two pixels apart separate', () => {
    const joined = mask(8, 4, [[1, 1], [2, 1], [3, 1], [4, 1]])
    expect(connectedComponents(joined, 8, 4, 1)).toHaveLength(1)
    const separate = mask(8, 4, [[1, 1], [3, 1]])
    expect(connectedComponents(separate, 8, 4, 1)).toHaveLength(2)
  })

  it('joins a diagonal chain under eight-connectivity', () => {
    const blobs = connectedComponents(mask(8, 8, [[1, 1], [2, 2], [3, 3], [4, 4]]), 8, 8, 1)
    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.area).toBe(4)
  })

  it('reports pixel area and a fill in the inclusive bounding box', () => {
    const [blob] = connectedComponents(mask(5, 5, [[1, 1], [2, 1], [1, 2]]), 5, 5, 1)
    expect(blob).toMatchObject({ area: 3, x0: 1, y0: 1, x1: 2, y1: 2 })
    expect(blob?.fill).toBeCloseTo(0.75)
  })

  it('drops components below the minimum area', () => {
    expect(connectedComponents(mask(5, 5, [[1, 1], [2, 1], [4, 4]]), 5, 5, 2)).toHaveLength(1)
  })

  it('returns a full-image component so the pipeline can own the large-component filter', () => {
    const [blob] = connectedComponents(new Uint8Array(10 * 10).fill(1), 10, 10, 1)
    expect(blob).toMatchObject({ x0: 0, y0: 0, x1: 9, y1: 9, area: 100, fill: 1 })
  })

  it('handles a 500 by 500 solid component without recursive-stack failure', () => {
    const blobs = connectedComponents(new Uint8Array(500 * 500).fill(1), 500, 500, 1)
    expect(blobs).toHaveLength(1)
    expect(blobs[0]?.area).toBe(250_000)
  }, 2_000)
})
