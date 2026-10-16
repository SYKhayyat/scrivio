import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema'
import { toDocView } from './to-docview'

describe('ui/editor/to-docview', () => {
  it('projects geometry and footnote state into plain structured-cloneable data', () => {
    const chunk = schema.nodes.chunk.create({ chunkId: 'c1', sourcePageId: 'p1', inkW: 10, inkH: 20, inkOffsetY: 2, boxW: 12, boxH: 30, lineIndex: 3, baselineOffset: 4 })
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'p1', dir: 'rtl' }, schema.nodes.paragraph.create(null, [schema.text('שלום'), chunk]))
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]) })
    const view = toDocView(state)
    expect(view.blocks[0]?.dir).toBe('rtl')
    expect(view.blocks[0]?.children[0]).toMatchObject({ kind: 'paragraph' })
    expect(view.blocks[0]?.children[0]).toMatchObject({ inlines: expect.arrayContaining([expect.objectContaining({ chunkId: 'c1', baselineOffset: 4 })]) })
    expect(structuredClone(view)).toEqual(view)
  })
})
