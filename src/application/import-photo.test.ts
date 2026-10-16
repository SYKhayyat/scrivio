import { describe, expect, it, vi } from 'vitest'
import { importPhotos } from './import-photo'
import type { ChunkImageStore } from '../engine/ports/chunk-store'

describe('application/import-photo', () => {
  it('decodes, submits, inserts, and emits one ready event per photo in completion order', async () => {
    const decode = vi.fn(async () => ({ ok: true as const, bitmap: { width: 100, height: 80 } as unknown as ImageBitmap, widthPx: 100, heightPx: 80 }))
    const submit = vi.fn(async (file: Blob, _opts: unknown, on: (event: any) => void) => {
      on({ type: 'progress', fileName: (file as File).name, fraction: 0.5, phase: 'segment' })
      on({ type: 'photo-ready', sourcePage: { id: `${(file as File).name}-page`, widthPx: 100, heightPx: 80 }, chunkIds: [`${(file as File).name}-chunk`] })
    })
    const store = { has: () => true, bytesOf: () => new Uint8Array([1]), put: () => undefined, exportBytes: () => [], urlFor: () => undefined, missing: () => [], release: () => undefined } satisfies ChunkImageStore
    const insert = vi.fn()
    const events: any[] = []

    await importPhotos({ decode, client: { submit, cancelAll: vi.fn() }, store }, [new File(['a'], 'a.png'), new File(['b'], 'b.png')], { direction: 'rtl', columns: 1 }, insert, event => events.push(event))

    expect(decode).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledTimes(2)
    expect(insert).toHaveBeenNthCalledWith(1, { id: 'a.png-page', widthPx: 100, heightPx: 80 }, ['a.png-chunk'])
    expect(events.filter(event => event.type === 'photo-ready')).toHaveLength(2)
    expect(events.filter(event => event.type === 'progress')).toHaveLength(2)
  })

  it('reports decode-failed and continues to the next file', async () => {
    const decode = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, reason: 'decode-failed' as const })
      .mockResolvedValueOnce({ ok: true as const, bitmap: {} as ImageBitmap, widthPx: 10, heightPx: 10 })
    const submit = vi.fn(async (_file: Blob, _opts: unknown, on: (event: any) => void) => on({ type: 'photo-ready', sourcePage: { id: 'p2', widthPx: 10, heightPx: 10 }, chunkIds: [] }))
    const events: any[] = []
    await importPhotos({ decode, client: { submit, cancelAll: vi.fn() }, store: {} as ChunkImageStore }, [new File(['x'], 'bad.jpg'), new File(['y'], 'good.jpg')], { direction: 'ltr', columns: 1 }, vi.fn(), event => events.push(event))
    expect(events[0]).toMatchObject({ type: 'photo-failed', fileName: 'bad.jpg', reason: 'decode-failed' })
    expect(events.some(event => event.type === 'photo-ready')).toBe(true)
  })
})
