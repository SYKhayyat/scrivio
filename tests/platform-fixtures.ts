import type { DocView, PageSpec } from '../src/domain/types'

export const pageSpec: PageSpec = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 20,
  fontPt: 11,
  lineHeight: 1.2,
  footnoteFontPt: 8,
  footnoteGapMm: 3,
}

export const doc: DocView = {
  sourcePages: [{ id: 'photo-1', widthPx: 1000, heightPx: 700 }],
  blocks: [{
    id: 'page-1', kind: 'pageBlock', sourcePageId: 'photo-1', dir: 'rtl',
    children: [{ kind: 'paragraph', inlines: [
      { kind: 'text', text: 'שלום & <world>' },
      { kind: 'chunk', chunkId: 'chunk-1', sourcePageId: 'photo-1', inkW: 20, inkH: 30, inkOffsetY: 2, boxW: 24, boxH: 36, lineIndex: 0, baselineOffset: 4 },
      { kind: 'footnoteRef', id: 'fn-1' },
    ] }],
  }],
  footnotes: [{ id: 'fn-1', text: 'note', sourcePageId: 'photo-1' }],
}
