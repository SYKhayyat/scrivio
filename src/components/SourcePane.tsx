import { useEffect, useRef, useState } from 'react';
import type { BoundingBox, ImportRegion, ScriptDirection } from '../core/types';
import type { SourceEntry } from '../hooks/use-sources';

type Props = {
  sources: SourceEntry[];
  activeIdx: number;
  onSetActive: (idx: number) => void;
  onAddFiles: (files: File[]) => void;
  onRemove: (idx: number) => void;
  onPatch: (idx: number, patch: Partial<SourceEntry>) => void;
  onInsert: () => void;
  totalSelected: number;
  busy: boolean;
};

const MAX_REGION_COLUMNS = 4;

export function SourcePane({
  sources,
  activeIdx,
  onSetActive,
  onAddFiles,
  onRemove,
  onPatch,
  onInsert,
  totalSelected,
  busy,
}: Props) {
  const [regionMode, setRegionMode] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [draftRegion, setDraftRegion] = useState<BoundingBox | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<{ regionId: string; dividerIndex: number; startClientX: number; startDividerX: number; region: ImportRegion } | null>(null);
  const drawRef = useRef<{ startX: number; startY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const active = sources[activeIdx];

  // Fit the preview image inside the preview pane.
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const measure = () => {
      const entry = sources[activeIdx];
      if (!entry?.image) return;
      const availW = el.clientWidth - 2;
      const availH = el.clientHeight - 2;
      const s = Math.min(availW / entry.image.naturalWidth, availH / entry.image.naturalHeight, 1);
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sources, activeIdx]);

  useEffect(() => {
    setRegionMode(false);
    setSelectedRegionId(null);
    setDraftRegion(null);
  }, [activeIdx]);

  const toggleChunk = (idx: number, chunkId: string) => {
    const e = sources[idx];
    if (!e) return;
    onPatch(idx, { chunks: e.chunks.map((c) => (c.id === chunkId ? { ...c, selected: !c.selected } : c)) });
  };

  const setEntryDirection = (idx: number, direction: ScriptDirection) => onPatch(idx, { direction });
  const setEntryColumns = (idx: number, columns: number) => onPatch(idx, { columns: clampCols(columns) });

  const addRegion = (bbox: BoundingBox) => {
    const e = sources[activeIdx];
    if (!e || bbox.w < 12 || bbox.h < 12) return;
    const columns = clampCols(e.columns);
    const region: ImportRegion = {
      id: crypto.randomUUID(),
      x: Math.round(bbox.x),
      y: Math.round(bbox.y),
      w: Math.round(bbox.w),
      h: Math.round(bbox.h),
      columns,
      dividers: Array.from({ length: columns - 1 }, (_, i) => Math.round(bbox.x + ((i + 1) / columns) * bbox.w)),
    };
    onPatch(activeIdx, { regions: [...e.regions, region] });
    setSelectedRegionId(region.id);
  };

  const removeRegion = (regionId: string) => {
    const e = sources[activeIdx];
    if (!e) return;
    onPatch(activeIdx, { regions: e.regions.filter((r) => r.id !== regionId) });
    if (selectedRegionId === regionId) setSelectedRegionId(null);
  };

  const setRegionColumns = (regionId: string, columns: number) => {
    const e = sources[activeIdx];
    const region = e?.regions.find((r) => r.id === regionId);
    if (!region) return;
    const cols = clampCols(columns);
    onPatch(activeIdx, {
      regions: e.regions.map((r) =>
        r.id === regionId
          ? { ...r, columns: cols, dividers: Array.from({ length: cols - 1 }, (_, i) => Math.round(r.x + ((i + 1) / cols) * r.w)) }
          : r,
      ),
    });
  };

  const toImagePoint = (clientX: number, clientY: number) => {
    const rect = previewRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  };

  const handleSurfacePointerDown = (e: React.MouseEvent) => {
    if (!regionMode) return;
    const p = toImagePoint(e.clientX, e.clientY);
    drawRef.current = { startX: p.x, startY: p.y };
    setDraftRegion({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const handleSurfacePointerMove = (e: React.MouseEvent) => {
    if (!active) return;
    if (regionMode && drawRef.current) {
      const p = toImagePoint(e.clientX, e.clientY);
      const s = drawRef.current;
      setDraftRegion({
        x: Math.min(s.startX, p.x),
        y: Math.min(s.startY, p.y),
        w: Math.abs(p.x - s.startX),
        h: Math.abs(p.y - s.startY),
      });
      return;
    }
    if (dragRef.current) {
      const d = dragRef.current;
      const delta = (e.clientX - d.startClientX) / scale;
      const region = d.region;
      const min = region.x + 8;
      const max = region.x + region.w - 8;
      let x = Math.max(min, Math.min(max, d.startDividerX + delta));
      const left = d.dividerIndex > 0 ? region.dividers[d.dividerIndex - 1] + 8 : min;
      const right = d.dividerIndex < region.dividers.length - 1 ? region.dividers[d.dividerIndex + 1] - 8 : max;
      x = Math.max(left, Math.min(right, x));
      onPatch(activeIdx, {
        regions: sources[activeIdx].regions.map((r) =>
          r.id === d.regionId ? { ...r, dividers: r.dividers.map((dv, i) => (i === d.dividerIndex ? Math.round(x) : dv)) } : r,
        ),
      });
    }
  };

  const handleSurfacePointerUp = () => {
    if (regionMode && drawRef.current && draftRegion) {
      const r = draftRegion;
      if (r.w >= 12 && r.h >= 12) {
        addRegion(r);
        setRegionMode(false);
      }
      setDraftRegion(null);
      drawRef.current = null;
    }
    dragRef.current = null;
  };

  const handleDividerPointerDown = (e: React.MouseEvent, regionId: string, dividerIndex: number) => {
    e.stopPropagation();
    const region = active?.regions.find((r) => r.id === regionId);
    if (!region) return;
    setSelectedRegionId(regionId);
    dragRef.current = {
      regionId,
      dividerIndex,
      startClientX: e.clientX,
      startDividerX: region.dividers[dividerIndex] ?? 0,
      region: { ...region, dividers: [...region.dividers] },
    };
  };

  const showAllNone = (all: boolean) => {
    const e = sources[activeIdx];
    if (!e) return;
    onPatch(activeIdx, { chunks: e.chunks.map((c) => ({ ...c, selected: all })) });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) onAddFiles(dropped);
  };

  const surfaceStyle = active?.image
    ? { width: active.image.naturalWidth * scale, height: active.image.naturalHeight * scale }
    : undefined;

  return (
    <div className="source-pane" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
      <header className="source-pane-header">
        <h2>Original</h2>
        <button className="secondary" onClick={() => fileInputRef.current?.click()}>Add files…</button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden-input"
          onChange={(e) => {
            const f = Array.from(e.target.files ?? []);
            if (f.length) onAddFiles(f);
            (e.target as HTMLInputElement).value = '';
          }}
        />
      </header>

      {sources.length === 0 ? (
        <div className="source-pane-empty">
          <p>No source images open.</p>
          <p className="muted">Drop handwriting photos here, or press Ctrl+O. Select text on the original and insert it anywhere in the document.</p>
        </div>
      ) : (
        <>
          <div className="source-tabs">
            {sources.map((s, i) => (
              <span key={i} className={`source-tab${i === activeIdx ? ' active' : ''}`} onClick={() => onSetActive(i)}>
                <span className="source-tab-name" title={s.file.name}>{s.file.name}</span>
                <span className="source-tab-status">
                  {s.segmenting ? '…' : s.error ? '!' : `${s.chunks.filter((c) => c.selected).length}/${s.chunks.length}`}
                </span>
                <button className="icon-btn" aria-label={`Close ${s.file.name}`} onClick={(ev) => { ev.stopPropagation(); onRemove(i); }}>×</button>
              </span>
            ))}
          </div>

          <div className="source-pane-body">
            <div className="source-preview-wrap">
              {active ? (
                <>
                  {active.error && <div className="import-error">{active.error}</div>}
                  {active.segmenting && <div className="import-busy">Segmenting handwriting…</div>}
                  <div className="import-preview" ref={previewRef} onMouseDown={handleSurfacePointerDown} onMouseMove={handleSurfacePointerMove} onMouseUp={handleSurfacePointerUp}>
                    {active.image && surfaceStyle && (
                      <div className="import-surface" style={surfaceStyle}>
                        <img src={active.previewUrl} alt={active.file.name} draggable={false} />
                        {active.regions.map((r, i) => {
                          const selected = selectedRegionId === r.id;
                          return (
                            <div
                              key={r.id}
                              className={`import-region${selected ? ' selected' : ''}`}
                              style={{ left: r.x * scale, top: r.y * scale, width: r.w * scale, height: r.h * scale }}
                              onMouseDown={(e) => { if (regionMode) return; e.stopPropagation(); setSelectedRegionId(r.id); }}
                            >
                              <span className="import-region-label">Section {i + 1}</span>
                              {r.dividers.map((d, di) => (
                                <div
                                  key={di}
                                  className="import-divider"
                                  style={{ left: (d - r.x) * scale }}
                                  onMouseDown={(e) => { if (regionMode) return; handleDividerPointerDown(e, r.id, di); }}
                                  title="Drag to move the column divider"
                                >
                                  <span className="import-divider-handle" />
                                </div>
                              ))}
                            </div>
                          );
                        })}
                        {draftRegion && (
                          <div className="import-region draft" style={{ left: draftRegion.x * scale, top: draftRegion.y * scale, width: draftRegion.w * scale, height: draftRegion.h * scale }} />
                        )}
                        {[...active.chunks].sort((a, b) => b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h).map((c) => (
                          <div
                            key={c.id}
                            className={`import-chunk${c.selected ? ' selected' : ''}`}
                            style={{ left: c.bbox.x * scale, top: c.bbox.y * scale, width: Math.max(2, c.bbox.w * scale), height: Math.max(2, c.bbox.h * scale) }}
                            onMouseDown={(e) => { if (regionMode) return; e.stopPropagation(); toggleChunk(activeIdx, c.id); }}
                            title={c.selected ? 'Click to exclude' : 'Click to include'}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {regionMode && <p className="muted import-hint">Drag on the image to draw a section box.</p>}
                </>
              ) : null}
            </div>

            {active && (
              <div className="source-controls">
                <div className="source-control-row">
                  <span className="source-control-label">Direction</span>
                  <div className="segmented" role="radiogroup" aria-label="Reading direction">
                    <button className={active.direction === 'rtl' ? 'active' : ''} onClick={() => setEntryDirection(activeIdx, 'rtl')}>RTL</button>
                    <button className={active.direction === 'ltr' ? 'active' : ''} onClick={() => setEntryDirection(activeIdx, 'ltr')}>LTR</button>
                  </div>
                </div>

                <div className="source-control-row">
                  <span className="source-control-label">Columns</span>
                  <input type="number" min={1} max={MAX_REGION_COLUMNS} value={active.columns} onChange={(e) => setEntryColumns(activeIdx, parseInt(e.target.value || '1', 10))} aria-label="Default columns" />
                  <button className="secondary" onClick={() => setRegionMode((v) => !v)} disabled={!active.image}>
                    {regionMode ? 'Cancel section' : 'Draw section…'}
                  </button>
                </div>

                {active.regions.length > 0 && (
                  <div className="source-regions">
                    {active.regions.map((r, i) => (
                      <span key={r.id} className={`source-region-chip${selectedRegionId === r.id ? ' selected' : ''}`} onClick={() => setSelectedRegionId(r.id)}>
                        S{i + 1} · {r.columns} col
                        <input type="number" min={1} max={MAX_REGION_COLUMNS} value={r.columns} onClick={(e) => e.stopPropagation()} onChange={(e) => setRegionColumns(r.id, parseInt(e.target.value || '1', 10))} aria-label={`Section ${i + 1} columns`} />
                        <button className="icon-btn" aria-label={`Remove section ${i + 1}`} onClick={(ev) => { ev.stopPropagation(); removeRegion(r.id); }}>×</button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="source-control-row">
                  <span className="source-control-label">Chunks</span>
                  <button className="secondary" onClick={() => showAllNone(true)}>All</button>
                  <button className="secondary" onClick={() => showAllNone(false)}>None</button>
                  <span className="muted">{active.chunks.filter((c) => c.selected).length}/{active.chunks.length} selected</span>
                </div>
                <p className="muted">Click a box on the image to include or exclude it.</p>
              </div>
            )}
          </div>

          <footer className="source-pane-footer">
            <span className="muted">{totalSelected} chunk{totalSelected === 1 ? '' : 's'} selected</span>
            <button className="primary" disabled={totalSelected === 0 || busy} onClick={onInsert}>
              Insert selection at cursor
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function clampCols(n: number): number {
  return Math.max(1, Math.min(MAX_REGION_COLUMNS, Math.round(n || 1)));
}
