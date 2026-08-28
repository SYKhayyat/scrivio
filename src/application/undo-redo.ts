import type { DocumentElement } from '../core/types';

export type Edit =
  | { type: 'insert'; index: number; element: DocumentElement }
  | { type: 'delete'; index: number; element: DocumentElement }
  | { type: 'replace'; index: number; old: DocumentElement; next: DocumentElement }
  | { type: 'move'; fromIndex: number; toIndex: number; element: DocumentElement }
  | { type: 'batch'; edits: Edit[] };

export function applyEdit(doc: DocumentElement[], edit: Edit): void {
  switch (edit.type) {
    case 'insert':
      doc.splice(edit.index, 0, edit.element);
      break;
    case 'delete':
      doc.splice(edit.index, 1);
      break;
    case 'replace':
      doc[edit.index] = edit.next;
      break;
    case 'move': {
      const [el] = doc.splice(edit.fromIndex, 1);
      doc.splice(edit.toIndex, 0, el ?? edit.element);
      break;
    }
    case 'batch':
      for (const e of edit.edits) applyEdit(doc, e);
      break;
  }
}

export function invertEdit(edit: Edit): Edit {
  switch (edit.type) {
    case 'insert':
      return { type: 'delete', index: edit.index, element: edit.element };
    case 'delete':
      return { type: 'insert', index: edit.index, element: edit.element };
    case 'replace':
      return { type: 'replace', index: edit.index, old: edit.next, next: edit.old };
    case 'move':
      return { type: 'move', fromIndex: edit.toIndex, toIndex: edit.fromIndex, element: edit.element };
    case 'batch':
      return { type: 'batch', edits: [...edit.edits].reverse().map(invertEdit) };
  }
}

export class UndoRedoStack {
  private undoStack: Edit[] = [];
  private redoStack: Edit[] = [];
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  push(edit: Edit): void {
    this.undoStack.push(edit);
    if (this.undoStack.length > this.maxSize) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(doc: DocumentElement[]): Edit | null {
    const edit = this.undoStack.pop();
    if (!edit) return null;
    const inverse = invertEdit(edit);
    applyEdit(doc, inverse);
    this.redoStack.push(edit);
    return inverse;
  }

  redo(doc: DocumentElement[]): Edit | null {
    const edit = this.redoStack.pop();
    if (!edit) return null;
    applyEdit(doc, edit);
    this.undoStack.push(edit);
    return edit;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get undoCount(): number {
    return this.undoStack.length;
  }

  get redoCount(): number {
    return this.redoStack.length;
  }
}
