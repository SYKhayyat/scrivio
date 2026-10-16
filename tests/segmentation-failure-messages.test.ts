import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const messages = {
  'too-dark': 'Nothing usable on this photo — it is too dark to read the ink. Try again with more light.',
  'too-low-contrast': 'Nothing usable on this photo — the writing is too faint or the page too flat. Try again with more contrast.',
  'almost-empty': 'Nothing usable on this photo — no words were found. Try again with more light, or draw boxes on it manually.',
  'decode-failed': 'This file could not be read as an image. JPG and PNG are supported.',
} as const

describe('segmentation failure messages', () => {
  it('keeps every load-bearing message exact in the import failure boundary', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/application/import-photo.ts'), 'utf8')
    for (const message of Object.values(messages)) expect(source).toContain(message)
  })
})
