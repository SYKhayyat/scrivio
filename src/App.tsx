import { useCallback, useRef, useState, useEffect } from 'react';
import { DocumentModel } from './core/document-model';
import { useDocument } from './hooks/use-document';
import { useSources, type ImportEntry } from './hooks/use-sources';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { StatusBar } from './components/StatusBar';
import { DocumentView } from './components/DocumentView';
import { SourcePane } from './components/SourcePane';
import { SegmentationEngine } from './engine/segmentation/segmentation-engine';
import { DEFAULT_CONFIG } from './core/config';
import { exportToPdf, exportToJson } from './utils/export';
import { exportToKsavTypst } from './utils/export-ksav';
import './App.css';

export type ViewMode = 'split' | 'source' | 'doc';

export default function App() {
  const doc = useDocument(new DocumentModel({ name: 'Untitled' }));
  const src = useSources();
  const [zoom, setZoom] = useState(1);
  const [drawMode, setDrawMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [sourceWidth, setSourceWidth] = useState(0.45);
  const [inserting, setInserting] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chunkImages, setChunkImages] = useState<Map<string, HTMLImageElement>>(new Map());
  const chunkBytesRef = useRef<Map<string, Uint8Array>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'd') { e.preventDefault(); setDrawMode((v) => !v); }
      if (mod && k === 'o') { e.preventDefault(); fileInputRef.current?.click(); }
      if (mod && k === '=') { e.preventDefault(); setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2))); }
      if (mod && k === '-') { e.preventDefault(); setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2))); }
      if (mod && k === '0') { e.preventDefault(); setZoom(1); }
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

  const openFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      void src.addFiles(files);
      setViewMode((m) => (m === 'doc' ? 'split' : m));
    },
    [src],
  );

  const handleInsert = useCallback(async () => {
    const entries = src.buildImportEntries();
    if (entries.length === 0) return;
    setInserting(true);
    try {
      const engine = new SegmentationEngine(DEFAULT_CONFIG.segmentation);
      let inserted = 0;
      const cropJobs: Promise<void>[] = [];
      for (const ent of entries) {
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
        doc.model.updateSettings({ ...doc.model.getSettings(), direction: ent.direction });
        // Insert every element synchronously so the document updates as one
        // unit; crops/images are computed in the background afterwards.
        for (const ch of ent.chunks) {
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
          inserted++;
          cropJobs.push(
            (async () => {
              try {
                const crop = await engine.cropChunk(blob, ch.bbox, 92);
                const bytes = new Uint8Array(await crop.arrayBuffer());
                chunkBytesRef.current.set(ch.id, bytes);
                const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
                const img = new Image();
                img.onload = () => {
                  setChunkImages((prev) => {
                    if (prev.get(ch.id) === img) return prev;
                    const m = new Map(prev);
                    m.set(ch.id, img);
                    return m;
                  });
                };
                img.src = url;
              } catch {
                // Leave the placeholder box; the chunk itself is already in the doc.
              }
            })(),
          );
        }
      }
      await Promise.all(cropJobs);
      if (inserted > 0) setToast(`${inserted} chunk${inserted === 1 ? '' : 's'} inserted at the cursor.`);
    } catch (e) {
      setToast(String(e));
    } finally {
      setInserting(false);
    }
  }, [doc, src]);

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

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = useCallback(async () => {
    const bytes = await exportToPdf(doc.model.toSerialized(), chunkBytesRef.current);
    download(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${doc.model.name}.pdf`);
  }, [doc]);

  const handleExportJson = useCallback(() => {
    download(new Blob([exportToJson(doc.model.toSerialized())], { type: 'application/json' }), `${doc.model.name}.json`);
  }, [doc]);

  const handleExportKsav = useCallback(() => {
    const typ = exportToKsavTypst(doc.model.toSerialized(), chunkBytesRef.current);
    download(new Blob([typ], { type: 'text/plain;charset=utf-8' }), `${doc.model.name}.typ`);
    setToast('Exported Ksav/Typst document.');
  }, [doc]);

  const zoomIn = () => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)));

  // Pane divider drag.
  const onDividerDown = (e: React.MouseEvent) => {
    resizeRef.current = { startX: e.clientX, startW: sourceWidth };
    const move = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = (ev.clientX - resizeRef.current.startX) / window.innerWidth;
      setSourceWidth(Math.max(0.2, Math.min(0.8, resizeRef.current.startW + delta)));
    };
    const up = () => {
      resizeRef.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="app">
      <MenuBar
        onOpen={() => fileInputRef.current?.click()}
        onExportPdf={handleExportPdf}
        onExportJson={handleExportJson}
        onExportKsav={handleExportKsav}
        onUndo={() => doc.undo()}
        onRedo={() => doc.redo()}
        canUndo={doc.canUndo}
        canRedo={doc.canRedo}
        onSelectAll={() => doc.setSelection(0, doc.elements.length)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={() => setZoom(1)}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onInsertBreak={(t) => insertBreak(doc, t)}
        onInsertBullet={() => insertBullet(doc)}
        onInsertFootnote={() => insertFootnote(doc)}
        onFormat={(k) => insertFormatting(doc, k)}
        onAbout={() => setAboutOpen(true)}
      />
      <Toolbar
        doc={doc}
        onOpen={() => fileInputRef.current?.click()}
        onExportPdf={handleExportPdf}
        onExportJson={handleExportJson}
        onExportKsav={handleExportKsav}
        drawMode={drawMode}
        onToggleDraw={() => setDrawMode((v) => !v)}
        zoom={zoom}
        onZoom={setZoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        viewMode={viewMode}
        onViewMode={setViewMode}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden-input"
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          if (f.length) openFiles(f);
          (e.target as HTMLInputElement).value = '';
        }}
      />
      {(inserting || src.sources.some((s) => s.segmenting)) && <div className="segmenting-banner">Segmenting handwriting…</div>}
      {toast && <div className="segmenting-banner toast">{toast}</div>}
      <div className="workspace">
        {viewMode !== 'doc' && (
          <>
            <div className="workspace-source" style={{ width: `${sourceWidth * 100}%` }}>
              <SourcePane
                sources={src.sources}
                activeIdx={src.activeIdx}
                onSetActive={src.setActiveIdx}
                onAddFiles={openFiles}
                onRemove={src.removeSource}
                onPatch={src.patch}
                onInsert={handleInsert}
                totalSelected={src.totalSelected}
                busy={inserting}
              />
            </div>
            {viewMode === 'split' && <div className="workspace-divider" onMouseDown={onDividerDown} title="Drag to resize" />}
          </>
        )}
        {viewMode !== 'source' && (
          <div className="workspace-doc" style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <DocumentView doc={doc} zoom={zoom} drawMode={drawMode} onDrawRect={handleDrawRect} images={chunkImages} />
            {doc.elements.length === 0 && !inserting && (
              <div className="empty-state" style={{ position: 'absolute', inset: 0, background: 'rgba(246,246,244,0.94)', zIndex: 1, pointerEvents: 'none' }}>
                <div className="empty-state-inner">
                  <h1>Scrivio</h1>
                  <p className="tagline">A word processor that starts with a photo of handwriting.</p>
                  <button className="primary large" style={{ pointerEvents: 'auto' }} onClick={() => fileInputRef.current?.click()}>
                    Open handwriting…
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <StatusBar
        docName={doc.model.name}
        elementCount={doc.elements.length}
        direction={doc.model.getSettings().direction}
        cursorIndex={doc.cursor.index}
        zoom={zoom}
        viewMode={viewMode}
      />
      {aboutOpen && (
        <div className="dialog-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setAboutOpen(false); }}>
          <div className="dialog about-dialog" onMouseDown={(e) => e.stopPropagation()}>
            <h2>About Scrivio</h2>
            <p>A word processor that starts with a photo of handwriting — no OCR, just segmentation and layout.</p>
            <p className="muted">Version 1.0.0</p>
            <div className="dialog-actions">
              <button className="primary" onClick={() => setAboutOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function insertFormatting(doc: ReturnType<typeof useDocument>, kind: 'bold' | 'italic' | 'underline') {
  const idx = doc.cursor.index;
  const el = doc.elements[idx];
  if (el?.kind === 'typed-word') {
    const next = { ...el, [kind]: !el[kind as keyof typeof el] } as typeof el;
    const arr = [...doc.elements];
    arr[idx] = next;
    doc.commit(arr, idx);
  }
}

function insertBreak(doc: ReturnType<typeof useDocument>, type: 'line' | 'paragraph') {
  doc.insertElement({
    kind: type === 'line' ? 'line-break' : 'paragraph-break',
    id: crypto.randomUUID(),
    x: 0, y: 0, width: 0, height: 0,
  } as never);
}

function insertBullet(doc: ReturnType<typeof useDocument>) {
  doc.insertElement({ kind: 'bullet', id: crypto.randomUUID(), indentLevel: 0, x: 0, y: 0, width: 6, height: 4 });
}

function insertFootnote(doc: ReturnType<typeof useDocument>) {
  const fid = crypto.randomUUID();
  doc.insertElement({
    kind: 'footnote-ref',
    id: crypto.randomUUID(),
    footnoteId: fid,
    number: doc.model.getFootnotes().length + 1,
    x: 0, y: 0, width: 4, height: 3,
  });
  doc.model.addFootnote({ id: fid, elements: [{ kind: 'typed-word', id: crypto.randomUUID(), text: 'Footnote text', fontFamily: 'serif', fontSize: 3, bold: false, italic: false, underline: false, x: 0, y: 0, width: 20, height: 3 }] });
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return !(a.x + a.w < b.x || b.x + b.width < a.x || a.y + a.h < b.y || b.y + b.height < a.y);
}
