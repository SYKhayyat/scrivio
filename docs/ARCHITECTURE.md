# Architecture

## Principles

SOLID, modular, extensible. Ports & Adapters (Hexagonal). Dependency Inversion: core depends on nothing; adapters depend on core.

## Modules

```
src/
  core/           # Domain — types, DocumentModel, Config, Ports (interfaces)
  engine/
    reflow/       # ReflowEngine implements ReflowPort — Rust/WASM (flat arrays), TS fallback
    segmentation/ # SegmentationEngine implements SegmentationPort — Rust/WASM, TS fallback
    wasm/         # WASM backend loader (segmentation, crop, reflow) + typed fallbacks
  application/    # Use-cases + UndoRedoStack (Command pattern)
  storage/        # IndexedDBStorage + InMemoryStorage implement StoragePort
  components/     # React UI — MenuBar, Toolbar, StatusBar, ImportDialog, DocumentView
  hooks/          # useDocument handle
  utils/          # measure-text, export, ids
  wasm-pkg/       # Built Rust/WASM bundle (gitignored except the .d.ts type files; rebuild via `npm run wasm:build`)
crates/scrivio-wasm/  # Rust engine (wasm-bindgen) — segmentation, crop, reflow
```

**Rust is the engine. TypeScript is the UI.** Every computational stage —
segmentation, chunk cropping, and reflow/layout — lives in
`crates/scrivio-wasm` and runs as WebAssembly. It is a required dependency, not
an optional extra: `npm run dev`/`build` guard on the bundle and fail with a
clear message if it is missing. The TS modules in `engine/` are thin adapters
that call the wasm backend; a faithful TS implementation exists only so the
jsdom unit tests can run deterministically (jsdom has no wasm runtime), and
`scripts/wasm-smoke.mjs` exercises the real module in Node. Reflow uses a flat
typed-array boundary (`reflow_flat`) so per-keystroke layout avoids serde
overhead.

## SOLID mapping

- **S**ingle Responsibility: DocumentModel (list ops), ReflowEngine (layout), SegmentationEngine (image→chunks), UndoRedoStack (history).
- **O**pen/Closed: Punctuation strategy (`proximity-micro-ocr` vs `height-band`) via config, ReflowPort allows alternative engines (WASM or TS).
- **L**iskov: Any `StoragePort` (IndexedDB, Memory, future Cloud) substitutable.
- **I**nterface Segregation: Small ports (`ReflowPort`, `SegmentationPort`, `StoragePort`).
- **D**ependency Inversion: `useDocument` depends on ports, not concretions; config injected.

## Data flow

```
Upload → SegmentationEngine → ChunkData[] → DocumentModel.insertAt(cursor)
Edit (insert/delete/move) → UndoRedoStack.push → ReflowEngine.reflowFrom → Canvas+DOM
Storage: DocumentModel.toSerialized() ↔ StoragePort
Export: SerializedDocument → pdf-lib / JSON
```

## Reflow

O(n) single pass. Dirty-region: `reflowFrom(index)` only recomputes from edit point (Stylus Labs Write pattern via `scratchX/scratchY`). See `src/engine/reflow/reflow-engine.ts`.

## Segmentation (8 steps)

1 Binarize (Otsu/adaptive) 2 Connected components (union-find) 3 Filter noise 4 Group into words (gap < medianW×1.5) 5 Detect lines 6 Order (LTR/RTL + columns) 7 Punctuation (proximity micro-OCR) 8 Output. See `segmentation-engine.ts`.

## Rendering

Two layers, one list. Canvas draws chunks, DOM draws typed text + invisible anchors for cursor. Shared mm→px via `dpi/25.4 * zoom`. `requestAnimationFrame` batching (future).

## Config

`createConfig(overrides)` — all thresholds, page sizes, strategies configurable. See `src/core/config.ts`.

## Extensibility

- Add new `DocumentElement.kind` → extend union + reflow branch + renderer.
- Add new `SegmentationPort` impl (e.g. WASM) → swap in `handleUpload`.
- Add cloud storage → implement `StoragePort`.
- V2 features (stylus, OCR, collaboration) plug via same ports without touching core.
