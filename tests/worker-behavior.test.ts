import { describe, expect, it, vi } from 'vitest'
import { segmentSync } from '../src/engine/segmentation/pipeline'
import { handleMessage } from '../src/workers/segmentation.worker'

vi.mock('../src/engine/segmentation/pipeline', () => ({
  segmentSync: vi.fn(() => ({
    ok: true,
    boxes: [{ x0: 1, y0: 2, x1: 4, y1: 5 }],
    lineIndexOf: [0],
    baselineOf: [5],
    chunks: [],
  })),
}))

describe('segmentation.worker', () => {
  it('is a thin shell over segmentSync and posts one terminal result', async () => {
    const postMessage = vi.fn()
    const bitmap = { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap

    await handleMessage({
      type: 'segment', jobId: 'job-1', bitmap, direction: 'ltr', columns: 1, crop: false, jpegQuality: 0.8,
    }, postMessage)

    expect(segmentSync).toHaveBeenCalledWith(bitmap, { direction: 'ltr', columns: 1, crop: false, jpegQuality: 0.8 })
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'photo-done', jobId: 'job-1' }), [])
    expect(postMessage.mock.calls.filter(([message]) => message.type === 'photo-done' || message.type === 'failed')).toHaveLength(1)
  })

  it('does not produce photo-done when cancellation arrives before a job starts', async () => {
    const postMessage = vi.fn()
    await handleMessage({ type: 'cancel', jobId: 'cancelled' }, postMessage)
    await handleMessage({
      type: 'segment', jobId: 'cancelled', bitmap: { width: 10, height: 10 } as unknown as ImageBitmap,
      direction: 'ltr', columns: 1, crop: false, jpegQuality: 0.8,
    }, postMessage)
    expect(postMessage.mock.calls.some(([message]) => message.type === 'photo-done' && message.jobId === 'cancelled')).toBe(false)
  })

  it('transfers chunk byte buffers in the outbound message', async () => {
    const postMessage = vi.fn()
    vi.mocked(segmentSync).mockReturnValueOnce({
      ok: true,
      boxes: [{ x0: 1, y0: 2, x1: 4, y1: 5 }], lineIndexOf: [0], baselineOf: [5],
      chunks: [{ chunkId: 'c1', bytes: new Uint8Array([1, 2]), boxW: 4, boxH: 4, inkOffsetY: 1 }],
    })
    await handleMessage({
      type: 'segment', jobId: 'job-2', bitmap: { width: 10, height: 10 } as unknown as ImageBitmap,
      direction: 'ltr', columns: 1, crop: true, jpegQuality: 0.8,
    }, postMessage)
    expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'photo-done' }), [expect.any(ArrayBuffer)])
  })
})
