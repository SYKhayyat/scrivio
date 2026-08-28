export type BoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Positioned = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChunkElement = {
  kind: 'chunk';
  id: string;
  sourceImageId: string;
  boundingBox: BoundingBox;
  x: number;
  y: number;
  width: number;
  height: number;
  scratchX?: number;
  scratchY?: number;
};

export type TypedWordElement = {
  kind: 'typed-word';
  id: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scratchX?: number;
  scratchY?: number;
};

export type LineBreakElement = {
  kind: 'line-break';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ParagraphBreakElement = {
  kind: 'paragraph-break';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FootnoteRefElement = {
  kind: 'footnote-ref';
  id: string;
  footnoteId: string;
  number: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BulletElement = {
  kind: 'bullet';
  id: string;
  indentLevel: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DocumentElement =
  | ChunkElement
  | TypedWordElement
  | LineBreakElement
  | ParagraphBreakElement
  | FootnoteRefElement
  | BulletElement;

export type FootnoteEntry = {
  id: string;
  elements: DocumentElement[];
};

export type ScriptDirection = 'ltr' | 'rtl';

export type SourceLayout = 'single-column' | 'multi-column' | 'table';

export type SourceLayoutDeclaration = {
  layout: SourceLayout;
  columns?: number;
};

export type DocumentSettings = {
  pageWidthMm: number;
  bodyHeightMm: number;
  footnoteHeightMm: number;
  direction: ScriptDirection;
  defaultFontFamily: string;
  defaultFontSize: number;
  marginLeftMm: number;
  marginRightMm: number;
  paragraphSpacingMm: number;
};

export type SerializedDocument = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: DocumentSettings;
  elements: DocumentElement[];
  footnotes: FootnoteEntry[];
};

export function isChunk(e: DocumentElement): e is ChunkElement {
  return e.kind === 'chunk';
}
export function isTypedWord(e: DocumentElement): e is TypedWordElement {
  return e.kind === 'typed-word';
}
export function isBreak(e: DocumentElement): boolean {
  return e.kind === 'line-break' || e.kind === 'paragraph-break';
}
