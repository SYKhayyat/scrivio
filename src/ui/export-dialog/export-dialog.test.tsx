import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ExportDialog } from './export-dialog'

describe('ui/export-dialog', () => {
  it('offers standard/custom page settings and sends progress to a visible bar', () => {
    const onExport = vi.fn()
    render(<ExportDialog open onClose={vi.fn()} onExport={onExport} progress={{ fraction: 0.5, note: 'writing' }} />)
    expect(screen.getByRole('combobox', { name: /page size/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /A4/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /custom/i })).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveValue(50)
    fireEvent.click(screen.getByRole('button', { name: /pdf/i }))
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ format: 'pdf' }))
  })

  it('renders export errors in the dialog instead of logging or silently closing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ExportDialog open onClose={vi.fn()} onExport={vi.fn()} error="Font embedding failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Font embedding failed')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
