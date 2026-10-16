import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StressRoute, runStress } from './stress-route'

describe('ui/stress/stress-route', () => {
  it('uses the supplied segmentation client for every generated page and reports all measurements', async () => {
    const submit = vi.fn(async (_file: Blob, _opts: unknown, on: (event: any) => void) => on({ type: 'photo-ready', sourcePage: { id: 'p', widthPx: 800, heightPx: 1100 }, chunkIds: [] }))
    const result = await runStress(3, { submit, cancelAll: vi.fn() } as any)
    expect(submit).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({ totalSegmentationMs: expect.any(Number), firstEditableMs: expect.any(Number), typingMedianMs: expect.any(Number), longTaskCount: expect.any(Number), droppedFrames: expect.any(Number), domNodeCount: expect.any(Number) })
  })

  it('renders a report panel after ?stress=N completes', async () => {
    render(<StressRoute segmentationClient={{ submit: vi.fn(async (_file, _opts, on) => on({ type: 'photo-ready', sourcePage: { id: 'p', widthPx: 800, heightPx: 1100 }, chunkIds: [] })), cancelAll: vi.fn() } as any} count={1} />)
    await waitFor(() => expect(screen.getByRole('region', { name: /stress report/i })).toBeInTheDocument())
    expect(screen.getByText(/segmentation/i)).toBeInTheDocument()
    expect(screen.getByText(/typing/i)).toBeInTheDocument()
  })
})
