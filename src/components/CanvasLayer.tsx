import { useEffect, useRef } from 'react';
import type { DocumentElement } from '../core/types';
import { mmToPx } from '../core/config';

type Props = {
  elements: DocumentElement[];
  zoom: number;
  images: Map<string, HTMLImageElement>;
  selection: [number, number] | null;
  viewportHeight: number;
  scrollY: number;
};

export function CanvasLayer({ elements, zoom, images, selection, viewportHeight, scrollY }: Props) {
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

    for (const el of elements) {
      if (el.kind !== 'chunk') continue;
      const img = images.get(el.id);
      const x = mmToPx(el.x, dpi, zoom);
      const y = mmToPx(el.y, dpi, zoom);
      const ww = mmToPx(el.width, dpi, zoom);
      const hh = mmToPx(el.height, dpi, zoom);
      if (y + hh < scrollY - 100 || y > scrollY + viewportHeight + 100) continue;
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
  }, [elements, zoom, images, selection, viewportHeight, scrollY]);

  return <canvas ref={ref} className="canvas-layer" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
