import { useCallback, useMemo, useRef, useState } from 'react';
import { DocumentModel } from '../core/document-model';
import { ReflowEngine } from '../engine/reflow/reflow-engine';
import { UndoRedoStack } from '../application/undo-redo';
import type { DocumentElement } from '../core/types';
import { createConfig } from '../core/config';
import { measureTypedWord } from '../utils/measure-text';

export function useDocument(initial?: DocumentModel) {
  const configRef = useRef(createConfig());
  const reflowRef = useRef(new ReflowEngine());
  const undoRef = useRef(new UndoRedoStack(configRef.current.storage.maxUndoStackSize));
  const [model, setModel] = useState(() => initial ?? new DocumentModel());
  const [elements, setElements] = useState<DocumentElement[]>(() => [...model.getElements()]);
  const [cursor, setCursor] = useState(() => model.getCursor());
  const [selection, setSelection] = useState(() => model.getSelection());

  const reflow = useCallback(
    (els: DocumentElement[], fromIndex = 0) => {
      return reflowRef.current.reflowFrom(els, model.getSettings(), fromIndex);
    },
    [model],
  );

  const commit = useCallback(
    (next: DocumentElement[], fromIndex = 0) => {
      const positioned = reflow(next, fromIndex);
      setElements(positioned);
      model.setElements(positioned);
      setCursor(model.getCursor());
      setSelection(model.getSelection());
    },
    [model, reflow],
  );

  const insertElement = useCallback(
    (el: DocumentElement, index?: number) => {
      const at = index ?? model.getCursor().index;
      const next = [...elements];
      if (el.kind === 'typed-word') {
        const m = measureTypedWord(el.text, el.fontFamily, el.fontSize, el.bold, el.italic);
        el.width = m.width;
        el.height = m.height;
      }
      next.splice(at, 0, el);
      undoRef.current.push({ type: 'insert', index: at, element: el });
      model.setCursor(at + 1);
      commit(next, Math.max(0, at - 5));
    },
    [elements, model, commit],
  );

  const deleteAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= elements.length) return;
      const el = elements[index];
      const next = [...elements];
      next.splice(index, 1);
      undoRef.current.push({ type: 'delete', index, element: el });
      model.setCursor(Math.min(index, next.length));
      commit(next, Math.max(0, index - 5));
    },
    [elements, model, commit],
  );

  const undo = useCallback(() => {
    if (!undoRef.current.canUndo()) return;
    const next = [...elements];
    undoRef.current.undo(next);
    const positioned = reflow(next, 0);
    setElements(positioned);
    model.setElements(positioned);
  }, [elements, model, reflow]);

  const redo = useCallback(() => {
    if (!undoRef.current.canRedo()) return;
    const next = [...elements];
    undoRef.current.redo(next);
    const positioned = reflow(next, 0);
    setElements(positioned);
    model.setElements(positioned);
  }, [elements, model, reflow]);

  const value = useMemo(
    () => ({
      model,
      elements,
      cursor,
      selection,
      setCursor: (i: number) => {
        model.setCursor(i);
        setCursor(model.getCursor());
      },
      setSelection: (a: number, f: number) => {
        model.setSelection(a, f);
        setSelection(model.getSelection());
      },
      insertElement,
      deleteAt,
      commit,
      undo,
      redo,
      canUndo: undoRef.current.canUndo(),
      canRedo: undoRef.current.canRedo(),
      reflow,
      config: configRef.current,
      reflowEngine: reflowRef.current,
    }),
    [model, elements, cursor, selection, insertElement, deleteAt, commit, undo, redo, reflow],
  );

  return value;
}

export type DocumentHandle = ReturnType<typeof useDocument>;
