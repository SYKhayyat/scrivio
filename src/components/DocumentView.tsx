import { useEffect, useRef, useState, useCallback } from 'react';
import type { DocumentHandle } from '../hooks/use-document';
import { CanvasLayer } from './CanvasLayer';
import { DomLayer } from './DomLayer';
import { mmToPx } from '../core/config';
import type { DocumentElement } from '../core/types';

type Props = {
  doc: DocumentHandle;
  zoom: number;
  drawMode: boolean;
  onDrawRect: (rect: { x: number; y: number; w: number; h: number }) => void;
  images: Map<string, HTMLImageElement>;
};

export function DocumentView({ doc, zoom, drawMode, onDrawRect, images }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const [drag, setDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => setScrollY(el.scrollTop);
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
    ro.observe(el);
    el.addEventListener('scroll', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const focusInput = useCallback(() => hiddenInputRef.current?.focus(), []);
  const docRef = useRef(doc);
  docRef.current = doc;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const doc = docRef.current;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); doc.undo(); }
        if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); doc.redo(); }
        if (e.key.toLowerCase() === 'a') { e.preventDefault(); doc.setSelection(0, doc.elements.length); }
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        const sel = doc.model.getSelection();
        if (sel) {
          const [s, e2] = [Math.min(sel.anchor, sel.focus), Math.max(sel.anchor, sel.focus)];
          const next = [...doc.model.getElements() as DocumentElement[]]; next.splice(s, e2 - s); doc.commit(next, s); doc.model.clearSelection(); doc.setCursor(s);
        } else {
          const cur = doc.model.getCursor().index;
          if (cur > 0) doc.deleteAt(cur - 1);
        }
      } else if (e.key === 'Delete') {
        e.preventDefault();
        doc.deleteAt(doc.model.getCursor().index);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); doc.setCursor(Math.max(0, doc.model.getCursor().index - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); doc.setCursor(Math.min(doc.model.getElements().length, doc.model.getCursor().index + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); moveVertical(doc, -1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); moveVertical(doc, 1);
      } else if (e.key === 'Home') {
        e.preventDefault(); doc.setCursor(lineStart(doc.model.getElements() as DocumentElement[], doc.model.getCursor().index));
      } else if (e.key === 'End') {
        e.preventDefault(); doc.setCursor(lineEnd(doc.model.getElements() as DocumentElement[], doc.model.getCursor().index));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const kind = e.shiftKey ? 'paragraph-break' : 'line-break';
        doc.insertElement({ kind, id: crypto.randomUUID(), x: 0, y: 0, width: 0, height: 0 } as never);
      } else if (e.key === ' ') {
        e.preventDefault();
        const settings = doc.model.getSettings();
        const cur = doc.model.getCursor().index;
        const els = doc.model.getElements() as DocumentElement[];
        const prev = els[cur - 1];
        if (prev?.kind === 'typed-word' && prev.text !== ' ' && !prev.bold && !prev.italic && !prev.underline) {
          const next = { ...prev, text: prev.text + ' ' } as typeof prev;
          const arr = [...els];
          arr[cur - 1] = next;
          doc.commit(arr, cur - 1);
          doc.setCursor(cur);
        } else {
          doc.insertElement({
            kind: 'typed-word', id: crypto.randomUUID(), text: ' ',
            fontFamily: settings.defaultFontFamily, fontSize: settings.defaultFontSize,
            bold: false, italic: false, underline: false, x: 0, y: 0, width: 2, height: 4,
          });
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const cur = doc.model.getCursor().index;
        const els = doc.model.getElements() as DocumentElement[];
        const settings = doc.model.getSettings();
        const prev = els[cur - 1];
        const canCoalesce = prev?.kind === 'typed-word' && prev.fontFamily === settings.defaultFontFamily && prev.fontSize === settings.defaultFontSize && !prev.bold && !prev.italic && !prev.underline && e.key !== ' ';
        if (canCoalesce) {
          const next = { ...prev, text: (prev as Extract<DocumentElement, { kind: 'typed-word' }>).text + e.key } as DocumentElement;
          const arr = [...els];
          arr[cur - 1] = next;
          doc.commit(arr, cur - 1);
          doc.setCursor(cur);
        } else {
          const typed: DocumentElement = {
            kind: 'typed-word', id: crypto.randomUUID(), text: e.key,
            fontFamily: settings.defaultFontFamily, fontSize: settings.defaultFontSize,
            bold: false, italic: false, underline: false, x: 0, y: 0, width: 4, height: 4,
          };
          doc.insertElement(typed);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doc]);

  const dpi = 96;
  const settings = doc.model.getSettings();
  const docHeightPx = (() => {
    if (doc.elements.length === 0) return 400;
    const last = doc.elements[doc.elements.length - 1];
    return mmToPx(last.y + last.height + 40, dpi, zoom);
  })();
  const docWidthPx = mmToPx(settings.pageWidthMm, dpi, zoom);
  const selection = doc.selection ? [Math.min(doc.selection.anchor, doc.selection.focus), Math.max(doc.selection.anchor, doc.selection.focus)] as [number, number] : null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!drawMode) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top + scrollY };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!drawMode || !dragStart.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top + scrollY };
    setDrag({ x: Math.min(dragStart.current.x, cur.x), y: Math.min(dragStart.current.y, cur.y), w: Math.abs(cur.x - dragStart.current.x), h: Math.abs(cur.y - dragStart.current.y) });
  };
  const handlePointerUp = () => {
    if (drag && drag.w > 5 && drag.h > 5) {
      const pxToMm = 25.4 / dpi / zoom;
      onDrawRect({ x: drag.x * pxToMm, y: drag.y * pxToMm, w: drag.w * pxToMm, h: drag.h * pxToMm });
    }
    dragStart.current = null;
    setDrag(null);
  };

  return (
    <div
      ref={containerRef}
      className="document-view"
      tabIndex={0}
      onClick={focusInput}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: drawMode ? 'crosshair' : 'text' }}
    >
      <div className="ruler-h" style={{ width: docWidthPx }} />
      <div className="page" style={{ width: docWidthPx, height: docHeightPx, position: 'relative', background: 'white', boxShadow: '0 1px 8px rgba(0,0,0,0.15)' }}>
        <CanvasLayer elements={doc.elements} zoom={zoom} images={images} selection={selection} viewportHeight={viewportH} scrollY={scrollY} reflowEngine={doc.reflowEngine} />
        <DomLayer elements={doc.elements} zoom={zoom} cursorIndex={doc.cursor.index} onCursorMove={(i) => doc.setCursor(i)} onSelect={(a, f) => doc.setSelection(a, f)} />
        {drag && <div className="draw-rect" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }} />}
        {renderPageBreaks(doc.elements, settings.bodyHeightMm, zoom, dpi)}
      </div>
      <input ref={hiddenInputRef} className="hidden-input" aria-hidden />
    </div>
  );
}

