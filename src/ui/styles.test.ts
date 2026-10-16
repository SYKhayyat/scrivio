import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('critical editor styles', () => {
  it('keeps page containment, intrinsic estimate, lazy chunk rules, and system font variables', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/ui/styles.css'), 'utf8')
    expect(css).toContain('content-visibility: auto')
    expect(css).toContain('contain-intrinsic-size: auto 297mm')
    expect(css).toContain('max-width: var(--doc-width)')
    expect(css).toContain('vertical-align: baseline')
    expect(css).toContain('--font-ui')
  })
})
