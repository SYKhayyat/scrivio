import type { DocumentElement } from '../../core/types';
import type { DocumentSettings } from '../../core/types';
import type { ReflowPort } from '../../core/ports';

export class ReflowEngine implements ReflowPort {
  reflow(elements: DocumentElement[], settings: DocumentSettings): DocumentElement[] {
    return this.layout(elements, settings, 0, null);
  }

  reflowFrom(elements: DocumentElement[], settings: DocumentSettings, fromIndex: number): DocumentElement[] {
    if (fromIndex <= 0) return this.reflow(elements, settings);
    if (fromIndex >= elements.length) return elements.map((e) => ({ ...e }));
    const prefix = elements.slice(0, fromIndex);
    const prefixFlowed = this.layout(prefix, settings, 0, null);
    return this.layout(elements, settings, fromIndex, prefixFlowed);
  }

  private layout(
    elements: DocumentElement[],
    settings: DocumentSettings,
    fromIndex: number,
    prefixFlowed: DocumentElement[] | null,
  ): DocumentElement[] {
    const result = elements.map((e) => ({ ...e }));
    if (prefixFlowed) {
      for (let i = 0; i < prefixFlowed.length; i++) result[i] = { ...prefixFlowed[i] };
    }
    const pageWidth = settings.pageWidthMm;
    const marginLeft = settings.marginLeftMm;
    const marginRight = settings.marginRightMm;
    const paragraphSpacing = settings.paragraphSpacingMm;
    if (result.length === 0) return result;

    let cursorX: number;
    let cursorY: number;
    let lineHeight: number;

    if (fromIndex === 0) {
      cursorX = marginLeft;
      cursorY = 0;
      lineHeight = 0;
    } else {
      const prev = result[fromIndex - 1];
      const prevLineHeight = this.lineHeightFor(result, fromIndex - 1);
      if (prev.kind === 'paragraph-break' || prev.kind === 'line-break') {
        cursorX = marginLeft;
        cursorY = prev.y + (prev.kind === 'paragraph-break' ? paragraphSpacing + prevLineHeight : prevLineHeight || 4);
        if (prev.kind === 'line-break') cursorY = prev.y + (prevLineHeight || 4);
        lineHeight = 0;
      } else {
        cursorX = prev.x + prev.width;
        cursorY = prev.y;
        lineHeight = prevLineHeight;
        const nextW = result[fromIndex]?.width || 5;
        if (cursorX + nextW > pageWidth - marginRight + 0.01 && cursorX > marginLeft) {
          cursorX = marginLeft;
          cursorY += lineHeight;
          lineHeight = 0;
        }
      }
    }

    for (let i = fromIndex; i < result.length; i++) {
      const el = result[i] as DocumentElement & { scratchX?: number; scratchY?: number };
      if (el.kind === 'paragraph-break') {
        el.x = cursorX; el.y = cursorY; el.width = 0; el.height = 0;
        cursorX = marginLeft;
        cursorY += paragraphSpacing + (lineHeight || 4);
        lineHeight = 0;
        continue;
      }
      if (el.kind === 'line-break') {
        el.x = cursorX; el.y = cursorY; el.width = 0; el.height = 0;
        cursorX = marginLeft;
        cursorY += lineHeight || 4;
        lineHeight = 0;
        continue;
      }
      const w = el.width || 5;
      const h = el.height || 4;
      if (cursorX + w > pageWidth - marginRight + 0.01 && cursorX > marginLeft) {
        cursorX = marginLeft;
        cursorY += lineHeight;
        lineHeight = 0;
      }
      el.scratchX = cursorX;
      (el as { scratchY?: number }).scratchY = cursorY;
      el.x = cursorX;
      el.y = cursorY;
      cursorX += w;
      lineHeight = Math.max(lineHeight, h);
    }
    return result;
  }

  private lineHeightFor(elements: DocumentElement[], idx: number): number {
    const y = elements[idx].y;
    let h = elements[idx].height || 4;
    for (let i = idx - 1; i >= 0; i--) {
      if (elements[i].y !== y) break;
      h = Math.max(h, elements[i].height || 4);
    }
    return h;
  }

  computePageBreaks(elements: DocumentElement[], bodyHeightMm: number): number[] {
    const breaks: number[] = [];
    let pageEnd = bodyHeightMm;
    for (const el of elements) {
      if (el.y >= pageEnd) {
        breaks.push(el.y);
        pageEnd += bodyHeightMm;
      }
    }
    return breaks;
  }

  getVisibleIndices(
    elements: DocumentElement[],
    viewport: { y: number; height: number },
    bufferPx: number,
    dpi: number,
    zoom: number,
  ): number[] {
    const pxToMm = 25.4 / dpi / zoom;
    const bufferMm = bufferPx * pxToMm;
    const top = viewport.y - bufferMm;
    const bottom = viewport.y + viewport.height + bufferMm;
    const indices: number[] = [];
    for (let i = 0; i < elements.length; i++) {
      const y = elements[i].y;
      const h = elements[i].height;
      if (y + h >= top && y <= bottom) indices.push(i);
    }
    return indices;
  }
}
