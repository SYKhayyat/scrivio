import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlobStore } from './blob-store'

describe('platform/blob-store', () => {
  afterEach(() => vi.restoreAllMocks())

  it('round-trips bytes and geometry without exposing a mutable store array', () => {
    const store = new BlobStore()
    const input = new Uint8Array([1, 2, 3])
    store.put('a', input, 12, 14)
    input[0] = 99

    expect(store.has('a')).toBe(true)
    expect(store.bytesOf('a')).toEqual(new Uint8Array([1, 2, 3]))
    expect(store.bytesOf('missing')).toBeUndefined()
  })

  it('memoises object URLs, returns only unknown ids from missing, and revokes all URLs', () => {
    const store = new BlobStore()
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:a').mockReturnValueOnce('blob:b')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    store.put('a', new Uint8Array([1]), 1, 1)
    store.put('b', new Uint8Array([2]), 1, 1)

    expect(store.urlFor('a')).toBe('blob:a')
    expect(store.urlFor('a')).toBe('blob:a')
    expect(store.urlFor('unknown')).toBeUndefined()
    expect(store.urlFor('b')).toBe('blob:b')
    expect(store.missing(['a', 'unknown', 'b', 'other'])).toEqual(['unknown', 'other'])

    store.release()
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke.mock.calls.map(([url]) => url)).toEqual(['blob:a', 'blob:b'])
    expect(store.has('a')).toBe(false)
  })

  it('returns fresh transferable copies from exportBytes', () => {
    const store = new BlobStore()
    store.put('a', new Uint8Array([7, 8]), 3, 4)

    const exported = store.exportBytes(['a', 'missing'])
    expect(exported).toEqual([{ chunkId: 'a', bytes: new Uint8Array([7, 8]) }])
    exported[0]!.bytes[0] = 0
    expect(store.bytesOf('a')).toEqual(new Uint8Array([7, 8]))
  })
})
