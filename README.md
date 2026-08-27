# Scrivo

> A word processor that starts with a photo of handwriting.

## The Idea

You have handwritten notes — on paper, in a notebook, on a whiteboard. Instead of
transcribing them (OCR), Scrivo lifts the words off the page as opaque image blobs
called **chunks**. Each chunk is one word, preserved exactly as you wrote it.

Then you edit the document using familiar word processor tools: insert text between
chunks, delete chunks, make lists, add footnotes, add paragraphs. The chunks stay
as images. Your handwriting is always your handwriting — it's never converted to typed
text unless you explicitly ask for it.

**No OCR. No transcription. Just your handwriting, structured.**

## Architecture

The document is a single flat list of elements — chunks, typed words, breaks, and
footnote references. A Rust/WASM reflow engine positions every element. Two rendering
layers (canvas for chunks, DOM for typed text) read from the same list.

```
┌─────────────────────────────────────────┐
│  Data model: flat list of elements      │
├─────────────────────────────────────────┤
│  Reflow engine (Rust/WASM)             │
├──────────┬──────────────────────────────┤
│  Canvas  │  DOM                         │
│  (chunks)│  (typed text + cursors)      │
└──────────┴──────────────────────────────┘
```

## Tech Stack

- **UI**: TypeScript + React
- **Computation**: Rust → WebAssembly (wasm-pack)
- **Image processing**: Rust `image` + `imageproc` crates
- **Rendering**: Canvas + DOM hybrid
- **Storage**: IndexedDB (local, V1)

## Project Status

🚧 **Requirements complete** — ready to build.

## Docs

- [MVP Requirements](docs/REQUIREMENTS-MVP.md) — full specification for V1
- [V2+ Roadmap](docs/REQUIREMENTS-V2.md) — future features

## License

TBD
