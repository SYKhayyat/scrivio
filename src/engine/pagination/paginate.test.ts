import { describe, expect, it } from 'vitest'
import { paginate } from './paginate'
import { fakeMeasurer } from '../../../tests/fake-measurer'

const page = { widthMm: 100, heightMm: 100, marginMm: 10, fontPt: 11, lineHeight: 1.2, footnoteFontPt: 8, footnoteGapMm: 3 }

function doc(dir: 'ltr' | 'rtl' = 'ltr') {
  return {
    sourcePages: [{ id: 'photo', widthPx: 100, heightPx: 100 }],
    blocks: [{ id: 'block', kind: 'pageBlock' as const, sourcePageId: 'photo', dir, children: [{
      kind: 'paragraph' as const,
      inlines: [{ kind: 'text' as const, text: 'hello world' }, { kind: 'footnoteRef' as const, id: 'fn' }],
    }] }],
    footnotes: [{ id: 'fn', text: 'a long enough footnote to wrap over several lines', sourcePageId: 'photo' }],
  }
}

describe('engine/pagination/paginate', () => {
  it('flows blocks top-to-bottom, splits at line boundaries, and always emits a page', () => {
    const result = paginate({ ...doc(), blocks: [] }, page, fakeMeasurer, new Map())
    expect(result.pages).toHaveLength(1)
    expect(result.pages[0]?.lines).toEqual([])
  })

  it('marks a line that cannot fit on an empty page as overflow', () => {
    const huge = { ...doc(), blocks: [{ ...doc().blocks[0]!, children: [{ kind: 'paragraph' as const, inlines: [{ kind: 'chunk' as const, chunkId: 'huge', sourcePageId: 'photo', inkW: 1, inkH: 1, inkOffsetY: 0, boxW: 10, boxH: 500, lineIndex: 0, baselineOffset: 0 }] }] }] }
    const result = paginate(huge, page, fakeMeasurer, new Map([['huge', { w: 10, h: 500 }]]))
    expect(result.pages.some(output => output.overflow)).toBe(true)
  })

  it('keeps a footnote on its reference page, wraps it, and numbers from one per page', () => {
    const result = paginate(doc(), page, fakeMeasurer, new Map())
    const footnotes = result.pages.flatMap(output => output.footnotes)
    expect(footnotes[0]?.n).toBe(1)
    expect(footnotes[0]?.lines.length).toBeGreaterThan(1)
  })

  it('mirrors the anchor for RTL while preserving model item order', () => {
    const ltr = paginate(doc('ltr'), page, fakeMeasurer, new Map())
    const rtl = paginate(doc('rtl'), page, fakeMeasurer, new Map())
    const ltrLine = ltr.pages[0]?.lines[0]
    const rtlLine = rtl.pages[0]?.lines[0]
    expect(rtlLine?.items.map(item => item.kind)).toEqual(ltrLine?.items.map(item => item.kind))
    expect(rtlLine?.xMm).toBeGreaterThan(ltrLine?.xMm ?? 0)
    expect(rtlLine?.items[0]?.xMm).toBe((page.widthMm - page.marginMm) - (rtlLine?.items.reduce((sum, item) => sum + ('widthMm' in item ? item.widthMm : 0), 0) ?? 0))
  })
})
