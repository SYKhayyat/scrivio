import type { Direction, TextStyle } from '../src/domain/types'
import type { TextMeasurer } from '../src/engine/ports/text-measurer'
import { MM_PER_PT } from '../src/domain/units'

/** Deterministic monospace substitute used by every layout test. */
export const fakeMeasurer: TextMeasurer = {
  widthOf(text: string, style: TextStyle, _dir: Direction): number {
    return text.length * style.fontPt * 0.5 * MM_PER_PT
  },
  ascentOf(style: TextStyle): number {
    return style.fontPt * 0.8 * MM_PER_PT
  },
}
