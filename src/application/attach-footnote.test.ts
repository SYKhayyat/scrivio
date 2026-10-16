import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { schema } from '../ui/editor/schema'
import { attachFootnote } from './attach-footnote'

function stateWithChunk() {
  const page = schema.nodes.pageBlock.create({ sourcePageId: 'photo-1', dir: 'ltr' }, schema.nodes.paragraph.create(null, [
    schema.text('before'),
    schema.nodes.chunk.create({ chunkId: 'c1', sourcePageId: 'photo-1', inkW: 10, inkH: 10, inkOffsetY: 1, boxW: 12, boxH: 12, lineIndex: 0, baselineOffset: 1 }),
  ]))
  return EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]), selection: undefined })
}

describe('application/attach-footnote', () => {
  it('inserts after the nearest chunk and records its source page in transaction meta', () => {
    const state = stateWithChunk()
    const command = attachFootnote('fn-1')
    let transaction: any
    expect(command(state, tr => { transaction = tr })).toBe(true)
    let refs = 0
    transaction.doc.descendants((node: any) => { if (node.type.name === 'footnote_ref') refs += 1 })
    expect(refs).toBe(1)
    expect(transaction.doc.textContent).toContain('before')
    expect(transaction.getMeta('footnotes')).toMatchObject({ setFootnoteText: { id: 'fn-1', text: '', sourcePageId: 'photo-1' } })
  })

  it('returns false and does not dispatch when no chunk precedes the caret', () => {
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'photo-1', dir: 'ltr' }, schema.nodes.paragraph.create(null, schema.text('typed only')))
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]) })
    expect(attachFootnote('fn-1')(state, () => { throw new Error('must not dispatch') })).toBe(false)
  })
})
