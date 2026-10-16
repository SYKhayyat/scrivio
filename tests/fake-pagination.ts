import type { DocView, PageLayout, PageSpec, SizeMm } from '../src/domain/types'
import type { PaginationPort } from '../src/engine/ports/pagination'
import type { TextMeasurer } from '../src/engine/ports/text-measurer'

export const fixedPageSpec: PageSpec = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 20,
  fontPt: 11,
  lineHeight: 1.2,
  footnoteFontPt: 8,
  footnoteGapMm: 3,
}

export const fixedPageLayout: PageLayout = {
  pageSpec: fixedPageSpec,
  pages: [{
    index: 0,
    widthMm: 210,
    heightMm: 297,
    overflow: false,
    lines: [{
      blockId: 'page-1', lineIndex: 0, dir: 'rtl', xMm: 31.25, baselineMm: 42.5, heightMm: 6.7,
      items: [
        { kind: 'text', text: 'שלום & <world>', rtl: true, xMm: 31.25, widthMm: 40.5, sizePt: 11 },
        { kind: 'chunk', chunkId: 'chunk-1', xMm: 75.75, widthMm: 12.3, heightMm: 4.1, baselineOffsetMm: 0.2 },
        { kind: 'footnoteRef', n: 1, xMm: 90, widthMm: 2.2 },
      ],
    }],
    footnotes: [{ n: 1, xMm: 20, widthMm: 170, lines: [{ text: 'note', rtl: false, xMm: 20, widthMm: 8 }] }],
  }],
}

export const fakePagination: PaginationPort = {
  paginate(_doc: DocView, _page: PageSpec, _measurer: TextMeasurer, _chunkSizes: Map<string, SizeMm>): PageLayout {
    return structuredClone(fixedPageLayout)
  },
}
