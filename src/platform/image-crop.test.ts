import { describe, expect, it, vi } from 'vitest'
import { cropEncode, DEFAULT_PAD } from './image-crop'

function installCanvas(blobBytes = [0xff, 0xd8, 0xff, 0x00]): { canvas: { width: number; height: number; context: { drawImage: ReturnType<typeof vi.fn> }; convertToBlob: ReturnType<typeof vi.fn> } } {
  const context = { drawImage: vi.fn() }
  const canvas = {
    width: 0,
    height: 0,
    context,
    getContext: vi.fn(() => context),
    convertToBlob: vi.fn(async () => new Blob([new Uint8Array(blobBytes)], { type: 'image/jpeg' })),
  }
  vi.stubGlobal('OffscreenCanvas', vi.fn(() => canvas))
  return { canvas }
}

describe('platform/image-crop', () => {
  it('encodes the padded crop at exactly the crop dimensions and reports top padding', async () => {
    const { canvas } = installCanvas()
    const bitmap = { width: 100, height: 100 } as unknown as ImageBitmap

    const result = await cropEncode(bitmap, { x0: 20, y0: 30, x1: 39, y1: 49 }, DEFAULT_PAD, 0.8)

    expect(canvas.width).toBe(24)
    expect(canvas.height).toBe(24)
    expect(canvas.context.drawImage).toHaveBeenCalledWith(bitmap, 18, 28, 24, 24, 0, 0, 24, 24)
    expect(result.boxW).toBe(24)
    expect(result.boxH).toBe(24)
    expect(result.inkOffsetY).toBe(2)
    expect([...result.bytes.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  })

  it('clamps a corner crop rather than passing negative source coordinates', async () => {
    const { canvas } = installCanvas()
    const bitmap = { width: 100, height: 80 } as unknown as ImageBitmap

    const result = await cropEncode(bitmap, { x0: 0, y0: 0, x1: 9, y1: 9 }, { xFrac: 0.5, yFrac: 0.5, minPx: 2 }, 0.8)

    expect(canvas.context.drawImage.mock.calls[0]?.slice(1, 5)).toEqual([0, 0, 15, 15])
    expect(result.inkOffsetY).toBe(0)
    expect(result.boxW).toBe(15)
    expect(result.boxH).toBe(15)
  })
})
