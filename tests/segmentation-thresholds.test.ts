import { describe, expect, it } from 'vitest'
import { THRESH } from '../src/engine/segmentation/thresholds'

describe('engine/segmentation/thresholds', () => {
  it('exports the complete frozen working-threshold object', () => {
    expect(THRESH).toEqual({
      longEdgePx: 2400,
      windowDivisor: 40,
      windowMin: 15,
      windowMax: 101,
      binarizeCFrac: 0.18,
      binarizeCFloor: 6,
      minBlobArea: 12,
      minBlobAreaFrac: 0.000015,
      maxBlobAreaFrac: 0.25,
      lineToleranceFrac: 0.6,
      wordGapFrac: 1.5,
      punctHeightFrac: 0.4,
      punctGapFrac: 1.2,
      punctFillMin: 0.08,
      minWordsForSuccess: 3,
      tooDarkMean: 60,
      tooFlatStd: 12,
    })
    expect(Object.isFrozen(THRESH)).toBe(true)
  })
})
