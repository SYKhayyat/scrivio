import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : []
  })
}

describe('domain import boundary', () => {
  it('keeps every domain module free of imports and platform globals', () => {
    const files = sourceFiles(resolve(process.cwd(), 'src/domain'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/^\s*import\s/m)
      expect(source, file).not.toMatch(/\b(?:window|document|Worker|ImageBitmap|OffscreenCanvas|Blob|URL)\b/)
    }
  })
})
