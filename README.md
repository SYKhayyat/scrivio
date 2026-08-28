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
- **Engine**: Rust → WebAssembly (`wasm-pack`) — segmentation, crop, reflow;
  with an equivalent TypeScript fallback so the app works without the wasm bundle
- **Rendering**: Canvas (chunk images) + DOM (typed text) hybrid
- **Storage**: IndexedDB (local, V1)

## Rust / TypeScript split

**Rust is the computation engine; TypeScript is the UI layer.** The entire
engine — segmentation (binarization, connected components, word grouping,
column-aware reading order with user-drawn sections and dividers), chunk
cropping, and the reflow/layout engine — is implemented in Rust and compiled to
WebAssembly (`crates/scrivio-wasm`, bundled in `src/wasm-pkg`). Reflow, the
per-keystroke hot path, crosses the wasm boundary as flat typed arrays (kind
codes + sizes in, `[x, y]` pairs out) — no serialization overhead, ~2× faster
than the TypeScript layout at 5000 elements.

TypeScript provides the React UI and a faithful fallback implementation of the
same engines, so the app runs identically anywhere the wasm bundle is missing
(jsdom tests, restricted environments). Rebuild the bundle with
`npm run wasm:build` (needs `wasm-pack` and Rust's `wasm32-unknown-unknown`
target).

## Quick Start

```bash
nix shell nixpkgs#nodejs_24 --command bash -c 'npm install && npm run dev'
# open http://localhost:5173
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm test` | Vitest (jsdom) |
| `npx tsc --noEmit` | Typecheck |

## Project Status

✅ **V1 built** — modular, SOLID, tested. See [Architecture](docs/ARCHITECTURE.md).

## Docs

- [MVP Requirements](docs/REQUIREMENTS-MVP.md) — full specification for V1
- [V2+ Roadmap](docs/REQUIREMENTS-V2.md) — future features

## License

TBD
