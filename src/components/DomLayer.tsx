import type { DocumentElement } from '../core/types';
import { mmToPx } from '../core/config';

type Props = {
  elements: DocumentElement[];
  zoom: number;
  cursorIndex: number;
  onCursorMove: (index: number) => void;
  onSelect: (anchor: number, focus: number) => void;
};

export function DomLayer({ elements, zoom, cursorIndex, onCursorMove, onSelect }: Props) {
  const dpi = 96;
  let selecting = false;
  let anchor = cursorIndex;

  const handleMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    const targetIdx = idx;
    if (e.shiftKey) {
      onSelect(anchor, targetIdx);
    } else {
      anchor = targetIdx;
      selecting = true;
      onCursorMove(targetIdx);
    }
  };

  const handleMouseUp = (e: React.MouseEvent, idx: number) => {
    if (selecting) {
      onSelect(anchor, idx);
      selecting = false;
    }
    void e;
  };

  return (
    <div className="dom-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {elements.map((el, idx) => {
        const x = mmToPx(el.x, dpi, zoom);
        const y = mmToPx(el.y, dpi, zoom);
        const isCursorHere = cursorIndex === idx;
        const common: React.CSSProperties = {
          position: 'absolute',
          left: x,
          top: y,
          pointerEvents: 'auto',
        };

        if (el.kind === 'typed-word') {
          return (
            <span
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, idx)}
              onMouseUp={(e) => handleMouseUp(e, idx + 1)}
              style={{
                ...common,
                fontFamily: el.fontFamily,
                fontSize: mmToPx(el.fontSize, dpi, zoom),
                fontWeight: el.bold ? 700 : 400,
                fontStyle: el.italic ? 'italic' : 'normal',
                textDecoration: el.underline ? 'underline' : 'none',
                whiteSpace: 'pre',
                lineHeight: 1,
              }}
            >
              {el.text}{' '}
              {isCursorHere && <span className="caret" />}
            </span>
          );
        }

        if (el.kind === 'chunk') {
          return (
            <span
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, idx)}
              onMouseUp={(e) => handleMouseUp(e, idx + 1)}
              style={{
                ...common,
                display: 'inline-block',
                width: mmToPx(el.width, dpi, zoom),
                height: mmToPx(el.height, dpi, zoom),
                verticalAlign: 'bottom',
              }}
              aria-label="handwritten chunk"
            >
              {isCursorHere && <span className="caret" />}
            </span>
          );
        }

        if (el.kind === 'line-break' || el.kind === 'paragraph-break') {
          return (
            <span key={el.id} onMouseDown={(e) => handleMouseDown(e, idx)} style={{ ...common, width: 0, height: 0 }}>
              {isCursorHere && <span className="caret" />}
            </span>
          );
        }

        if (el.kind === 'footnote-ref') {
          return (
            <sup
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, idx)}
              style={{ ...common, fontSize: 10, color: '#2a5bd7', cursor: 'pointer' }}
            >
              [{el.number}]
              {isCursorHere && <span className="caret" />}
            </sup>
          );
        }

        if (el.kind === 'bullet') {
          return (
            <span key={el.id} style={{ ...common, fontSize: mmToPx(4, dpi, zoom) }}>
              •
            </span>
          );
        }

        return null;
      })}
      {cursorIndex === elements.length && (
        <span
          className="caret"
          style={{
            position: 'absolute',
            left: elements.length ? mmToPx(elements[elements.length - 1].x + elements[elements.length - 1].width, dpi, zoom) : mmToPx(15, dpi, zoom),
            top: elements.length ? mmToPx(elements[elements.length - 1].y, dpi, zoom) : 0,
          }}
        />
      )}
    </div>
  );
}
