import { describe, expect, it, vi } from 'vitest'
import { createSegmentationClient } from './segmentation-client'

describe('platform/segmentation-client', () => {
  it('serialises three submitted files and emits photo-ready in file order', async () => {
    const worker = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      terminate: vi.fn(),
    }
    const client = createSegmentationClient(() => worker as unknown as Worker)
    const events: unknown[] = []
    const files = [new File(['a'], 'a.png'), new File(['b'], 'b.png'), new File(['c'], 'c.png')]
    const runs = files.map(file => client.submit(file, { direction: 'ltr', columns: 1 }, event => events.push(event)))

    const listener = worker.addEventListener.mock.calls[0]?.[1] as (event: MessageEvent) => void
    const jobs = worker.postMessage.mock.calls.map(([message]) => message.jobId)
    for (const [index, jobId] of jobs.entries()) {
      listener({ data: { type: 'progress', jobId, phase: 'segment', fraction: 0.5 } } as MessageEvent)
      listener({ data: { type: 'photo-done', jobId, result: { ok: true, boxes: [], lineIndexOf: [], baselineOf: [], chunks: [] } } } as MessageEvent)
      expect(events.at(-1)).toMatchObject({ type: 'photo-ready', fileName: files[index]?.name })
    }
    await Promise.all(runs)
    expect(events.filter((event: any) => event.type === 'photo-ready')).toHaveLength(3)
    expect(events.filter((event: any) => event.type === 'progress')).toHaveLength(3)
  })

  it('emits photo-failed and continues the queue after one worker failure', async () => {
    const worker = { postMessage: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), terminate: vi.fn() }
    const client = createSegmentationClient(() => worker as unknown as Worker)
    const events: any[] = []
    const files = [new File(['bad'], 'bad.png'), new File(['good'], 'good.png')]
    const runs = files.map(file => client.submit(file, { direction: 'rtl', columns: 1 }, event => events.push(event)))
    const listener = worker.addEventListener.mock.calls[0]?.[1] as (event: MessageEvent) => void
    const first = worker.postMessage.mock.calls[0]?.[0]
    listener({ data: { type: 'failed', jobId: first.jobId, message: 'too dark' } } as MessageEvent)
    const second = worker.postMessage.mock.calls[1]?.[0]
    listener({ data: { type: 'photo-done', jobId: second.jobId, result: { ok: true, boxes: [], lineIndexOf: [], baselineOf: [], chunks: [] } } } as MessageEvent)
    await Promise.all(runs)
    expect(events[0]).toMatchObject({ type: 'photo-failed', fileName: 'bad.png', message: 'too dark' })
    expect(events[1]).toMatchObject({ type: 'photo-ready', fileName: 'good.png' })
  })
})
