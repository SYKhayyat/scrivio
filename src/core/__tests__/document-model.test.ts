import { describe, it, expect } from 'vitest';
import { DocumentModel } from '../document-model';

describe('DocumentModel', () => {
  it('starts empty', () => {
    const m = new DocumentModel();
    expect(m.isEmpty()).toBe(true);
    expect(m.length).toBe(0);
  });

  it('inserts and deletes', () => {
    const m = new DocumentModel();
    const el = { kind: 'typed-word' as const, id: '1', text: 'hi', fontFamily: 'serif', fontSize: 4, bold: false, italic: false, underline: false, x: 0, y: 0, width: 5, height: 4 };
    m.insertAt(0, el);
    expect(m.length).toBe(1);
    expect(m.getElements()[0]).toEqual(el);
    const removed = m.deleteAt(0);
    expect(removed).toEqual(el);
    expect(m.length).toBe(0);
  });

  it('cursor clamped', () => {
    const m = new DocumentModel();
    m.setCursor(99);
    expect(m.getCursor().index).toBe(0);
    m.insertAt(0, { kind: 'line-break' as const, id: 'a', x: 0, y: 0, width: 0, height: 0 });
    m.setCursor(5);
    expect(m.getCursor().index).toBe(1);
  });

  it('selection range', () => {
    const m = new DocumentModel();
    m.setSelection(5, 2);
    expect(m.getSelectedRange()).toEqual([2, 5]);
  });

  it('serializes', () => {
    const m = new DocumentModel({ name: 'Test' });
    const s = m.toSerialized();
    expect(s.name).toBe('Test');
    expect(s.elements).toEqual([]);
  });

  it('clone is independent', () => {
    const m = new DocumentModel();
    m.insertAt(0, { kind: 'line-break' as const, id: 'x', x: 0, y: 0, width: 0, height: 0 });
    const c = m.clone();
    c.deleteAt(0);
    expect(m.length).toBe(1);
    expect(c.length).toBe(0);
  });
});
