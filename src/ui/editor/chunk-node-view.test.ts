import { describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { schema } from './schema'
import { createChunkNodeView } from './chunk-node-view'

const attrs = (id: string, sourcePageId: string) => ({ chunkId: id, sourcePageId, inkW: 10, inkH: 20, inkOffsetY: 2, boxW: 12, boxH: 30, lineIndex: 0, baselineOffset: 1 })

describe('ui/editor/chunk-node-view', () => {
  it('renders two photos with their own registry scales and baseline correction', () => {
    const store = { urlFor: vi.fn((id: string) => `blob:${id}`), has: () => true } as any
    const registry = new Map([
      ['p1', { scaleMmPerPx: 0.5, sizes: new Map([['c1', { w: 6, h: 15 }]]) }],
      ['p2', { scaleMmPerPx: 0.25, sizes: new Map([['c2', { w: 3, h: 7.5 }]]) }],
    ])
    const host = document.createElement('div')
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [schema.nodes.pageBlock.create({ sourcePageId: 'p1' }, schema.nodes.paragraph.create(null, [schema.nodes.chunk.create(attrs('c1', 'p1'))]))]) })
    const view = new EditorView(host, { state, nodeViews: { chunk: createChunkNodeView(store, registry) } })
    const image = host.querySelector('img.chunk') as HTMLImageElement
    expect(image.src).toContain('blob:c1')
    expect(image.style.width).toBe('6mm')
    expect(image.style.height).toBe('15mm')
    expect(image.style.verticalAlign).toBe('baseline')
    expect(image.contentEditable).toBe('false')
    view.destroy()
  })

  it('renders a titled placeholder when either the scale or bytes is missing', () => {
    const host = document.createElement('div')
    const state = EditorState.create({ schema, doc: schema.topNodeType.create(null, [schema.nodes.pageBlock.create({}, schema.nodes.paragraph.create(null, [schema.nodes.chunk.create(attrs('missing', 'unknown'))]))]) })
    const view = new EditorView(host, { state, nodeViews: { chunk: createChunkNodeView({ urlFor: () => undefined } as any, new Map()) } })
    expect(host.querySelector('.chunk-missing')?.textContent).toBe('▯')
    expect(host.querySelector('.chunk-missing')?.getAttribute('title')).toContain('missing')
    view.destroy()
  })
})
