import { describe, expect, it } from 'vitest'
import { DOMParser, DOMSerializer } from 'prosemirror-model'
import { schema } from './schema'

const chunkAttrs = { chunkId: 'c1', sourcePageId: 'p1', inkW: 10, inkH: 12, inkOffsetY: 2, boxW: 14, boxH: 16, lineIndex: 0, baselineOffset: 1 }

describe('ui/editor/schema', () => {
  it('permits only pageBlocks at document level and keeps page direction/source attrs', () => {
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'photo-1', dir: 'rtl' }, schema.nodes.paragraph.create(null, schema.text('שלום')))
    const doc = schema.topNodeType.create(null, [page])
    expect(doc.childCount).toBe(1)
    expect(doc.firstChild?.attrs).toEqual({ sourcePageId: 'photo-1', dir: 'rtl' })
    expect(() => schema.topNodeType.create(null, [schema.nodes.paragraph.create()])).toThrow()
  })

  it('round-trips every parseDOM/toDOM node type, including lists and atoms', () => {
    const content = schema.nodes.pageBlock.create({ sourcePageId: 'p1', dir: 'ltr' }, [
      schema.nodes.paragraph.create(null, [schema.text('typed'), schema.nodes.chunk.create(chunkAttrs), schema.nodes.footnote_ref.create({ id: 'fn-1' })]),
      schema.nodes.bullet_list.create(null, [schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('bullet')))]),
      schema.nodes.ordered_list.create({ order: 3 }, [schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('numbered')))]),
    ])
    const doc = schema.topNodeType.create(null, content)
    const host = document.createElement('div')
    host.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
    const parsed = DOMParser.fromSchema(schema).parse(host)
    expect(parsed.toJSON()).toEqual(doc.toJSON())
    expect(host.querySelector('img[data-chunk-id]')?.getAttribute('contenteditable')).toBe('false')
    expect(host.querySelector('ol')?.getAttribute('start')).toBe('3')
  })

  it('parses missing numeric chunk attrs as zero and rejects an image without an id', () => {
    const host = document.createElement('div')
    host.innerHTML = '<section data-page-block data-source="p"><p><img data-chunk-id="c" data-box-w=""></p></section>'
    const doc = DOMParser.fromSchema(schema).parse(host)
    let chunks = 0
    doc.descendants((node) => { if (node.type.name === 'chunk') chunks += 1 })
    expect(chunks).toBe(1)
    expect(doc.textContent).toBe('')
  })
})
