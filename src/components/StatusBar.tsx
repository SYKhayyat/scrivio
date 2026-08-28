type Props = {
  docName: string;
  elementCount: number;
  direction: 'ltr' | 'rtl';
  cursorIndex: number;
  zoom: number;
  viewMode: 'split' | 'source' | 'doc';
};

export function StatusBar({ docName, elementCount, direction, cursorIndex, zoom, viewMode }: Props) {
  return (
    <footer className="statusbar">
      <span className="statusbar-item statusbar-doc" title="Document name">{docName}</span>
      <span className="statusbar-sep" />
      <span className="statusbar-item">{elementCount} element{elementCount === 1 ? '' : 's'}</span>
      <span className="statusbar-sep" />
      <span className="statusbar-item">Direction: {direction.toUpperCase()}</span>
      <span className="statusbar-sep" />
      <span className="statusbar-item">Cursor: {cursorIndex}</span>
      <span className="statusbar-spacer" />
      <span className="statusbar-item">View: {viewMode === 'split' ? 'Split' : viewMode === 'source' ? 'Original' : 'Document'}</span>
      <span className="statusbar-sep" />
      <span className="statusbar-item">Zoom: {Math.round(zoom * 100)}%</span>
    </footer>
  );
}
