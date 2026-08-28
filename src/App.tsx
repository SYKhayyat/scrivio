import { useCallback, useState, useEffect } from 'react';
import { DocumentModel } from './core/document-model';
import { useDocument } from './hooks/use-document';
import { Toolbar } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { UploadDialog } from './components/UploadDialog';
import { SegmentationEngine } from './engine/segmentation/segmentation-engine';
import { ReflowEngine } from './engine/reflow/reflow-engine';
import { DEFAULT_CONFIG } from './core/config';
import { measureTypedWord } from './utils/measure-text';
import { exportToPdf, exportToJson } from './utils/export';
import type { ScriptDirection, SourceLayout } from './core/types';
import './App.css';

export default function App() {
  const doc = useDocument(new DocumentModel({ name: 'Untitled' }));
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [segmenting, setSegmenting] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setDrawMode((v) => !v); }
      if (e.key === 'Escape') setDrawMode(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const handleUpload = useCallback(async (files: File[], direction: ScriptDirection, layout: SourceLayout, columns?: number) => {
    setSegmenting(true);
    try {
      const engine = new SegmentationEngine(DEFAULT_CONFIG.segmentation);
      for (const file of files) {
        const chunks = await engine.segmentImage(file, { direction, layout: { layout, columns } });
        const reflowEngine = new ReflowEngine();
        const settings = doc.model.getSettings();
        settings.direction = direction;
        doc.model.updateSettings(settings);
        for (const c of chunks) {
          const blob = await engine.cropChunk(file, c.boundingBox);
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.src = url;
          await img.decode().catch(() => {});
          const mmW = (c.boundingBox.w / 300) * 25.4;
          const mmH = (c.boundingBox.h / 300) * 25.4;
          doc.insertElement({
            kind: 'chunk',
            id: c.id,
            sourceImageId: file.name,
            boundingBox: c.boundingBox,
            x: 0, y: 0,
            width: Math.max(4, mmW),
            height: Math.max(4, mmH),
          });
          void reflowEngine;
          void url;
        }
      }
    } finally {
      setSegmenting(false);
    }
  }, [doc]);

  const handleDrawRect = useCallback((rect: { x: number; y: number; w: number; h: number }) => {
    const overlapping = doc.elements.filter((el) => el.kind === 'chunk' && rectsOverlap(rect, el));
    if (overlapping.length === 0) return;
    if (overlapping.length === 1 && rect.w < overlapping[0].width * 0.9) {
      const orig = overlapping[0] as Extract<typeof doc.elements[number], { kind: 'chunk' }>;
      const idx = doc.elements.indexOf(orig);
      const leftW = rect.x - orig.x;
      const rightW = orig.x + orig.width - (rect.x + rect.w);
      if (leftW > 1 && rightW > 1) {
        const next = [...doc.elements];
        next[idx] = { ...orig, width: leftW };
        const newChunk = { ...orig, id: crypto.randomUUID(), x: rect.x + rect.w, width: rightW };
        next.splice(idx + 1, 0, newChunk);
        doc.commit(next, idx);
      }
      return;
    }
    const idxs = overlapping.map((o) => doc.elements.indexOf(o)).sort((a, b) => a - b);
    const first = idxs[0];
    const merged = {
      kind: 'chunk' as const,
      id: crypto.randomUUID(),
      sourceImageId: (overlapping[0] as Extract<typeof overlapping[number], { kind: 'chunk' }>).sourceImageId,
      boundingBox: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
      x: rect.x, y: rect.y, width: rect.w, height: rect.h,
    };
    const next = [...doc.elements];
    for (let i = idxs.length - 1; i >= 0; i--) next.splice(idxs[i], 1);
    next.splice(first, 0, merged);
    doc.commit(next, first);
  }, [doc]);

  const handleExportPdf = useCallback(async () => {
    const bytes = await exportToPdf(doc.model.toSerialized(), new Map());
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${doc.model.name}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  const handleExportJson = useCallback(() => {
    const json = exportToJson(doc.model.toSerialized());
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${doc.model.name}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [doc]);

  return (
    <div className="app">
      <Toolbar
        doc={doc}
        onUpload={() => setUploadOpen(true)}
        onExportPdf={handleExportPdf}
        onExportJson={handleExportJson}
        drawMode={drawMode}
        onToggleDraw={() => setDrawMode((v) => !v)}
        zoom={zoom}
        onZoom={setZoom}
      />
      {segmenting && <div className="segmenting-banner">Segmenting handwriting…</div>}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DocumentView doc={doc} zoom={zoom} drawMode={drawMode} onDrawRect={handleDrawRect} />
        {doc.elements.length === 0 && !segmenting && (
          <div className="empty-state" style={{ position: 'absolute', inset: 0, background: 'rgba(243,241,236,0.92)', zIndex: 1, pointerEvents: 'none' }}>
            <h1>Scrivio</h1>
            <p>A word processor that starts with a photo of handwriting.</p>
            <button className="primary large" style={{ pointerEvents: 'auto' }} onClick={() => setUploadOpen(true)}>Drop a photo of handwriting here, or click Upload</button>
            <p className="muted">No OCR — your handwriting stays as image chunks. Or just start typing.</p>
            <div className="demo-actions" style={{ pointerEvents: 'auto' }}>
              <button onClick={() => insertDemoText(doc)}>Insert demo typed text</button>
              <button onClick={() => insertDemoChunks(doc)}>Insert demo chunks</button>
            </div>
          </div>
        )}
      </div>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUpload={handleUpload} />
    </div>
  );
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.width < a.x || a.y + a.h < b.y || b.y + b.height < a.y);
}

function insertDemoText(doc: ReturnType<typeof useDocument>) {
  const words = 'The quick brown fox jumps over the lazy dog — Scrivio in action.'.split(' ');
  for (const w of words) {
    const m = measureTypedWord(w, 'serif', 4, false, false);
    doc.insertElement({ kind: 'typed-word', id: crypto.randomUUID(), text: w, fontFamily: 'serif', fontSize: 4, bold: false, italic: false, underline: false, x: 0, y: 0, width: m.width, height: m.height });
  }
}

function insertDemoChunks(doc: ReturnType<typeof useDocument>) {
  const placeholders = ['Hello', 'handwritten', 'world', 'from', 'Scrivio'];
  for (const _ of placeholders) {
    doc.insertElement({ kind: 'chunk', id: crypto.randomUUID(), sourceImageId: 'demo', boundingBox: { x: 0, y: 0, w: 100, h: 40 }, x: 0, y: 0, width: 18, height: 7 });
  }
}
