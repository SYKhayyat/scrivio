import { useEffect, useRef, useState } from 'react';

type Props = {
  onOpen: () => void;
  onExportPdf: () => void;
  onExportJson: () => void;
  onExportKsav: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSelectAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  viewMode: 'split' | 'source' | 'doc';
  onViewMode: (m: 'split' | 'source' | 'doc') => void;
  onInsertBreak: (type: 'line' | 'paragraph') => void;
  onInsertBullet: () => void;
  onInsertFootnote: () => void;
  onFormat: (kind: 'bold' | 'italic' | 'underline') => void;
  onAbout: () => void;
};

type MenuItem =
  | { kind: 'action'; label: string; shortcut?: string; disabled?: boolean; checked?: boolean; run: () => void }
  | { kind: 'separator' };

type MenuDef = { title: string; items: MenuItem[] };

export function MenuBar(props: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  const menus: MenuDef[] = [
    {
      title: 'File',
      items: [
        { kind: 'action', label: 'Open…', shortcut: 'Ctrl+O', run: props.onOpen },
        { kind: 'separator' },
        { kind: 'action', label: 'Export PDF…', run: props.onExportPdf },
        { kind: 'action', label: 'Export JSON…', run: props.onExportJson },
        { kind: 'action', label: 'Export Ksav… (.typ)', run: props.onExportKsav },
      ],
    },
    {
      title: 'Edit',
      items: [
        { kind: 'action', label: 'Undo', shortcut: 'Ctrl+Z', disabled: !props.canUndo, run: props.onUndo },
        { kind: 'action', label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: !props.canRedo, run: props.onRedo },
        { kind: 'separator' },
        { kind: 'action', label: 'Select All', shortcut: 'Ctrl+A', run: props.onSelectAll },
      ],
    },
    {
      title: 'View',
      items: [
        { kind: 'action', label: 'Side-by-side', checked: props.viewMode === 'split', run: () => props.onViewMode('split') },
        { kind: 'action', label: 'Original Only', checked: props.viewMode === 'source', run: () => props.onViewMode('source') },
        { kind: 'action', label: 'Document Only', checked: props.viewMode === 'doc', run: () => props.onViewMode('doc') },
        { kind: 'separator' },
        { kind: 'action', label: 'Zoom In', shortcut: 'Ctrl+=', run: props.onZoomIn },
        { kind: 'action', label: 'Zoom Out', shortcut: 'Ctrl+-', run: props.onZoomOut },
        { kind: 'action', label: 'Reset Zoom', shortcut: 'Ctrl+0', run: props.onResetZoom },
      ],
    },
    {
      title: 'Insert',
      items: [
        { kind: 'action', label: 'Line Break', shortcut: 'Enter', run: () => props.onInsertBreak('line') },
        { kind: 'action', label: 'Paragraph', shortcut: 'Shift+Enter', run: () => props.onInsertBreak('paragraph') },
        { kind: 'separator' },
        { kind: 'action', label: 'Bullets', run: props.onInsertBullet },
        { kind: 'action', label: 'Footnote', run: props.onInsertFootnote },
      ],
    },
    {
      title: 'Format',
      items: [
        { kind: 'action', label: 'Bold', shortcut: 'Ctrl+B', run: () => props.onFormat('bold') },
        { kind: 'action', label: 'Italic', shortcut: 'Ctrl+I', run: () => props.onFormat('italic') },
        { kind: 'action', label: 'Underline', shortcut: 'Ctrl+U', run: () => props.onFormat('underline') },
      ],
    },
    {
      title: 'Help',
      items: [{ kind: 'action', label: 'About Scrivio', run: props.onAbout }],
    },
  ];

  return (
    <nav className="menubar" ref={barRef} role="menubar">
      {menus.map((m) => (
        <div key={m.title} className="menu">
          <button
            role="menuitem"
            className={`menu-title${openMenu === m.title ? ' open' : ''}`}
            onClick={() => setOpenMenu((cur) => (cur === m.title ? null : m.title))}
          >
            {m.title}
          </button>
          {openMenu === m.title && (
            <div className="menu-dropdown" role="menu">
              {m.items.map((item, i) =>
                item.kind === 'separator' ? (
                  <div key={i} className="menu-separator" />
                ) : (
                  <button
                    key={i}
                    role="menuitem"
                    className="menu-item"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpenMenu(null);
                      item.run();
                    }}
                  >
                    <span>{item.checked ? '✓ ' : ''}{item.label}</span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
