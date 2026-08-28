import { useCallback, useState, useEffect } from 'react';
import { DocumentModel } from './core/document-model';
import { useDocument } from './hooks/use-document';
import { Toolbar } from './components/Toolbar';
import { DocumentView } from './components/DocumentView';
import { UploadDialog } from './components/UploadDialog';
import { SegmentationEngine } from './engine/segmentation/segmentation-engine';
import { DEFAULT_CONFIG } from './core/config';
import { exportToPdf, exportToJson } from './utils/export';
import './App.css';

export default function App() {
  const doc = useDocument(new DocumentModel({ name: 'Untitled' }));
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); setDrawMode((v) => !v); }
      if (e.key === 'Escape') setDrawMode(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleInsert = useCallback(async (entries: Array<{ file: File; direction: string; layout: string; columns: number; chunks?: Array<{ id: string; bbox: { x: number; y: number; w: number; h: number }; selected: boolean }> }>) => {
    setSegmenting(true);
    try {
      const engine = new SegmentationEngine(DEFAULT_CONFIG.segmentation);
      for (const ent of entries) {
        const selected = ent.chunks?.filter((c) => c.selected) ?? [];
        if (selected.length === 0) continue;
        let blob: Blob = ent.file;
        if (ent.file.type === 'application/pdf') {
          const pdfjs = await import('pdfjs-dist');
          const data = await ent.file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          // @ts-ignore
          await page.render({ canvasContext: ctx, viewport }).promise;
          blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('pdf render failed')), 'image/jpeg', 0.92));
        }
        const dir = ent.direction as 'ltr' | 'rtl';
        doc.model.updateSettings({ ...doc.model.getSettings(), direction: dir });
        for (const ch of selected) {
          const crop = await engine.cropChunk(blob, ch.bbox, 85).catch(() => blob.slice(0, 0));
          void crop;
          const mmW = (ch.bbox.w / 300) * 25.4;
          const mmH = (ch.bbox.h / 300) * 25.4;
          doc.insertElement({
            kind: 'chunk',
            id: ch.id,
            sourceImageId: ent.file.name,
            boundingBox: ch.bbox,
            x: 0, y: 0,
            width: Math.max(4, mmW),
            height: Math.max(4, mmH),
          });
        }
      }
      setToast(`Inserted ${entries.reduce((s, e) => s + (e.chunks?.filter((c) => c.selected).length ?? 0), 0)} chunks at cursor`);
    } catch (e) {
      setToast(String(e));
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
      {toast && <div className="segmenting-banner" style={{ background: '#d1ecf1', borderColor: '#bee5eb' }}>{toast}</div>}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DocumentView doc={doc} zoom={zoom} drawMode={drawMode} onDrawRect={handleDrawRect} />
        {doc.elements.length === 0 && !segmenting && (
          <div className="empty-state" style={{ position: 'absolute', inset: 0, background: 'rgba(243,241,236,0.92)', zIndex: 1, pointerEvents: 'none' }}>
            <h1>Scrivio</h1>
            <p>A word processor that starts with a photo of handwriting.</p>
            <button className="primary large" style={{ pointerEvents: 'auto' }} onClick={() => setUploadOpen(true)}>Import handwriting</button>
            <p className="muted">Place the cursor first, then import — chunks appear at the cursor, even mid-page. Choose RTL/LTR and columns per file, and keep only the chunks you want.</p>
          </div>
        )}
      </div>
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onInsert={handleInsert} />
    </div>
  );
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.width < a.x || a.y + a.h < b.y || b.y + b.height < a.y);
}
