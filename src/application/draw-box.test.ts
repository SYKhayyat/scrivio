import { describe, expect, it, vi } from 'vitest'
import { drawBox } from './draw-box'

describe('application/draw-box', () => {
  it('uses the worker crop message and inserts the returned chunk at the caret page', async () => {
    const crop = vi.fn(async () => ({ chunkId: 'manual-1', bytes: new Uint8Array([0xff, 0xd8, 0xff]), boxW: 20, boxH: 30, inkOffsetY: 2 }))
    const insert = vi.fn()
    const result = await drawBox({ crop, insert }, { sourcePageId: 'photo-1', box: { x0: 5, y0: 6, x1: 20, y1: 30 }, at: 42 })
    expect(crop).toHaveBeenCalledWith('photo-1', { x0: 5, y0: 6, x1: 20, y1: 30 })
    expect(insert).toHaveBeenCalledWith('photo-1', 'manual-1', 42)
    expect(result).toBe('manual-1')
  })

  it('appends to the page block when the caret is outside that source page', async () => {
    const insert = vi.fn()
    await drawBox({ crop: vi.fn(async () => ({ chunkId: 'manual-2', bytes: new Uint8Array(), boxW: 1, boxH: 1, inkOffsetY: 0 })), insert }, { sourcePageId: 'photo-1', box: { x0: 0, y0: 0, x1: 1, y1: 1 }, at: null })
    expect(insert).toHaveBeenCalledWith('photo-1', 'manual-2', undefined)
  })
})
