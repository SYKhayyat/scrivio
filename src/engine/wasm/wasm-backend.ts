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

/** A minimal element for the Ksav/Typst body serializer (Rust).
 * `hasBytes` only matters for `chunk`; the Rust side defaults it to false so it
 * can be omitted for every other kind (mirrors `#[serde(default)]`). */
export type KsavExportElement = {
  kind: 'typed-word' | 'line-break' | 'paragraph-break' | 'bullet' | 'footnote-ref' | 'chunk';
  text?: string;
  number?: number;
  id?: string;
  width?: number;
  hasBytes?: boolean;
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
  /** Page-break positions given laid-out element y-coordinates (mm). */
  reflow_page_breaks(ys: Float64Array, bodyHeightMm: number): Float64Array;
  /** Visible-element indices intersecting the mm band [topMm, bottomMm]. */
  reflow_visible_indices(ys: Float64Array, heights: Float64Array, topMm: number, bottomMm: number): Uint32Array;
  /** Build the Ksav/Typst document body in Rust. */
  ksav_body_typst(elements: KsavExportElement[], rtl: boolean): string;
  /** Reading-order indices for chunks about to be inserted. */
  order_chunks(
    xs: Float64Array,
    ys: Float64Array,
    ws: Float64Array,
    hs: Float64Array,
    direction: 'Ltr' | 'Rtl',
    columns: number,
    regions: WasmRegion[] | null,
  ): Uint32Array;
  /** Per-element [pageIndex, yWithinPage] (mm) for PDF export. */
  pdf_page_layout(ys: Float64Array, bodyHeightMm: number): Float64Array;
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
          reflow_page_breaks?: WasmBackend['reflow_page_breaks'];
          reflow_visible_indices?: WasmBackend['reflow_visible_indices'];
          ksav_body_typst?: WasmBackend['ksav_body_typst'];
          order_chunks?: WasmBackend['order_chunks'];
          pdf_page_layout?: WasmBackend['pdf_page_layout'];
        };
        if (mod.default) await mod.default();
        if (
          !mod.segment_image ||
          !mod.crop_chunk ||
          !mod.reflow ||
          !mod.reflow_flat ||
          !mod.reflow_page_breaks ||
          !mod.reflow_visible_indices ||
          !mod.ksav_body_typst ||
          !mod.order_chunks ||
          !mod.pdf_page_layout
        )
          return null;
        return {
          segment_image: mod.segment_image,
          crop_chunk: mod.crop_chunk,
          reflow: mod.reflow,
          reflow_flat: mod.reflow_flat,
          reflow_page_breaks: mod.reflow_page_breaks,
          reflow_visible_indices: mod.reflow_visible_indices,
          ksav_body_typst: mod.ksav_body_typst,
          order_chunks: mod.order_chunks,
          pdf_page_layout: mod.pdf_page_layout,
        };
      } catch {
        return null;
      }
    })();
  }
  return cached;
}
