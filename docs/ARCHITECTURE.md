# Architecture

## Principles

SOLID, modular, extensible. Ports & Adapters (Hexagonal). Dependency Inversion: core depends on nothing; adapters depend on core.

## Modules

```
src/
  core/           # Domain — types, DocumentModel, Config, Ports (interfaces)
  engine/
    reflow/       # ReflowEngine implements ReflowPort
    segmentation/ # SegmentationEngine implements SegmentationPort
  application/    # Use-cases + UndoRedoStack (Command pattern)
  storage/        # IndexedDBStorage + InMemoryStorage implement StoragePort
  rendering/      # Canvas/DOM sync (future split)
  components/     # React UI — Toolbar, DocumentView, CanvasLayer, DomLayer
  hooks/          # useDocument handle
  utils/          # measure-text, export, ids
  wasm-pkg/       # Rust/WASM pkg output (gitignored)
crates/scrivio-wasm/  # Rust crate (wasm-bindgen) — same Reflow/Segmentation API in Rust
```

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
