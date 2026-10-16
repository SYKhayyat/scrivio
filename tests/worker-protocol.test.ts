import { describe, expect, it } from 'vitest'
import type { Box, Direction } from '../src/domain/types'
import type { FromSegWorker, ToSegWorker } from '../src/workers/protocol'

describe('workers/protocol', () => {
  it('keeps every inbound message discriminated by type and job id', () => {
    const bitmap = { width: 20, height: 20 } as unknown as ImageBitmap
    const messages: ToSegWorker[] = [
      { type: 'segment', jobId: 'job-1', bitmap, direction: 'rtl' satisfies Direction, columns: 1, crop: true, jpegQuality: 0.8 },
      { type: 'crop', jobId: 'job-2', bitmap, box: { x0: 1, y0: 2, x1: 3, y1: 4 } satisfies Box, jpegQuality: 0.8 },
      { type: 'cancel', jobId: 'job-3' },
    ]
    expect(messages.map(message => message.type)).toEqual(['segment', 'crop', 'cancel'])
    expect(messages.map(message => message.jobId)).toEqual(['job-1', 'job-2', 'job-3'])
  })

  it('models accepted, progress, terminal success, and terminal failure replies', () => {
    const replies: FromSegWorker[] = [
      { type: 'accepted', jobId: 'job-1' },
      { type: 'progress', jobId: 'job-1', phase: 'components', fraction: 0.5 },
      { type: 'photo-done', jobId: 'job-1', result: { ok: false, reason: 'almost-empty' } },
      { type: 'failed', jobId: 'job-2', message: 'decode failed' },
    ]
    expect(replies.filter(reply => reply.type === 'photo-done' || reply.type === 'failed')).toHaveLength(2)
    expect(replies[1]).toMatchObject({ type: 'progress', fraction: 0.5 })
  })
})
