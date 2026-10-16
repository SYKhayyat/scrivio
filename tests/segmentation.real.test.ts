import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import manifest from './fixtures/manifest.json'
import { segmentSync } from '../src/engine/segmentation/pipeline'
import { THRESH } from '../src/engine/segmentation/thresholds'
import { toLuma } from '../src/engine/segmentation/luma'
import { binarize } from '../src/engine/segmentation/binarize'
import { connectedComponents } from '../src/engine/segmentation/components'
import { clusterLines } from '../src/engine/segmentation/lines'
import { groupWords } from '../src/engine/segmentation/words'
import { mergePunctuation } from '../src/engine/segmentation/punctuation'
import { grayRgba } from './helpers'

type Fixture = (typeof manifest.fixtures)[number]

function fixtureRgba(fixture: Fixture) {
  const bytes = new Uint8Array(readFileSync(resolve(process.cwd(), 'tests/fixtures', fixture.file)))
  expect(bytes).toHaveLength(fixture.width * fixture.height)
  return grayRgba(bytes, fixture.width, fixture.height)
}

function linesAndWords(fixture: Fixture, threshold: typeof THRESH): { lines: number; words: number } {
  const rgba = fixtureRgba(fixture)
  const luma = toLuma(rgba)
  const ink = new Uint8Array(fixture.width * fixture.height)
  binarize(luma, fixture.width, fixture.height, ink, threshold)
  const minArea = Math.max(threshold.minBlobArea, threshold.minBlobAreaFrac * fixture.width * fixture.height)
  const blobs = connectedComponents(ink, fixture.width, fixture.height, minArea)
    .filter((blob) => blob.area <= threshold.maxBlobAreaFrac * fixture.width * fixture.height)
  const lines = clusterLines(blobs, threshold)
  const widths = blobs.map((blob) => blob.x1 - blob.x0 + 1).sort((a, b) => a - b)
  const medianBlobWidth = widths[Math.floor(widths.length / 2)] ?? 0
  const words = lines.flatMap((line) => groupWords(line, medianBlobWidth, threshold))
  const lineOf: number[] = []
  for (const [lineIndex, line] of lines.entries()) {
    for (const blob of line.blobs) lineOf[blob.id] = lineIndex
  }
  const merged = mergePunctuation(words, blobs, lineOf, threshold)
  return { lines: lines.length, words: merged.words.length }
}

describe('segmentation real fixture regression', () => {
  for (const fixture of manifest.fixtures) {
    it(`keeps ${fixture.file} within its hand-counted ground truth`, () => {
      const result = segmentSync(fixtureRgba(fixture), {
        direction: 'rtl',
        columns: 1,
        crop: false,
        jpegQuality: 0.82,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const lineCount = new Set(result.lineIndexOf).size
      expect(lineCount).toBeGreaterThanOrEqual(fixture.expectedLines - fixture.linesTolerance)
      expect(lineCount).toBeLessThanOrEqual(fixture.expectedLines + fixture.linesTolerance)
      if (fixture.expectedWords !== null) expect(result.boxes).toHaveLength(fixture.expectedWords)
      for (const box of result.boxes) {
        expect(box.x0).toBeGreaterThanOrEqual(0)
        expect(box.y0).toBeGreaterThanOrEqual(0)
        expect(box.x1).toBeLessThan(fixture.width)
        expect(box.y1).toBeLessThan(fixture.height)
        expect(box.x1).toBeGreaterThan(box.x0)
        expect(box.y1).toBeGreaterThan(box.y0)
        for (const forbidden of fixture.mustNotDetect) {
          const overlaps = box.x0 <= forbidden.x1 && box.x1 >= forbidden.x0 && box.y0 <= forbidden.y1 && box.y1 >= forbidden.y0
          expect(overlaps, `${fixture.file} detected ${forbidden.what}`).toBe(false)
        }
      }
      for (let i = 1; i < result.boxes.length; i += 1) {
        expect(result.boxes[i]?.y0 ?? 0).toBeGreaterThanOrEqual(result.boxes[i - 1]?.y0 ?? 0)
      }
    }, 3_000)
  }

  it('makes the recorded regression fail when adaptive contrast is raised by thirty percent', () => {
    const changed = { ...THRESH, binarizeCFrac: THRESH.binarizeCFrac * 1.3 } as typeof THRESH
    const counts = manifest.fixtures.map((fixture) => linesAndWords(fixture, changed))
    expect(counts.some((count, index) => {
      const fixture = manifest.fixtures[index]
      const lineOutside = count.lines < fixture.expectedLines - fixture.linesTolerance || count.lines > fixture.expectedLines + fixture.linesTolerance
      const wordsOutside = fixture.expectedWords !== null && count.words !== fixture.expectedWords
      return lineOutside || wordsOutside
    })).toBe(true)
  }, 3_000)
})
