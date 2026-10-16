import { describe, expect, it, vi } from 'vitest'
import { decodeToBitmap } from './image-decode'

describe('platform/image-decode', () => {
  it('decodes a PNG buffer and reports the original dimensions', async () => {
    const bitmap = { width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

    const result = await decodeToBitmap(new Blob([new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])], { type: 'image/png' }))

    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, bitmap, widthPx: 640, heightPx: 480 })
  })

  it('turns a failed browser decode into the documented result instead of throwing', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new DOMException('bad image', 'EncodingError')))

    await expect(decodeToBitmap(new Blob(['not an image']))).resolves.toEqual({ ok: false, reason: 'decode-failed' })
  })
})
