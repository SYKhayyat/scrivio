import { describe, expect, it } from 'vitest'
import { visualRuns } from './bidi'

describe('engine/export/bidi', () => {
  it('returns one unchanged RTL run for pure Hebrew', () => {
    expect(visualRuns('שלום', 'rtl')).toEqual([{ text: 'שלום', rtl: true }])
  })

  it('returns hand-written visual runs for Hebrew, Latin, and digits', () => {
    expect(visualRuns('שלום world 42', 'rtl')).toEqual([
      { text: '42', rtl: false },
      { text: ' world ', rtl: false },
      { text: 'שלום', rtl: true },
    ])
  })

  it('mirrors paired punctuation in an RTL line and changes order with an LTR base', () => {
    const rtl = visualRuns('(שלום)', 'rtl')
    expect(rtl.map(run => run.text).join('')).toContain('(')
    expect(rtl.map(run => run.text).join('')).toContain(')')
    expect(visualRuns('שלום world 42', 'ltr')).not.toEqual(visualRuns('שלום world 42', 'rtl'))
  })

  it('handles empty and plain-Latin lines without synthetic runs', () => {
    expect(visualRuns('', 'ltr')).toEqual([])
    expect(visualRuns('plain text', 'ltr')).toEqual([{ text: 'plain text', rtl: false }])
  })
})
