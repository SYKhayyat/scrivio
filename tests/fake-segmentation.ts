import type { RGBA } from '../src/domain/types'
import type {
  SegmentationOptions,
  SegmentationPort,
  SegmentationResult,
} from '../src/engine/ports/segmentation'

export const fixedSegmentationResult: SegmentationResult = {
  ok: true,
  boxes: [{ x0: 10, y0: 20, x1: 29, y1: 39 }],
  lineIndexOf: [0],
  baselineOf: [39],
  chunks: [{ chunkId: 'fixed-chunk', bytes: new Uint8Array([0xff, 0xd8, 0xff]), boxW: 24, boxH: 24, inkOffsetY: 2 }],
}

export const fakeSegmentation: SegmentationPort = {
  async segment(_rgba: RGBA, _opts: SegmentationOptions): Promise<SegmentationResult> {
    return structuredClone(fixedSegmentationResult)
  },
}
