# Scrivio

> A word processor that starts with a photo of handwriting.

## The Idea

You have handwritten notes — on paper, in a notebook, on a whiteboard. Instead of
transcribing them (OCR), Scrivio lifts the words off the page as opaque image blobs
called **chunks**. Each chunk is one word, preserved exactly as you wrote it.

Then you edit the document using familiar word processor tools: insert text between
chunks, delete chunks, make lists, add footnotes, add paragraphs. The chunks stay
as images. Your handwriting is always your handwriting — it's never converted to typed
text unless you explicitly ask for it.

**No OCR. No transcription. Just your handwriting, structured.**

## Architecture

The document is a single flat list of elements — chunks, typed words, breaks, and
footnote references. Two rendering layers (canvas for chunks, DOM for typed text)
read from the same list.

```
┌─────────────────────────────────────────────┐
│  Data model: flat list of elements          │
├─────────────────────────────────────────────┤
│  Engine (Rust/WASM, TS fallback)           │
│  · segmentation · crop · reflow            │
├──────────┬──────────────────────────────────┤
│  Canvas  │  DOM                             │
│  (chunks)│  (typed text + cursors)          │
└──────────┴──────────────────────────────────┘
```

## Tech Stack

- **UI**: TypeScript + React
- **Engine**: Rust → WebAssembly (`wasm-pack`) — segmentation, crop, reflow,
  page-break/culling, Ksav export body, reading-order sort, PDF page layout.
  The Rust engine is required — it is the engine, not an optional extra. The bundle is build output (gitignored apart
  from its `.d.ts` type files), so a clean clone must run `npm run wasm:build`
  once before `dev`/`build`/`test`.
- **Rendering**: Canvas (chunk images) + DOM (typed text) hybrid
- **Storage**: IndexedDB (local, V1)

## Rust / TypeScript split

**Rust is the computation engine; TypeScript is the UI layer.** The entire
engine — segmentation (binarization, connected components, word grouping,
column-aware reading order with user-drawn sections and dividers), chunk
cropping, the reflow/layout engine, page-break computation
(`reflow_page_breaks`), viewport culling (`reflow_visible_indices`), the
Ksav/Typst export body (`ksav_body_typst`), the reading-order sort used when
building import entries (`order_chunks`), and the PDF page-splitting math
(`pdf_page_layout`) — is implemented in Rust and compiled to WebAssembly
(`crates/scrivio-wasm`, bundled in `src/wasm-pkg`). Rust is the
engine that runs; there is no user-facing fallback. `npm run dev`/`build`/`test`
guard on the bundle and fail with a clear message if it is missing rather than
silently degrading. Reflow, the per-keystroke hot path, crosses the wasm
boundary as flat typed arrays (kind codes + sizes in, `[x, y]` pairs out) — no
serialization overhead, ~2× faster than the TypeScript layout at 5000 elements.

TypeScript is the UI layer, with an *equivalent* engine implementation used
only by the jsdom unit tests, which cannot instantiate a wasm module (there is
no real WebAssembly runtime under jsdom). The browser — and the smoke test in
`scripts/wasm-smoke.mjs` — always run the real Rust module. Rebuild the bundle
with `npm run wasm:build` (needs `wasm-pack` and Rust's `wasm32-unknown-unknown`
target).

## Quick Start

The Rust engine is required. Build it once (needs `wasm-pack` and the `wasm32-unknown-unknown` target), then dev/build as usual:

```bash
nix shell nixpkgs#nodejs_24 nixpkgs#rustup --command bash -c \
  'npm install && npm run wasm:build && npm run dev'
# open http://localhost:5173
```

If the bundle is missing, `npm run dev`/`npm run build` fail immediately with
instructions rather than running without the Rust engine. The bundle is build
output, so it is not committed (only its `.d.ts` type files are, so a clean
clone still typechecks).

## Scripts

| Script | Description |
|--------|-------------|
| `npm run wasm:build` | Build the Rust engine → `src/wasm-pkg` (required first) |
| `npm run wasm:smoke` | Load the real wasm module in Node and drive it (segmentation/crop/reflow/culling/ksav/reading-order/pdf-layout) |
| `npm run dev` | Vite dev server (guards on the wasm bundle) |
| `npm run build` | Guard + typecheck + production build |
| `npm test` | Smoke test (real Rust engine) + Vitest (36 tests; jsdom uses the TS twin unless it needs wasm — the Ksav export test runs the real module in Node) |
| `npx tsc --noEmit` | Typecheck (works without the bundle — `.d.ts` are committed) |

## Project Status

✅ **V1 built** — modular, SOLID, tested. See [Architecture](docs/ARCHITECTURE.md).

## Docs

- [MVP Requirements](docs/REQUIREMENTS-MVP.md) — full specification for V1
- [V2+ Roadmap](docs/REQUIREMENTS-V2.md) — future features

## License

TBD
