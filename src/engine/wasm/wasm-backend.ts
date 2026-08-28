/**
 * Optional Rust → WebAssembly backend.
 *
 * The WASM bundle is produced by `npm run wasm:build` (wasm-pack) and copied
 * to `public/wasm/`. When it is present, the heavy image-pipeline work
 * (segmentation, cropping) runs in Rust. When it is absent, the TypeScript
 * engines are used instead — the app behaves the same either way.
 */

export type WasmChunk = {
  id: string;
  boundingBox: { x: number; y: number; w: number; h: number };
  lineIndex: number;
  positionOnLine: number;
};

export type WasmRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
  columns: number;
  dividers: number[];
};

export type WasmElement = {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WasmBackend = {
  segment_image(
    bytes: Uint8Array,
    direction: 'Ltr' | 'Rtl',
    columns: number | null,
    regions: WasmRegion[] | null,
  ): WasmChunk[];
  crop_chunk(bytes: Uint8Array, x: number, y: number, w: number, h: number, quality: number): Uint8Array<ArrayBuffer>;
  reflow(
    elements: WasmElement[],
    pageWidthMm: number,
    paragraphSpacingMm: number,
    marginLeftMm: number,
    marginRightMm: number,
  ): Array<{ id: string; x: number; y: number }>;
  /** Flat typed-array reflow — the per-keystroke hot path. */
  reflow_flat(
    kinds: Uint8Array,
    widths: Float64Array,
    heights: Float64Array,
    pageWidthMm: number,
    paragraphSpacingMm: number,
    marginLeftMm: number,
    marginRightMm: number,
  ): Float64Array;
};

let cached: Promise<WasmBackend | null> | null = null;

export function loadWasmBackend(): Promise<WasmBackend | null> {
  if (!cached) {
    cached = (async () => {
      try {
        // The bundle lives in src/wasm-pkg (built by `npm run wasm:build`;
        // gitignored). If it is ever absent, the import fails and the app falls
        // back to the TypeScript engines.
        const mod = (await import('../../wasm-pkg/scrivio_wasm.js')) as {
          default?: () => Promise<unknown>;
          segment_image?: WasmBackend['segment_image'];
          crop_chunk?: WasmBackend['crop_chunk'];
          reflow?: WasmBackend['reflow'];
          reflow_flat?: WasmBackend['reflow_flat'];
        };
        if (mod.default) await mod.default();
        if (!mod.segment_image || !mod.crop_chunk || !mod.reflow || !mod.reflow_flat) return null;
        return {
          segment_image: mod.segment_image,
          crop_chunk: mod.crop_chunk,
          reflow: mod.reflow,
          reflow_flat: mod.reflow_flat,
        };
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
