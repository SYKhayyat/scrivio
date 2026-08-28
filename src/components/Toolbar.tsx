import type { DocumentHandle } from '../hooks/use-document';

type Props = {
  doc: DocumentHandle;
  onUpload: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  drawMode: boolean;
  onToggleDraw: () => void;
  zoom: number;
  onZoom: (z: number) => void;
};

export function Toolbar({ doc, onUpload, onExportPdf, onExportJson, drawMode, onToggleDraw, zoom, onZoom }: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button onClick={onUpload} title="Upload handwriting">Upload</button>
        <button onClick={() => doc.undo()} disabled={!doc.canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button onClick={() => doc.redo()} disabled={!doc.canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <button onClick={() => insertFormatting(doc, 'bold')} title="Bold (Ctrl+B)"><b>B</b></button>
        <button onClick={() => insertFormatting(doc, 'italic')} title="Italic (Ctrl+I)"><i>I</i></button>
        <button onClick={() => insertFormatting(doc, 'underline')} title="Underline (Ctrl+U)"><u>U</u></button>
        <button onClick={() => insertBreak(doc, 'line')} title="Line break (Enter)">↵</button>
        <button onClick={() => insertBreak(doc, 'paragraph')} title="Paragraph (Shift+Enter)">¶</button>
        <button onClick={() => insertBullet(doc)} title="Bullet list">• List</button>
        <button onClick={() => insertFootnote(doc)} title="Footnote">Footnote</button>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <button className={drawMode ? 'active' : ''} onClick={onToggleDraw} title="Draw chunk (Ctrl+D)">Draw Chunk</button>
      </div>
      <div className="toolbar-sep" />
      <div className="toolbar-group">
        <button onClick={onExportPdf}>Export PDF</button>
        <button onClick={onExportJson}>Export JSON</button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group">
        <label>
          Zoom
          <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={(e) => onZoom(parseFloat(e.target.value))} />
          {Math.round(zoom * 100)}%
        </label>
      </div>
    </div>
  );
}

function insertFormatting(doc: DocumentHandle, kind: 'bold' | 'italic' | 'underline') {
  const idx = doc.cursor.index;
  const el = doc.elements[idx];
  if (el?.kind === 'typed-word') {
    const next = { ...el, [kind]: !el[kind as keyof typeof el] } as typeof el;
    const arr = [...doc.elements];
    arr[idx] = next;
    doc.commit(arr, idx);
  }
}

function insertBreak(doc: DocumentHandle, type: 'line' | 'paragraph') {
  doc.insertElement({
    kind: type === 'line' ? 'line-break' : 'paragraph-break',
    id: crypto.randomUUID(),
    x: 0, y: 0, width: 0, height: 0,
  } as never);
}

function insertBullet(doc: DocumentHandle) {
  doc.insertElement({ kind: 'bullet', id: crypto.randomUUID(), indentLevel: 0, x: 0, y: 0, width: 6, height: 4 });
}

function insertFootnote(doc: DocumentHandle) {
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
