import { describe, expect, it } from 'vitest'
import { MM_PER_PT } from '../../domain/units'
import { layoutBlock } from './text-layout'
import { fakeMeasurer } from '../../../tests/fake-measurer'

const style = { fontPt: 72, lineHeight: 1 }

describe('engine/pagination/text-layout', () => {
  it('breaks only at spaces and atom edges in a mixed chunk/text/chunk block', () => {
    const lines = layoutBlock([
      { kind: 'chunk', chunkId: 'a', widthMm: 10, heightMm: 8, baselineOffsetMm: 1 },
      { kind: 'text', text: 'hello world' },
      { kind: 'chunk', chunkId: 'b', widthMm: 10, heightMm: 8, baselineOffsetMm: 1 },
    ], 30, { fontPt: 11, lineHeight: 1.2 }, fakeMeasurer)

    expect(lines.map(line => line.items.map(item => item.input))).toEqual([
      [{ kind: 'chunk', chunkId: 'a', widthMm: 10, heightMm: 8, baselineOffsetMm: 1 }, { kind: 'text', text: 'hello' }],
      [{ kind: 'text', text: 'world' }, { kind: 'chunk', chunkId: 'b', widthMm: 10, heightMm: 8, baselineOffsetMm: 1 }],
    ])
    expect(lines.map(line => line.text)).toEqual(['hello', 'world'])
  })

  it('drops whitespace on both sides of a line break', () => {
    const lines = layoutBlock([{ kind: 'text', text: 'one two' }], 10, { fontPt: 11, lineHeight: 1.2 }, fakeMeasurer)
    expect(lines.every(line => !/^\s|\s$/.test(line.text))).toBe(true)
  })

  it('hard-breaks a long word by codepoint but never between a base and combining mark', () => {
    const lines = layoutBlock([{ kind: 'text', text: 'a\u0301bcdef' }], 15, { fontPt: 11, lineHeight: 1.2 }, fakeMeasurer)
    expect(lines.map(line => line.text).join('')).toBe('a\u0301bcdef')
    expect(lines.every(line => !/^[\u0300-\u036f]/u.test(line.text))).toBe(true)
  })

  it('uses the tallest atom for line height and aligns baseline to the atom', () => {
    const lines = layoutBlock([
      { kind: 'chunk', chunkId: 'tall', widthMm: 8, heightMm: 30, baselineOffsetMm: 5 },
    ], 100, style, fakeMeasurer)
    expect(lines[0]?.heightMm).toBe(30)
    expect(lines[0]?.baselineMm).toBe(25)
  })

  it('keeps the style height in millimetres and returns one line for an empty block', () => {
    const lines = layoutBlock([], 100, style, fakeMeasurer)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ text: '', items: [], heightMm: 72 * MM_PER_PT, baselineMm: 72 * 0.8 * MM_PER_PT })
  })
})
