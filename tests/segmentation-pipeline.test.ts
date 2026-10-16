import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { segmentSync } from '../src/engine/segmentation/pipeline'
import { THRESH } from '../src/engine/segmentation/thresholds'
import { rgba, darkRect, wordStrokePage } from './helpers'

const options = { direction: 'ltr' as const, columns: 1, crop: false, jpegQuality: 0.82 }

describe('engine/segmentation/pipeline', () => {
  it('turns twelve synthetic word-like strokes into twelve ordered boxes', () => {
    const result = segmentSync(wordStrokePage(), options)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.boxes).toHaveLength(12)
      expect(result.lineIndexOf).toHaveLength(12)
      expect(result.baselineOf).toHaveLength(12)
      expect(result.lineIndexOf).toEqual([...result.lineIndexOf].sort((a, b) => a - b))
      expect(result.boxes.every((box) => box.x0 >= 0 && box.y0 >= 0 && box.x1 < 600 && box.y1 < 400)).toBe(true)
    }
  })

  it('reports too-low-contrast for an all-white buffer', () => {
    expect(segmentSync(rgba(300, 300), options)).toEqual({ ok: false, reason: 'too-low-contrast' })
  })

  it('reports too-dark for a near-black buffer', () => {
    expect(segmentSync(rgba(300, 300, 10), options)).toEqual({ ok: false, reason: 'too-dark' })
  })

  it('reports almost-empty when fewer than three words survive', () => {
    const image = rgba(300, 300)
    darkRect(image, 100, 100, 179, 199)
    expect(segmentSync(image, options)).toEqual({ ok: false, reason: 'almost-empty' })
  })

  it('emits boxes in original coordinates after a known downscale factor', () => {
    const width = 3_000
    const image = rgba(width, 400)
    for (const x of [100, 500, 900]) darkRect(image, x, 160, x + 35, 230)
    const result = segmentSync(image, options)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.boxes).toHaveLength(3)
      for (const [index, expectedX] of [100, 500, 900].entries()) {
        const box = result.boxes[index]
        expect(box).toBeDefined()
        expect(box?.x0).toBeGreaterThanOrEqual(expectedX - 8)
        expect(box?.x0).toBeLessThanOrEqual(expectedX + 8)
      }
    }
  })

  it('runs line clustering before word grouping, keeping wide-gap strokes as separate words', () => {
    const image = rgba(360, 120)
    for (const x of [20, 150, 280]) darkRect(image, x, 40, x + 15, 70)
    const result = segmentSync(image, options)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.boxes).toHaveLength(3)
      expect(new Set(result.lineIndexOf)).toEqual(new Set([0]))
    }
  })

  it('drops a border component in the pipeline even though components returns it', () => {
    const image = rgba(300, 300)
    darkRect(image, 0, 0, 299, 49)
    darkRect(image, 0, 250, 299, 299)
    darkRect(image, 0, 50, 49, 249)
    darkRect(image, 250, 50, 299, 249)
    for (const x of [100, 150, 200]) darkRect(image, x, 120, x + 12, 160)
    const result = segmentSync(image, options)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.boxes.every((box) => box.x0 > 50 && box.y0 > 50 && box.x1 < 250 && box.y1 < 250)).toBe(true)
  })

  it('does not put numeric policy literals in the orchestrator', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/engine/segmentation/pipeline.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '')
    const literals = source.match(/\b(?:\d+(?:\.\d+)?|\.\d+)\b/g) ?? []
    expect(new Set(literals)).toEqual(new Set(['0', '1', '2', '4']))
  })

  it('keeps segmentation geometry-only and free of recognition dependencies', () => {
    const directory = resolve(process.cwd(), 'src/engine/segmentation')
    const files = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => resolve(directory, entry.name))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from\s+['"][^'"]*recognition\//i)
      expect(source, file).not.toMatch(/from\s+['"][^'"]*(?:unicode|character[-_]?class)[^'"]*['"]/i)
      expect(source, file).not.toMatch(/\\[pP]\{/)
      expect(source, file).not.toMatch(/\\u\{?[0-9a-f]{2,}/i)
    }
  })
})
