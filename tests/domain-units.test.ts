import { describe, expect, it } from 'vitest'
import { MM_PER_PT, PT_PER_MM } from '../src/domain/units'

describe('domain/units', () => {
  it('round-trips pt and mm', () => {
    for (const mm of [0, 1, 2.79, 10, 210, 297]) {
      expect(mm * PT_PER_MM * MM_PER_PT).toBeCloseTo(mm, 9)
    }
  })
})
