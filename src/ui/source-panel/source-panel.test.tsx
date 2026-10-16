import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SourcePanel } from './source-panel'

describe('ui/source-panel', () => {
  const photo = { id: 'p1', widthPx: 1000, heightPx: 500 }
  it('shows the current page photo, scaled detected boxes, and falls back to the last prior page', () => {
    const { rerender } = render(<SourcePanel pages={[photo]} currentSourcePageId="p1" imageUrls={new Map([['p1', 'blob:photo']])} boxes={[{ id: 'c1', sourcePageId: 'p1', x0: 100, y0: 50, x1: 300, y1: 150 }]} panelWidth={500} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:photo')
    expect(screen.getByTestId('detected-box-c1')).toHaveStyle({ left: '50px', top: '50px', width: '100px', height: '100px' })
    rerender(<SourcePanel pages={[photo]} currentSourcePageId="missing" imageUrls={new Map([['p1', 'blob:photo']])} boxes={[]} panelWidth={500} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:photo')
  })

  it('converts a draw gesture to photo coordinates and requires confirm before insertion', () => {
    const onConfirm = vi.fn()
    render(<SourcePanel pages={[photo]} currentSourcePageId="p1" imageUrls={new Map([['p1', 'blob:photo']])} boxes={[]} panelWidth={500} drawMode onConfirmBox={onConfirm} />)
    const overlay = screen.getByTestId('source-draw-overlay')
    fireEvent.pointerDown(overlay, { clientX: 50, clientY: 25 })
    fireEvent.pointerMove(overlay, { clientX: 150, clientY: 75 })
    fireEvent.pointerUp(overlay, { clientX: 150, clientY: 75 })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith({ x0: 100, y0: 50, x1: 300, y1: 150 })
  })

  it('discards a pending box without inserting it', () => {
    const onConfirm = vi.fn()
    render(<SourcePanel pages={[photo]} currentSourcePageId="p1" imageUrls={new Map([['p1', 'blob:photo']])} boxes={[]} panelWidth={500} drawMode onConfirmBox={onConfirm} />)
    const overlay = screen.getByTestId('source-draw-overlay')
    fireEvent.pointerDown(overlay, { clientX: 10, clientY: 10 })
    fireEvent.pointerUp(overlay, { clientX: 20, clientY: 20 })
    fireEvent.click(screen.getByRole('button', { name: /discard/i }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })
})
