import { describe, expect, it } from 'vitest'
import { binarize } from '../src/engine/segmentation/binarize'
import { THRESH } from '../src/engine/segmentation/thresholds'

function gradient(width: number, height: number): Uint8Array {
  const values = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = 160 + Math.floor((x / (width - 1)) * 90)
    }
  }
  return values
}

function expectedCentralInk(luma: Uint8Array, width: number, x: number, y: number): number {
  const radius = 7
  const values: number[] = []
  for (let yy = y - radius; yy <= y + radius; yy += 1) {
    for (let xx = x - radius; xx <= x + radius; xx += 1) {
      values.push(luma[yy * width + xx] ?? 0)
    }
  }
  const sum = values.reduce((total, value) => total + value, 0)
  const mean = sum / values.length
  const variance = values.reduce((total, value) => total + value * value, 0) / values.length - mean * mean
  const threshold = mean - Math.max(THRESH.binarizeCFloor, THRESH.binarizeCFrac * Math.sqrt(Math.max(0, variance)))
  return (luma[y * width + x] ?? 0) < threshold ? 1 : 0
}

describe('engine/segmentation/binarize', () => {
  it('keeps ink density uniform across a left-to-right lighting gradient', () => {
    const width = 160
    const height = 64
    const luma = gradient(width, height)
    for (let y = 12; y < 16; y += 1) {
      for (let x = 4; x < width - 4; x += 1) luma[y * width + x] = (luma[y * width + x] ?? 0) - 80
    }
    for (let y = 36; y < 40; y += 1) {
      for (let x = 4; x < width - 4; x += 1) luma[y * width + x] = (luma[y * width + x] ?? 0) - 80
    }
    const out = new Uint8Array(width * height)
    binarize(luma, width, height, out, THRESH)
    const inkPerColumn = Array.from({ length: width - 16 }, (_, index) => {
      const x = index + 8
      let count = 0
      for (let y = 0; y < height; y += 1) count += out[y * width + x] ?? 0
      return count
    })
    expect(Math.max(...inkPerColumn) - Math.min(...inkPerColumn)).toBeLessThanOrEqual(2)
  })

  it('produces no ink for a uniform mid-grey region', () => {
    const out = new Uint8Array(80 * 80)
    binarize(new Uint8Array(80 * 80).fill(127), 80, 80, out, THRESH)
    expect(out.some((value) => value !== 0)).toBe(false)
  })

  it('writes only zero and one into the caller-provided output buffer', () => {
    const out = new Uint8Array(31 * 31).fill(255)
    binarize(new Uint8Array(31 * 31).fill(255), 31, 31, out, THRESH)
    expect([...new Set(out)]).toEqual([0])
  })

  it('uses an odd window inside the configured bounds at small and huge widths', () => {
    for (const [width, height] of [[300, 300], [5_000, 2_000]]) {
      const luma = new Uint8Array(width * height).fill(255)
      const out = new Uint8Array(width * height)
      const stats = binarize(luma, width, height, out, THRESH) as unknown as { window: number }
      expect(stats.window % 2).toBe(1)
      expect(stats.window).toBeGreaterThanOrEqual(THRESH.windowMin)
      expect(stats.window).toBeLessThanOrEqual(THRESH.windowMax)
    }
  }, 5_000)

  it('matches the brute-force local mean and standard deviation at a central pixel', () => {
    const width = 31
    const height = 31
    const luma = new Uint8Array(width * height).fill(100)
    for (let y = 12; y <= 18; y += 1) {
      for (let x = 12; x <= 18; x += 1) luma[y * width + x] = 200
    }
    // This value lies between the fixed floor threshold and the std-scaled
    // threshold, so ignoring local variance produces the opposite result.
    luma[15 * width + 15] = 114
    const out = new Uint8Array(width * height)
    binarize(luma, width, height, out, THRESH)
    expect(out[15 * width + 15]).toBe(expectedCentralInk(luma, width, 15, 15))
  })

  it('does not overflow the square-sum integral on a 2400 by 1800 uniform image', () => {
    const width = 2_400
    const height = 1_800
    const luma = new Uint8Array(width * height).fill(255)
    const out = new Uint8Array(width * height)
    binarize(luma, width, height, out, THRESH)
    expect(out.some((value) => value !== 0)).toBe(false)
  }, 10_000)
})
