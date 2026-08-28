/**
 * Rust → WebAssembly backend.
 *
 * The heavy image-pipeline work — segmentation, cropping and reflow — runs in
 * Rust via `crates/scrivio-wasm`, built by `npm run wasm:build` into
 * `src/wasm-pkg/` (gitignored apart from its `.d.ts` type files). Rust is the
 * engine, not an optional extra: build/dev guard on the bundle and fail loudly
 * if it is missing rather than silently degrading. A faithful TypeScript
 * implementation exists only for the jsdom unit tests, which cannot instantiate
 * a wasm module.
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
        // Resolved from `src/wasm-pkg/` (build output from `npm run wasm:build`,
        // gitignored apart from the `.d.ts` type files). The build is required —
        // the Rust/WASM engine is the real engine, not an optional extra — so
        // without the bundle the pipeline fails loudly rather than silently
        // degrading to the TypeScript fallback.
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
