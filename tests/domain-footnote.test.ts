import { describe, expect, it } from 'vitest'
import type { DocView, Inline } from '../src/domain/types'
import { numberFootnotes } from '../src/domain/footnote'

function doc(blocks: DocView['blocks'], footnotes: DocView['footnotes']): DocView {
  return { sourcePages: [], blocks, footnotes }
}

function ref(id: string): Inline {
  return { kind: 'footnoteRef', id }
}

describe('domain/footnote', () => {
  it('numbers refs per source photo and restarts at one for another photo', () => {
    const result = numberFootnotes(doc([
      { id: 'block-a', kind: 'pageBlock', sourcePageId: 'photo-a', dir: 'ltr', children: [
        { kind: 'paragraph', inlines: [ref('a1'), ref('a2')] },
      ] },
      { id: 'block-b', kind: 'pageBlock', sourcePageId: 'photo-b', dir: 'ltr', children: [
        { kind: 'paragraph', inlines: [ref('b1')] },
      ] },
    ], [
      { id: 'a1', text: 'one', sourcePageId: 'photo-a' },
      { id: 'a2', text: 'two', sourcePageId: 'photo-a' },
      { id: 'b1', text: 'three', sourcePageId: 'photo-b' },
    ]))
    expect([...result]).toEqual([['a1', 1], ['a2', 2], ['b1', 1]])
  })

  it('numbers refs inside flat list items in document order', () => {
    const result = numberFootnotes(doc([{
      id: 'block', kind: 'pageBlock', sourcePageId: 'photo', dir: 'rtl', children: [{
        kind: 'list', ordered: false, items: [[ref('first')], [{ kind: 'text', text: 'typed' }, ref('second')]],
      }],
    }], [
      { id: 'first', text: '', sourcePageId: 'photo' },
      { id: 'second', text: '', sourcePageId: 'photo' },
    ]))
    expect(result.get('first')).toBe(1)
    expect(result.get('second')).toBe(2)
  })

  it('skips an unknown footnote id instead of throwing', () => {
    const result = numberFootnotes(doc([{
      id: 'block', kind: 'pageBlock', sourcePageId: 'photo', dir: 'ltr', children: [
        { kind: 'paragraph', inlines: [ref('missing'), ref('known')] },
      ],
    }], [{ id: 'known', text: '', sourcePageId: 'photo' }]))
    expect(result.has('missing')).toBe(false)
    expect(result.get('known')).toBe(1)
  })

  it('does not inspect a chunk image store while walking the document', () => {
    const value = doc([{
      id: 'block', kind: 'pageBlock', sourcePageId: 'photo', dir: 'ltr', children: [
        { kind: 'paragraph', inlines: [{ kind: 'chunk', chunkId: 'chunk', sourcePageId: 'photo', inkW: 1, inkH: 1, inkOffsetY: 0, boxW: 1, boxH: 1, lineIndex: 0, baselineOffset: 0 }, ref('known')] },
      ],
    }], [{ id: 'known', text: '', sourcePageId: 'photo' }]) as DocView & { bytesOf?: () => never }
    Object.defineProperty(value, 'bytesOf', { get: () => { throw new Error('chunk image store was inspected') } })
    expect(numberFootnotes(value).get('known')).toBe(1)
  })
})
