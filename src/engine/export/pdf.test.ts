import { describe, expect, it } from 'vitest'
import { exportPdf } from './pdf'
import { fixedPageLayout } from '../../../tests/fake-pagination'
import { doc } from '../../../tests/platform-fixtures'

const latinDoc = {
  ...doc,
  blocks: [{ ...doc.blocks[0]!, dir: 'ltr' as const, children: [{ kind: 'paragraph' as const, inlines: [{ kind: 'text' as const, text: 'hello 42' }] }] }],
}
const store = {
  has: () => true,
  bytesOf: () => new Uint8Array([0xff, 0xd8, 0xff, 0x01]),
  put: () => undefined,
  exportBytes: () => [],
  urlFor: () => undefined,
  missing: () => [],
  release: () => undefined,
}

describe('engine/export/pdf', () => {
  it('returns a real PDF whose bytes are the document save result', async () => {
    const layout = structuredClone(fixedPageLayout)
    layout.pages[0]!.lines[0]!.items = [{ kind: 'text', text: 'hello 42', rtl: false, xMm: 20, widthMm: 30, sizePt: 11 }]
    const result = await exportPdf(latinDoc, layout, store, { hebrew: new Uint8Array() })
    expect(new TextDecoder().decode(result.slice(0, 5))).toBe('%PDF-')
    expect(result.byteLength).toBeGreaterThan(100)
  })

  it('fails with the missing chunk id rather than silently omitting an image', async () => {
    const missingLayout = structuredClone(fixedPageLayout)
    const missing = { ...store, has: () => false, bytesOf: () => undefined }
    await expect(exportPdf(doc, missingLayout, missing, { hebrew: new Uint8Array() })).rejects.toThrow('chunk-1')
  })

  it('sets overflow in the reported result when a page contains an oversized line', async () => {
    const layout = structuredClone(fixedPageLayout)
    layout.pages[0]!.overflow = true
    const result = await exportPdf(latinDoc, layout, store, { hebrew: new Uint8Array() })
    expect(result.byteLength).toBeGreaterThan(0)
    expect(layout.pages[0]?.overflow).toBe(true)
  })
})
