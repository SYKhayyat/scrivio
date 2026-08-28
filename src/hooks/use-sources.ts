import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoundingBox, ImportRegion, ScriptDirection } from '../core/types';
import { SegmentationEngine } from '../engine/segmentation/segmentation-engine';
import { orderChunksByRegions } from '../engine/segmentation/reading-order';
import { DEFAULT_CONFIG } from '../core/config';

export type SourceChunk = { id: string; bbox: BoundingBox; selected: boolean };

export type SourceEntry = {
  file: File;
  direction: ScriptDirection;
  columns: number;
  previewUrl?: string;
  image?: HTMLImageElement;
  chunks: SourceChunk[];
  regions: ImportRegion[];
  error?: string;
  segmenting: boolean;
};

export type ImportEntryChunk = { id: string; bbox: BoundingBox };
export type ImportEntry = {
  file: File;
  direction: ScriptDirection;
  columns: number;
  /** Selected chunks, already in reading order. */
  chunks: ImportEntryChunk[];
};

export function useSources() {
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const tokenRef = useRef(0);
  const segmentedSigRef = useRef<Map<number, string>>(new Map());
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  const patch = useCallback((idx: number, p: Partial<SourceEntry>) => {
    setSources((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...p };
      return copy;
    });
  }, []);

  const segment = useCallback(
    async (idx: number) => {
      const e = sourcesRef.current[idx];
      if (!e) return;
      const signature = `${e.file.name}|${e.file.size}|${e.file.type}`;
      if (segmentedSigRef.current.get(idx) === signature) return;
      const token = ++tokenRef.current;
      segmentedSigRef.current.set(idx, signature);
      patch(idx, { segmenting: true, error: undefined });
      try {
        const engine = new SegmentationEngine(DEFAULT_CONFIG.segmentation);
        let blob: Blob = e.file;
        if (e.file.type === 'application/pdf') {
          const pdfjs = await import('pdfjs-dist');
          const data = await e.file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise;
          blob = await new Promise<Blob>((res, rej) =>
            canvas.toBlob((b) => (b ? res(b) : rej(new Error('Failed to render PDF page'))), 'image/jpeg', 0.92),
          );
        }
        const chunks = await engine.segmentImage(blob, { direction: e.direction, layout: { layout: 'single-column' } });
        if (token !== tokenRef.current) return; // stale result — a newer run owns the entry
        patch(idx, {
          chunks: chunks.map((c) => ({ id: c.id, bbox: c.boundingBox, selected: true })),
          segmenting: false,
        });
      } catch (err) {
        if (token !== tokenRef.current) return;
        segmentedSigRef.current.delete(idx);
        patch(idx, { error: String(err), segmenting: false });
      }
    },
    [patch],
  );

  // Segment a source once, when it becomes active.
  useEffect(() => {
    const e = sources[activeIdx];
    if (!e) return;
    void segment(activeIdx);
  }, [activeIdx, sources, segment]);

  const addFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    const firstNewIdx = sourcesRef.current.length;
    const fresh: SourceEntry[] = [];
    for (const f of files) {
      const entry: SourceEntry = {
        file: f,
        direction: 'rtl' as ScriptDirection,
        columns: 2,
        chunks: [],
        regions: [],
        segmenting: false,
      };
      if (f.type.startsWith('image/')) {
        entry.previewUrl = URL.createObjectURL(f);
        try {
          entry.image = await loadImage(entry.previewUrl);
        } catch {
          entry.error = 'Could not load image preview.';
        }
      }
      fresh.push(entry);
    }
    setSources((prev) => [...prev, ...fresh]);
    setActiveIdx(firstNewIdx);
  }, []);

  const removeSource = useCallback((idx: number) => {
    setSources((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
    setActiveIdx((cur) => {
      if (cur === idx) return Math.max(0, idx - 1);
      if (cur > idx) return cur - 1;
      return cur;
    });
  }, []);

  const totalSelected = sources.reduce((s, e) => s + e.chunks.filter((c) => c.selected).length, 0);

  /** All sources' selected chunks in reading order, ready for insertion. */
  const buildImportEntries = useCallback((): ImportEntry[] => {
    return sources
      .filter((e) => !e.error && !e.segmenting)
      .map((e) => {
        const regions = e.regions.length > 0 ? e.regions : undefined;
        const ordered = orderChunksByRegions(
          e.chunks.map((c) => ({ ...c, x: c.bbox.x, y: c.bbox.y, w: c.bbox.w, h: c.bbox.h })),
          e.direction,
          regions,
          e.columns,
        );
        return {
          file: e.file,
          direction: e.direction,
          columns: e.columns,
          chunks: ordered.filter((c) => c.selected).map((c) => ({ id: c.id, bbox: c.bbox })),
        };
      })
      .filter((e) => e.chunks.length > 0);
  }, [sources]);

  return {
    sources,
    activeIdx,
    setActiveIdx,
    addFiles,
    removeSource,
    patch,
    buildImportEntries,
    totalSelected,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}
