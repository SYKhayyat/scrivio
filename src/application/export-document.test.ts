import { describe, expect, it, vi } from 'vitest'
import { exportDocument } from './export-document'
import { doc, pageSpec } from '../../../tests/platform-fixtures'
import { fixedPageLayout } from '../../../tests/fake-pagination'

describe('application/export-document', () => {
  it('paginates once and gives the identical layout to the selected exporter', async () => {
    const layout = structuredClone(fixedPageLayout)
    const paginate = vi.fn(() => layout)
    const html = vi.fn(async (_doc, receivedLayout) => { expect(receivedLayout).toBe(layout); return new Blob(['html']) })
    const pdf = vi.fn(async (_doc, receivedLayout) => { expect(receivedLayout).toBe(layout); return new Blob(['pdf']) })
    const save = vi.fn()
    await exportDocument({ paginate, html, pdf, store: {} as any, measurer: {} as any, save, fonts: { hebrew: new Uint8Array() } }, doc, pageSpec, 'html')
    expect(paginate).toHaveBeenCalledTimes(1)
    expect(html).toHaveBeenCalledTimes(1)
    expect(pdf).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/\.html$/))
  })

  it('reports overflow before saving the PDF', async () => {
    const layout = structuredClone(fixedPageLayout)
    layout.pages[0]!.overflow = true
    const report = vi.fn()
    const save = vi.fn()
    await exportDocument({ paginate: vi.fn(() => layout), html: vi.fn(), pdf: vi.fn(async () => new Blob(['pdf'])), store: {} as any, measurer: {} as any, save, fonts: { hebrew: new Uint8Array() }, reportOverflow: report } as any, doc, pageSpec, 'pdf')
    expect(report).toHaveBeenCalledWith([1])
    expect(save).toHaveBeenCalled()
  })
})
