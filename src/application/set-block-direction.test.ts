import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { schema } from '../ui/editor/schema'
import { setBlockDirection } from './set-block-direction'

const chunk = (id: string, sourcePageId = 'photo') => schema.nodes.chunk.create({ chunkId: id, sourcePageId, inkW: 1, inkH: 1, inkOffsetY: 0, boxW: 2, boxH: 2, lineIndex: 0, baselineOffset: 0 })

describe('application/set-block-direction', () => {
  it('reverses chunks within each paragraph, changes dir, and leaves typed text intact', () => {
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'photo', dir: 'ltr' }, [
      schema.nodes.paragraph.create(null, [chunk('a'), schema.text('typed'), chunk('b')]),
      schema.nodes.paragraph.create(null, [chunk('c'), schema.text('second'), chunk('d')]),
    ])
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]) })
    let next: any
    expect(setBlockDirection('rtl')(state, tr => { next = tr })).toBe(true)
    expect(next.doc.firstChild?.attrs.dir).toBe('rtl')
    expect(next.doc.firstChild?.child(0).toJSON().content?.map((node: any) => node.attrs?.chunkId ?? node.text)).toEqual(['b', 'typed', 'a'])
    expect(next.doc.firstChild?.child(1).toJSON().content?.map((node: any) => node.attrs?.chunkId ?? node.text)).toEqual(['d', 'second', 'c'])
  })

  it('is a round trip and does not reorder paragraphs', () => {
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'photo', dir: 'ltr' }, [schema.nodes.paragraph.create(null, [chunk('a')]), schema.nodes.paragraph.create(null, [chunk('b')])])
    let state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]) })
    const original = state.doc.toJSON()
    for (const direction of ['rtl', 'ltr'] as const) {
      let transaction: any
      expect(setBlockDirection(direction)(state, tr => { transaction = tr })).toBe(true)
      state = state.apply(transaction)
    }
    expect(state.doc.toJSON()).toEqual(original)
    expect(state.doc.firstChild?.childCount).toBe(2)
  })
})
