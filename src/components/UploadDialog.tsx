import { useState } from 'react';
import type { ScriptDirection, SourceLayout } from '../core/types';

type Props = {
  open: boolean;
  onClose: () => void;
  onUpload: (files: File[], direction: ScriptDirection, layout: SourceLayout, columns?: number) => void;
};

export function UploadDialog({ open, onClose, onUpload }: Props) {
  const [direction, setDirection] = useState<ScriptDirection>('ltr');
  const [layout, setLayout] = useState<SourceLayout>('single-column');
  const [columns, setColumns] = useState(2);
  const [files, setFiles] = useState<File[]>([]);

  if (!open) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
    setFiles((prev) => [...prev, ...dropped]);
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <h2>Upload handwriting</h2>
        <p className="muted">Drop JPG, PNG, or PDF photos of handwritten pages. Chunks appear at the cursor.</p>

        <label className="field">
          <span>Files</span>
          <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        {files.length > 0 && <ul className="file-list">{files.map((f) => <li key={f.name}>{f.name}</li>)}</ul>}

        <label className="field">
          <span>Script direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as ScriptDirection)}>
            <option value="ltr">LTR (English, etc.)</option>
            <option value="rtl">RTL (Hebrew, Arabic)</option>
          </select>
        </label>

        <label className="field">
          <span>Source layout</span>
          <select value={layout} onChange={(e) => setLayout(e.target.value as SourceLayout)}>
            <option value="single-column">Single column</option>
            <option value="multi-column">Multi-column</option>
            <option value="table">Table</option>
          </select>
        </label>

        {layout === 'multi-column' && (
          <label className="field">
            <span>Columns</span>
            <input type="number" min={2} max={4} value={columns} onChange={(e) => setColumns(parseInt(e.target.value, 10))} />
          </label>
        )}

        <div className="dialog-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={files.length === 0}
            onClick={() => {
              onUpload(files, direction, layout, columns);
              onClose();
            }}
          >
            Segment &amp; Insert
          </button>
        </div>
      </div>
    </div>
  );
}
