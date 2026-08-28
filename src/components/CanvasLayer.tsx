import { useEffect, useRef } from 'react';
import type { DocumentElement } from '../core/types';
import type { ReflowEngine } from '../engine/reflow/reflow-engine';
import { mmToPx } from '../core/config';

type Props = {
  elements: DocumentElement[];
  zoom: number;
  images: Map<string, HTMLImageElement>;
  selection: [number, number] | null;
  viewportHeight: number;
  scrollY: number;
  reflowEngine: ReflowEngine;
};

export function CanvasLayer({ elements, zoom, images, selection, viewportHeight, scrollY, reflowEngine }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth * dpr;
    const h = canvas.clientHeight * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const dpi = 96;
    ctx.save();
    ctx.translate(0, -scrollY);

    if (selection) {
      const [s, e] = selection;
      ctx.fillStyle = 'rgba(80, 120, 255, 0.25)';
      for (let i = s; i < e && i < elements.length; i++) {
        const el = elements[i];
        const x = mmToPx(el.x, dpi, zoom);
        const y = mmToPx(el.y, dpi, zoom);
        const ww = mmToPx(el.width, dpi, zoom);
        const hh = mmToPx(el.height, dpi, zoom);
        ctx.fillRect(x, y, ww, hh);
      }
    }

    // Cull to the elements inside the visible viewport — this runs through the
    // Rust engine (reflow_visible_indices), not an inline TS loop.
    const bufferPx = 100;
    const visible = reflowEngine.getVisibleIndices(
      elements,
      { y: scrollY, height: viewportHeight },
      bufferPx,
      dpi,
      zoom,
    );
    const visibleSet = new Set(visible);

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (el.kind !== 'chunk') continue;
      if (!visibleSet.has(i)) continue;
      const img = images.get(el.id);
      const x = mmToPx(el.x, dpi, zoom);
      const y = mmToPx(el.y, dpi, zoom);
      const ww = mmToPx(el.width, dpi, zoom);
      const hh = mmToPx(el.height, dpi, zoom);
      if (img && img.complete) {
        ctx.drawImage(img, x, y, ww, hh);
      } else {
        ctx.fillStyle = '#e8e6e1';
        ctx.fillRect(x, y, ww, hh);
        ctx.strokeStyle = '#c2bdb5';
        ctx.strokeRect(x, y, ww, hh);
      }
    }

    ctx.restore();
  }, [elements, zoom, images, selection, viewportHeight, scrollY, reflowEngine]);

  return <canvas ref={ref} className="canvas-layer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}