function renderPageBreaks(elements: DocumentElement[], bodyHeightMm: number, zoom: number, dpi: number) {
  if (elements.length === 0) return null;
  const maxY = elements[elements.length - 1].y + elements[elements.length - 1].height;
  const breaks: number[] = [];
  for (let y = bodyHeightMm; y < maxY; y += bodyHeightMm) breaks.push(y);
  return breaks.map((y) => (
    <div key={y} className="page-break" style={{ top: mmToPx(y, dpi, zoom) }} />
  ));
}

function lineStart(elements: DocumentElement[], cursor: number): number {
  for (let i = cursor - 1; i >= 0; i--) if (elements[i].kind === 'line-break' || elements[i].kind === 'paragraph-break') return i + 1;
  return 0;
}
function lineEnd(elements: DocumentElement[], cursor: number): number {
  for (let i = cursor; i < elements.length; i++) if (elements[i].kind === 'line-break' || elements[i].kind === 'paragraph-break') return i;
  return elements.length;
}
function moveVertical(doc: DocumentHandle, dir: number): void {
  const { elements, cursor } = doc;
  if (elements.length === 0) return;
  const curEl = elements[Math.min(cursor.index, elements.length - 1)];
  const curX = curEl ? curEl.x : 0;
  const curY = curEl ? curEl.y : 0;
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const dy = el.y - curY;
    if ((dir < 0 && dy >= -0.5) || (dir > 0 && dy <= 0.5)) continue;
    const dist = Math.abs(el.x - curX) + Math.abs(dy) * 0.1;
    if (dist < bestDist) { bestDist = dist; best = i; }
  }
  if (best !== -1) doc.setCursor(best);
}
