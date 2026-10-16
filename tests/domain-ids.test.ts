import { describe, expect, it } from 'vitest'
import { newId } from '../src/domain/ids'

describe('domain/ids', () => {
  it('produces ids that are unique across 10k calls', () => {
    const ids = Array.from({ length: 10_000 }, () => newId('chunk'))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('chunk-'))).toBe(true)
  })

  it('sorts ids in creation order', () => {
    const ids = Array.from({ length: 100 }, () => newId('page'))
    expect([...ids].sort()).toEqual(ids)
  })
})
