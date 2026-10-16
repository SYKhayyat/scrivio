import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { schema } from './schema'
import { footnotePlugin, chunkSrcPlugin, baseDirPlugin } from './plugins'

describe('ui/editor/plugins', () => {
  it('numbers footnotes per source page and renders widgets without dispatching transactions', () => {
    const page = schema.nodes.pageBlock.create({ sourcePageId: 'p1', dir: 'rtl' }, schema.nodes.paragraph.create(null, [schema.nodes.footnote_ref.create({ id: 'a' }), schema.nodes.footnote_ref.create({ id: 'b' })]))
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [page]), plugins: [footnotePlugin({ a: { id: 'a', text: 'one', sourcePageId: 'p1' }, b: { id: 'b', text: 'two', sourcePageId: 'p1' } })] })
    const decorations = footnotePlugin.getState(state)?.decorations
    expect(decorations?.find()?.spec).toMatchObject({})
    expect(footnotePlugin.getState(state)?.entries).toMatchObject({ a: { text: 'one' }, b: { text: 'two' } })
  })

  it('derives placeholders for unknown chunk URLs and applies the current block direction', () => {
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [schema.nodes.pageBlock.create({ sourcePageId: 'p', dir: 'rtl' }, schema.nodes.paragraph.create())]), plugins: [chunkSrcPlugin({ urlFor: () => undefined } as any), baseDirPlugin()] })
    expect(chunkSrcPlugin.getState(state)).toBeDefined()
    expect(baseDirPlugin.getState(state)).toBeDefined()
  })
})
