let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (ctx) return ctx;
  canvas = document.createElement('canvas');
  ctx = canvas.getContext('2d')!;
  return ctx;
}

export function measureTypedWord(text: string, fontFamily: string, fontSizeMm: number, bold: boolean, italic: boolean): { width: number; height: number } {
  const dpi = 96;
  const px = fontSizeMm * (dpi / 25.4);
  const c = getCtx();
  const style = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${px}px ${fontFamily}`;
  c.font = style;
  const m = c.measureText(text + ' ');
  const widthMm = (m.width / dpi) * 25.4;
  const heightMm = fontSizeMm * 1.4;
  return { width: widthMm, height: heightMm };
}

export function measureSpace(fontFamily: string, fontSizeMm: number): { width: number; height: number } {
  return measureTypedWord(' ', fontFamily, fontSizeMm, false, false);
}
