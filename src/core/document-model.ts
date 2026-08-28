import type { DocumentElement, DocumentSettings, FootnoteEntry, SerializedDocument } from './types';
import { DEFAULT_SETTINGS } from './config';

export type CursorPosition = { index: number };
export type SelectionRange = { anchor: number; focus: number };

export class DocumentModel {
  private elements: DocumentElement[];
  private footnotes: Map<string, FootnoteEntry>;
  private settings: DocumentSettings;
  private cursor: CursorPosition;
  private selection: SelectionRange | null;
  readonly id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  constructor(init?: Partial<SerializedDocument>) {
    this.id = init?.id ?? crypto.randomUUID();
    this.name = init?.name ?? 'Untitled';
    this.createdAt = init?.createdAt ?? Date.now();
    this.updatedAt = init?.updatedAt ?? Date.now();
    this.settings = { ...DEFAULT_SETTINGS, ...init?.settings };
    this.elements = init?.elements ? [...init.elements] : [];
    this.footnotes = new Map((init?.footnotes ?? []).map((f) => [f.id, f]));
    this.cursor = { index: this.elements.length };
    this.selection = null;
  }

  getElements(): readonly DocumentElement[] {
    return this.elements;
  }

  getSettings(): DocumentSettings {
    return { ...this.settings };
  }

  updateSettings(patch: Partial<DocumentSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.touch();
  }

  getCursor(): CursorPosition {
    return { ...this.cursor };
  }

  setCursor(index: number): void {
    this.cursor.index = Math.max(0, Math.min(index, this.elements.length));
    this.selection = null;
  }

  moveCursor(delta: number): void {
    this.setCursor(this.cursor.index + delta);
  }

  getSelection(): SelectionRange | null {
    return this.selection ? { ...this.selection } : null;
  }

  setSelection(anchor: number, focus: number): void {
    this.selection = { anchor, focus };
  }

  clearSelection(): void {
    this.selection = null;
  }

  getSelectedRange(): [number, number] | null {
    if (!this.selection) return null;
    const [a, b] = [this.selection.anchor, this.selection.focus];
    return [Math.min(a, b), Math.max(a, b)];
  }

  insertAt(index: number, element: DocumentElement): void {
    const clamped = Math.max(0, Math.min(index, this.elements.length));
    this.elements.splice(clamped, 0, element);
    if (this.cursor.index >= clamped) this.cursor.index += 1;
    this.touch();
  }

  insertAtCursor(element: DocumentElement): void {
    this.insertAt(this.cursor.index, element);
    this.cursor.index += 1;
  }

  deleteAt(index: number): DocumentElement | undefined {
    if (index < 0 || index >= this.elements.length) return undefined;
    const [removed] = this.elements.splice(index, 1);
    if (this.cursor.index > index) this.cursor.index -= 1;
    this.cursor.index = Math.max(0, Math.min(this.cursor.index, this.elements.length));
    this.touch();
    return removed;
  }

  deleteRange(start: number, end: number): DocumentElement[] {
    const [s, e] = [Math.min(start, end), Math.max(start, end)];
    const clampedS = Math.max(0, s);
    const clampedE = Math.min(e, this.elements.length);
    const removed = this.elements.splice(clampedS, clampedE - clampedS);
    this.cursor.index = clampedS;
    this.selection = null;
    this.touch();
    return removed;
  }

  replaceAt(index: number, element: DocumentElement): DocumentElement | undefined {
    if (index < 0 || index >= this.elements.length) return undefined;
    const old = this.elements[index];
    this.elements[index] = element;
    this.touch();
    return old;
  }

  moveElement(from: number, to: number): void {
    if (from < 0 || from >= this.elements.length) return;
    const clampedTo = Math.max(0, Math.min(to, this.elements.length - 1));
    const [el] = this.elements.splice(from, 1);
    this.elements.splice(clampedTo, 0, el);
    this.touch();
  }

  splice(index: number, deleteCount: number, ...items: DocumentElement[]): DocumentElement[] {
    const removed = this.elements.splice(index, deleteCount, ...items);
    this.touch();
    return removed;
  }

  setElements(elements: DocumentElement[]): void {
    this.elements = [...elements];
    this.cursor.index = Math.min(this.cursor.index, this.elements.length);
    this.touch();
  }

  getFootnotes(): FootnoteEntry[] {
    return [...this.footnotes.values()];
  }

  addFootnote(entry: FootnoteEntry): void {
    this.footnotes.set(entry.id, entry);
    this.touch();
  }

  getFootnote(id: string): FootnoteEntry | undefined {
    return this.footnotes.get(id);
  }

  removeFootnote(id: string): void {
    this.footnotes.delete(id);
    this.touch();
  }

  toSerialized(): SerializedDocument {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      settings: { ...this.settings },
      elements: [...this.elements],
      footnotes: [...this.footnotes.values()],
    };
  }

  clone(): DocumentModel {
    return new DocumentModel(this.toSerialized());
  }

  get length(): number {
    return this.elements.length;
  }

  isEmpty(): boolean {
    return this.elements.length === 0;
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}
