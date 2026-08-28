import type { DocumentSettings, ScriptDirection } from './types';

export type ScrivioConfig = {
  document: DocumentSettings;
  reflow: ReflowConfig;
  segmentation: SegmentationConfig;
  rendering: RenderingConfig;
  storage: StorageConfig;
};

export type ReflowConfig = {
  paragraphSpacingMm: number;
  lineHeightMultiplier: number;
  dirtyRegionEnabled: boolean;
};

export type SegmentationConfig = {
  binarization: 'otsu' | 'adaptive-gaussian';
  adaptiveWindowSize: number;
  adaptiveConstant: number;
  minBlobAreaPx: number;
  maxBlobAreaRatio: number;
  wordGapFactor: number;
  lineGroupFactor: number;
  punctuationStrategy: 'proximity-micro-ocr' | 'height-band';
  punctuationMaxHeightRatio: number;
  punctuationProximityFactor: number;
  downscaleLongEdgePx: number;
  jpegQuality: number;
};

export type RenderingConfig = {
  dpi: number;
  viewportBufferPx: number;
  offscreenCacheEnabled: boolean;
};

export type StorageConfig = {
  dbName: string;
  dbVersion: number;
  maxUndoStackSize: number;
};

export const DEFAULT_SETTINGS: DocumentSettings = {
  pageWidthMm: 210,
  bodyHeightMm: 240,
  footnoteHeightMm: 40,
  direction: 'ltr' as ScriptDirection,
  defaultFontFamily: 'serif',
  defaultFontSize: 4,
  marginLeftMm: 15,
  marginRightMm: 15,
  paragraphSpacingMm: 8,
};

export const DEFAULT_CONFIG: ScrivioConfig = {
  document: { ...DEFAULT_SETTINGS },
  reflow: {
    paragraphSpacingMm: 8,
    lineHeightMultiplier: 1,
    dirtyRegionEnabled: true,
  },
  segmentation: {
    binarization: 'adaptive-gaussian',
    adaptiveWindowSize: 51,
    adaptiveConstant: 10,
    minBlobAreaPx: 30,
    maxBlobAreaRatio: 0.5,
    wordGapFactor: 1.5,
    lineGroupFactor: 0.5,
    punctuationStrategy: 'proximity-micro-ocr',
    punctuationMaxHeightRatio: 0.4,
    punctuationProximityFactor: 1.0,
    downscaleLongEdgePx: 2000,
    jpegQuality: 85,
  },
  rendering: {
    dpi: 96,
    viewportBufferPx: 200,
    offscreenCacheEnabled: true,
  },
  storage: {
    dbName: 'scrivio',
    dbVersion: 1,
    maxUndoStackSize: 1000,
  },
};

export function mmToPx(mm: number, dpi: number, zoom: number): number {
  return mm * (dpi / 25.4) * zoom;
}

export function pxToMm(px: number, dpi: number, zoom: number): number {
  return px / ((dpi / 25.4) * zoom);
}

export function createConfig(overrides?: Partial<ScrivioConfig>): ScrivioConfig {
  return {
    document: { ...DEFAULT_CONFIG.document, ...overrides?.document },
    reflow: { ...DEFAULT_CONFIG.reflow, ...overrides?.reflow },
    segmentation: { ...DEFAULT_CONFIG.segmentation, ...overrides?.segmentation },
    rendering: { ...DEFAULT_CONFIG.rendering, ...overrides?.rendering },
    storage: { ...DEFAULT_CONFIG.storage, ...overrides?.storage },
  };
}
