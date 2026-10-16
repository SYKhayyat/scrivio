import { describe, expect, it } from 'vitest'
import { exportHtmlToParts } from './html'
import { fixedPageLayout } from '../../../tests/fake-pagination'
import { doc } from '../../../tests/platform-fixtures'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02])
const store = {
  put: () => undefined,
  has: (id: string) => id === 'chunk-1',
  bytesOf: (id: string) => id === 'chunk-1' ? jpeg : undefined,
  exportBytes: () => [{ chunkId: 'chunk-1', bytes: jpeg }],
  urlFor: () => undefined,
  missing: (ids: string[]) => ids.filter(id => id !== 'chunk-1'),
  release: () => undefined,
}

describe('engine/export/html', () => {
  it('emits an offline document in parts with exact positioned placements', async () => {
    const parts = exportHtmlToParts(doc, fixedPageLayout, store)
    const html = parts.map(part => typeof part === 'string' ? part : new TextDecoder().decode(part)).join('')
    expect(html).toContain('<!doctype html>')
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('url(')
    expect(html).toContain('data:image/jpeg;base64,/9j/AQI=')
    expect(html).toContain('left:31.25mm')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('שלום &amp; &lt;world&gt;')
  })

  it('uses identical data URIs for repeated placements of one chunk', () => {
    const repeated = structuredClone(fixedPageLayout)
    repeated.pages[0]!.lines[0]!.items.push({ kind: 'chunk', chunkId: 'chunk-1', xMm: 110, widthMm: 12, heightMm: 4, baselineOffsetMm: 0 })
    const html = exportHtmlToParts(doc, repeated, store).map(part => typeof part === 'string' ? part : new TextDecoder().decode(part)).join('')
    expect((html.match(/data:image\/jpeg;base64,[^"]+/g) ?? []).length).toBe(2)
    expect(new Set(html.match(/data:image\/jpeg;base64,[^"]+/g) ?? []).size).toBe(1)
  })

  it('fails loudly with a missing chunk id', () => {
    const missing = { ...store, bytesOf: () => undefined, has: () => false }
    expect(() => exportHtmlToParts(doc, fixedPageLayout, missing)).toThrow('chunk-1')
  })

  it('keeps Blob size close to the sum of emitted parts', async () => {
    const parts = exportHtmlToParts(doc, fixedPageLayout, store)
    const blob = new Blob(parts)
    expect(blob.size).toBeGreaterThan(0)
    expect(blob.size).toBeGreaterThanOrEqual(parts.reduce((size, part) => size + (typeof part === 'string' ? new Blob([part]).size : part.byteLength), 0) * 0.85)
  })
})
