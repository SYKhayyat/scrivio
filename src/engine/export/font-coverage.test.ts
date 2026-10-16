import { describe, expect, it } from 'vitest'
import { open } from 'fontkit'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { FontSet } from './pdf'

describe('FontSet', () => {
  it('ships a static Noto Sans Hebrew TTF larger than 50 KB', () => {
    const path = resolve(process.cwd(), 'assets/fonts/NotoSansHebrew-Regular.ttf')
    expect(statSync(path).size).toBeGreaterThan(50 * 1024)
    const fonts: FontSet = { hebrew: new Uint8Array(readFileSync(path)) }
    const font = open(Buffer.from(fonts.hebrew))
    for (const character of 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ') {
      expect(font.hasGlyphForCodePoint(character.codePointAt(0)!)).toBe(true)
    }
    expect(font.hasGlyphForCodePoint('A'.codePointAt(0)!)).toBe(true)
  })
})
