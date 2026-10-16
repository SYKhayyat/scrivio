import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Toolbar } from './toolbar'

describe('ui/toolbar', () => {
  it('exposes import, direction, list, footnote, draw, and export actions', () => {
    const on = vi.fn()
    render(<Toolbar onImport={on} onDirection={on} onBulletList={on} onOrderedList={on} onLiftList={on} onFootnote={on} onDrawBox={on} onExport={on} />)
    for (const name of [/import/i, /direction/i, /bullet/i, /ordered/i, /lift/i, /footnote/i, /draw/i, /export/i]) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /rtl/i }))
    fireEvent.click(screen.getByRole('button', { name: /export/i }))
    expect(on).toHaveBeenCalled()
  })
})
