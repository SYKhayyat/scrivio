import { describe, expect, it } from 'vitest'
import { toLuma, lumaStats } from '../src/engine/segmentation/luma'

describe('engine/segmentation/luma', () => {
  it('maps black, white, and mid-grey to their BT.601 luma values', () => {
    const input = {
      data: new Uint8ClampedArray([
        0, 0, 0, 255,
        255, 255, 255, 255,
        128, 128, 128, 255,
      ]),
      width: 3,
      height: 1,
    }
    expect([...toLuma(input)]).toEqual([0, 255, 128])
  })

  it('returns exactly one luma value per pixel', () => {
    const input = { data: new Uint8ClampedArray(4 * 7 * 4), width: 7, height: 4 }
    expect(toLuma(input)).toHaveLength(28)
  })

  it('reports zero standard deviation for an all-grey image', () => {
    const luma = new Uint8Array(100).fill(127)
    expect(lumaStats(luma)).toEqual({ mean: 127, std: 0 })
  })
})
