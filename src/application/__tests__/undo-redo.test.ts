import { describe, it, expect } from 'vitest';
import { UndoRedoStack } from '../undo-redo';
import type { DocumentElement } from '../../core/types';

function w(id: string): DocumentElement {
  return { kind: 'typed-word', id, text: id, fontFamily: 'serif', fontSize: 4, bold: false, italic: false, underline: false, x: 0, y: 0, width: 5, height: 4 };
}

describe('UndoRedoStack', () => {
  it('push and undo insert', () => {
    const stack = new UndoRedoStack();
    const doc: DocumentElement[] = [];
    stack.push({ type: 'insert', index: 0, element: w('a') });
    doc.splice(0, 0, w('a'));
    expect(doc.length).toBe(1);
    stack.undo(doc);
    expect(doc.length).toBe(0);
    expect(stack.canRedo()).toBe(true);
  });

  it('redo after undo', () => {
    const stack = new UndoRedoStack();
    const doc: DocumentElement[] = [];
    stack.push({ type: 'insert', index: 0, element: w('a') });
    doc.push(w('a'));
    stack.undo(doc);
    stack.redo(doc);
    expect(doc.length).toBe(1);
  });

  it('batch edit', () => {
    const stack = new UndoRedoStack();
    const doc: DocumentElement[] = [w('a'), w('b')];
    stack.push({ type: 'batch', edits: [{ type: 'delete', index: 0, element: w('a') }, { type: 'delete', index: 0, element: w('b') }] });
    doc.splice(0, 2);
    expect(doc.length).toBe(0);
    stack.undo(doc);
    expect(doc.length).toBe(2);
  });

  it('caps size', () => {
    const stack = new UndoRedoStack(2);
    stack.push({ type: 'insert', index: 0, element: w('a') });
    stack.push({ type: 'insert', index: 0, element: w('b') });
    stack.push({ type: 'insert', index: 0, element: w('c') });
    expect(stack.undoCount).toBe(2);
  });
});
