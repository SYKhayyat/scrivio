/* tslint:disable */
/* eslint-disable */

/**
 * Chroma subsampling format
 */
export enum ChromaSampling {
    /**
     * Both vertically and horizontally subsampled.
     */
    Cs420 = 0,
    /**
     * Horizontally subsampled.
     */
    Cs422 = 1,
    /**
     * Not subsampled.
     */
    Cs444 = 2,
    /**
     * Monochrome.
     */
    Cs400 = 3,
}

export function crop_chunk(image_bytes: Uint8Array, x: number, y: number, w: number, h: number, quality: number): Uint8Array;

export function reflow(elements_js: any, page_width_mm: number, paragraph_spacing_mm: number, margin_left_mm: number, margin_right_mm: number): any;

/**
 * Zero-copy reflow: the hot path used on every keystroke.
 *
 * Elements are passed as parallel flat arrays (kind codes + sizes) and
 * positions are returned as a flat `[x0, y0, x1, y1, …]` array in input
 * order — no serde, no per-element allocation across the boundary.
 * Kind codes: 0 = generic element, 1 = line-break, 2 = paragraph-break.
 */
export function reflow_flat(kinds: Uint8Array, widths: Float64Array, heights: Float64Array, page_width_mm: number, paragraph_spacing_mm: number, margin_left_mm: number, margin_right_mm: number): Float64Array;

export function segment_image(image_bytes: Uint8Array, direction_js: any, columns: number | null | undefined, regions_js: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly crop_chunk: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly reflow: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly reflow_flat: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number];
    readonly segment_image: (a: number, b: number, c: any, d: number, e: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
