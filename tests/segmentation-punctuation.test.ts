import { describe, expect, it } from 'vitest'
import { mergePunctuation } from '../src/engine/segmentation/punctuation'
import { THRESH } from '../src/engine/segmentation/thresholds'
import { testBlob } from './helpers'

const word = { x0: 10, y0: 10, x1: 29, y1: 19, blobIds: [0] }

describe('engine/segmentation/punctuation', () => {
  it('absorbs an adjacent small dense mark and extends the word box', () => {
    const result = mergePunctuation(
      [word],
      [testBlob(0, 10, 10, 29, 19), testBlob(1, 31, 9, 33, 10)],
      [0, 0],
      THRESH,
    )
    expect(result.words[0]).toMatchObject({ x0: 10, y0: 9, x1: 33, y1: 19, blobIds: [0, 1] })
    expect(result.droppedBlobIds).toEqual([])
  })

  it('drops a small mark far from every word and reports its id', () => {
    const result = mergePunctuation(
      [word],
      [testBlob(0, 10, 10, 29, 19), testBlob(1, 100, 9, 102, 10)],
      [0, 0],
      THRESH,
    )
    expect(result.words[0]?.blobIds).toEqual([0])
    expect(result.droppedBlobIds).toEqual([1])
  })

  it('does not absorb a large adjacent blob', () => {
    const result = mergePunctuation(
      [word],
      [testBlob(0, 10, 10, 29, 19), testBlob(1, 31, 8, 35, 16)],
      [0, 0],
      THRESH,
    )
    expect(result.words[0]?.blobIds).toEqual([0])
    expect(result.droppedBlobIds).toEqual([1])
  })

  it('does not absorb a sparse small blob', () => {
    const result = mergePunctuation(
      [word],
      [testBlob(0, 10, 10, 29, 19), testBlob(1, 31, 9, 33, 10, 0.01)],
      [0, 0],
      THRESH,
    )
    expect(result.words[0]?.blobIds).toEqual([0])
    expect(result.droppedBlobIds).toEqual([1])
  })
})
