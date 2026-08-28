import { useState, useEffect } from 'react';
import type { ScriptDirection, SourceLayout } from '../core/types';
import { SegmentationEngine } from '../engine/segmentation/segmentation-engine';
import { DEFAULT_CONFIG } from '../core/config';

type FileEntry = {
  file: File;
  direction: ScriptDirection;
  layout: SourceLayout;
  columns: number;
  previewUrl?: string;
  chunks?: Array<{ id: string; bbox: { x: number; y: number; w: number; h: number }; selected: boolean }>;
  error?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (entries: FileEntry[]) => void;
};

export function UploadDialog({ open, onClose, onInsert }: Props) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setEntries([]);
  }, [open]);

  if (!open) return null;

  const addFiles = async (files: File[]) => {
    const next: FileEntry[] = files.map((f) => ({
      file: f,
      direction: 'rtl' as ScriptDirection,
      layout: 'single-column' as SourceLayout,
      columns: 2,
    }));
    for (const e of next) {
      if (e.file.type.startsWith('image/')) {
        e.previewUrl = URL.createObjectURL(e.file);
      }
    }
    setEntries((prev) => [...prev, ...next]);
  };

  const segmentEntry = async (idx: number) => {
    const e = entries[idx];
    if (!e) return;
    setBusy(true);
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
        blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
      }
      const chunks = await engine.segmentImage(blob, { direction: e.direction, layout: { layout: e.layout, columns: e.layout === 'multi-column' ? e.columns : undefined } });
      setEntries((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], chunks: chunks.map((c) => ({ id: c.id, bbox: c.boundingBox, selected: true })), error: undefined };
        return copy;
      });
    } catch (err) {
      setEntries((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], error: String(err) };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ minWidth: 560, maxWidth: '92vw', maxHeight: '88vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <h2>Import handwriting</h2>
        <p className="muted">Pick a file, choose reading order and columns. You can keep only the chunks you want — they will be inserted at the cursor (in the middle of your document if the cursor is there).</p>

        <label className="field">
          <span>Choose files (JPG, PNG, PDF — one page at a time for PDF)</span>
          <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) addFiles(f); (e.target as HTMLInputElement).value = ''; }} />
        </label>

        {entries.length === 0 && <p className="muted">No files yet — drop or choose.</p>}

        {entries.map((ent, idx) => (
          <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, margin: '12px 0', background: '#faf9f7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong>{ent.file.name}</strong>
              <button onClick={() => setEntries((p) => p.filter((_, i) => i !== idx))}>Remove</button>
            </div>
            {ent.previewUrl && <img src={ent.previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: 180, marginTop: 8, border: '1px solid #ccc' }} />}
            <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              <label className="field" style={{ flex: 1 }}>
                <span>Direction</span>
                <select value={ent.direction} onChange={(e) => setEntries((p) => { const c=[...p]; c[idx]={...c[idx], direction:e.target.value as ScriptDirection}; return c; })}>
                  <option value="rtl">RTL (Hebrew/Arabic)</option>
                  <option value="ltr">LTR (English)</option>
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>Layout</span>
                <select value={ent.layout} onChange={(e) => setEntries((p) => { const c=[...p]; c[idx]={...c[idx], layout:e.target.value as SourceLayout}; return c; })}>
                  <option value="single-column">Single column</option>
                  <option value="multi-column">Multi-column</option>
                  <option value="table">Table</option>
                </select>
              </label>
              {ent.layout === 'multi-column' && (
                <label className="field">
                  <span>Columns</span>
                  <input type="number" min={1} max={6} value={ent.columns} onChange={(e) => setEntries((p) => { const c=[...p]; c[idx]={...c[idx], columns: Math.max(1, Math.min(6, parseInt(e.target.value||'1',10)))}; return c; })} />
                </label>
              )}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button disabled={busy} onClick={() => segmentEntry(idx)}>{ent.chunks ? 'Re-segment' : 'Preview chunks'}</button>
              {ent.chunks && <span className="muted">{ent.chunks.filter((c) => c.selected).length}/{ent.chunks.length} selected</span>}
            </div>
            {ent.error && <p style={{ color: 'crimson', fontSize: 13 }}>{ent.error}</p>}
            {ent.chunks && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ent.chunks.map((ch, ci) => (
                  <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: ch.selected ? '#e6f0ff' : '#eee', padding: '2px 6px', borderRadius: 6 }}>
                    <input type="checkbox" checked={ch.selected} onChange={(e) => setEntries((p) => { const c=[...p]; const chs=[...c[idx].chunks!]; chs[ci]={...chs[ci], selected:e.target.checked}; c[idx]={...c[idx], chunks:chs}; return c; })} />
                    #{ci + 1}
                  </label>
                ))}
                <button onClick={() => setEntries((p) => { const c=[...p]; c[idx]={...c[idx], chunks:c[idx].chunks!.map((x)=>({...x, selected:true}))}; return c; })}>All</button>
                <button onClick={() => setEntries((p) => { const c=[...p]; c[idx]={...c[idx], chunks:c[idx].chunks!.map((x)=>({...x, selected:false}))}; return c; })}>None</button>
              </div>
            )}
          </div>
        ))}

        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={entries.length === 0 || busy || entries.some((e) => !e.chunks)} onClick={() => { onInsert(entries); onClose(); }}>
            Insert at cursor ({entries.reduce((s, e) => s + (e.chunks?.filter((c) => c.selected).length ?? 0), 0)} chunks)
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Tip: place the cursor where you want the handwriting to go — in the middle of a page is fine. Uncheck any chunk to not import it.</p>
      </div>
    </div>
  );
}
