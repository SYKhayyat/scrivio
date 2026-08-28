import type { BoundingBox, DocumentElement, DocumentSettings, ScriptDirection, SourceLayoutDeclaration } from './types';

export interface ReflowPort {
  reflow(elements: DocumentElement[], settings: DocumentSettings): DocumentElement[];
  reflowFrom(elements: DocumentElement[], settings: DocumentSettings, fromIndex: number): DocumentElement[];
}

export type ChunkData = {
  id: string;
  boundingBox: BoundingBox;
  lineIndex: number;
  positionOnLine: number;
  cropBlob?: Blob;
};

export type SegmentOptions = {
  direction: ScriptDirection;
  layout: SourceLayoutDeclaration;
  signal?: AbortSignal;
};

export interface SegmentationPort {
  segmentImage(image: ImageData | Blob, options: SegmentOptions): Promise<ChunkData[]>;
  cropChunk(imageBlob: Blob, bbox: BoundingBox, quality?: number): Promise<Blob>;
}

export interface StoragePort {
  saveDocument(doc: import('./types').SerializedDocument): Promise<void>;
  loadDocument(id: string): Promise<import('./types').SerializedDocument | undefined>;
  listDocuments(): Promise<import('./types').SerializedDocument[]>;
  deleteDocument(id: string): Promise<void>;
  saveImage(id: string, blob: Blob): Promise<void>;
  loadImage(id: string): Promise<Blob | undefined>;
  saveChunkCrop(chunkId: string, blob: Blob): Promise<void>;
  loadChunkCrop(chunkId: string): Promise<Blob | undefined>;
  saveChunkCropsBatch(entries: Array<{ id: string; blob: Blob }>): Promise<void>;
}

export interface RendererPort {
  render(elements: DocumentElement[], viewport: { x: number; y: number; w: number; h: number }): void;
  dispose(): void;
}
