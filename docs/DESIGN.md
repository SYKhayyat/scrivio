# Scrivio Lite — Design

> High-level design for the V1 rewrite. Describes what we build and why; it is
> not an implementation guide and carries no schedule.

**Status:** accepted design for the rewrite. Supersedes `ARCHITECTURE.md`, which
describes the previous implementation and is kept only as historical reference
in the archived `scrivio_old` repository.

The implementation specification — exact signatures, algorithms, worker
protocols, per-module test lists and the build order — is
[`DETAILED-DESIGN.md`](./DETAILED-DESIGN.md). Where the two disagree on a
detail, the detailed design governs; where they disagree on a decision, this
document governs.

---

## 1. The product in one paragraph

You photograph handwritten notes. Scrivio cuts each photo into word-sized image
chunks and drops them into an editable document as atomic images. You type
between them, delete them, make lists out of them, and footnote them. The
handwriting is never read, never transcribed, never replaced by text. Export to
a self-contained HTML file or a real PDF and you have a document that is still
visibly yours.

The design constraint that follows from this: **the app must never want to
recognise a character.** Segmentation is allowed to know that ink exists, where
it is, and roughly how big it is. It is not allowed to know what it says. See
§8.1 — this boundary is easy to erode by accident.

## 2. Design goals

| # | Goal | How it is judged |
|---|------|------------------|
| G1 | Editing feels like a word processor | Caret, selection, IME, RTL, undo and copy/paste are native behaviour, not reimplemented |
| G2 | No network, ever | Runs from a static build offline; exports open with no network; no backend, no accounts |
| G3 | Handwriting stays handwriting | No OCR path exists in the codebase, not even a disabled one |
| G4 | Responsive at 100 pages | Typing and scrolling stay fluid at ~3,000 chunks |
| G5 | Rebuildable | `docker build && docker run --network none … npm test` succeeds on a clean Linux box |
| G6 | Honest failure | Every failure has a plain-language message. Silent degradation is a bug |
| G7 | Replaceable engine | The **segmentation** compute sits behind `SegmentationPort`; Rust/WASM can replace it without touching domain or UI. This does *not* extend to the export path — see the note below |

### Non-goals

Recognition of any kind (OCR, nikud, diacritics); persistent storage or
accounts; fixed page-layout customisation; columns; multi-column note layouts;
mobile layout. These are stated in the README as permanent, not as a backlog.

**One honest limit on G7.** Segmentation is genuinely swappable — it is
pixel-in, boxes-out, and nothing in it needs a browser. The export path is not,
and should not pretend to be: text measurement, font embedding and glyph
encoding are all browser capabilities, so `PaginationPort` and the export ports
are replaceable only in the sense that a second *implementation* could exist,
not that a non-browser engine could take them over. Stating G7 more broadly than
that would be a claim the architecture does not honour.

## 3. Decisions

Settled forks, with the reasoning that decided them. Reversing any of these is
possible, but each one was deliberate.

| # | Decision | Alternative rejected | Why |
|---|----------|---------------------|-----|
| D1 | **Static web app.** Deployable anywhere; works offline because it is self-contained. | Tauri desktop shell | The acceptance path is "opens offline in any browser". A second toolchain buys nothing and costs the whole rebuildability story |
| D2 | **TypeScript compute engine in Web Workers.** | Rust → WASM (the previous implementation) | A 2 MP photo is ~9M pixels; binarise + connected components on typed arrays is a few hundred ms. Dropping Rust removes the toolchain pin, the uncommitted build artefact, and the largest fragility in the Docker rebuild — for a speed budget we do not need to spend |
| D3 | **ProseMirror** owns the document. | Hand-rolled contenteditable; uncontrolled DOM | Lists, footnotes, RTL, undo and a clean JSON model for export are all solved problems with a solved implementation. We write a schema, not an engine |
| D4 | **Chunks are inline atom nodes** rendering as `<img>`. | Canvas layer; chunk images as block-level | Inline atoms are ProseMirror's native case. They flow, wrap, select, and delete correctly for free |
| D5 | **One continuous document in the editor.** Pagination happens at export. | Live page containers during editing | Real-time pagination of a contenteditable is the single most expensive thing in this app, and it buys a cosmetic guide. See §6.4 |
| D6 | **In-memory only.** Refresh loses the document. Export is the way out. | IndexedDB autosave | Stated as permanently out of scope in the SRS. Zero storage code, zero recovery paths to get wrong |
| D7 | **Page size chosen at export**, defaulting to the first photo's aspect. | Fixed A4 during editing | Follows from D5. The document has no intrinsic page until it is printed |
| D8 | **HTML export inlines each chunk as a base64 JPEG data URI.** | Embedded ZIP + unpack script; PNG | Universally viewable with no script execution, and survives being opened in a text editor. Size is acceptable — see §9.2 |
| D9 | **PDF via `pdf-lib` in a Worker.** | Browser print dialog; WASM PDF writer | The SRS explicitly rejects the print dialog. The Worker keeps the UI responsive during a 100-page export |
| D10 | **Vitest is the test command.** Engine tests run in Node against the real code. Playwright e2e is retained as a separate `npm run e2e`, outside `npm test` and outside the Docker image's command. | Dropping e2e entirely | Playwright needs pre-installed browsers, which would complicate the one-command offline rebuild — but acceptance items 2–6 deserve automated coverage, and excluding it from `npm test` and from the Docker `CMD` costs the rebuild nothing |
| D11 | **Reading-order regions, columns and dividers are dropped.** | The previous implementation's full region UI | The SRS quality bar explicitly excludes multi-column layouts. The reading-order function keeps a shape that can accept a column count later (§7.2) |
| D12 | **Chunks are normalised to the typed text's ink height and baseline-aligned.** | Literal crop at natural size | Otherwise a page of handwriting renders with wildly mismatched word sizes and ragged lines, and the "one document" illusion collapses |
| D13 | **Direction is explicit at three levels and owned by the model.** Per upload, per block, free within a block via the browser. | `dir="auto"`; CSS-only direction toggles | Chunk ordering and visual order must agree, and only the model can guarantee that (§6.5). Auto-detection has nothing to infer from in a block of images |
| D14 | **Hebrew PDF is real, selectable text**, reordered per line by `bidi-js` before drawing. Noto Sans Hebrew (OFL) embedded. | Rasterising typed text; `@react-pdf/renderer`; embedding a font and hoping | Rasterising makes the PDF's text unselectable. `@react-pdf` fights our pagination with its own layout model. Hebrew is non-joining, so with correct reordering there is no shaping gap left to fill (§9.3) |
| D15 | **The UI and HTML export ship no font.** A system stack only. | Commit a webfont | Every platform already has a Hebrew face. Shipping one buys nothing in the editor and adds a base64 payload to an already large HTML export |

## 4. Deviations from the SRS

The SRS is the contract, but three clauses read differently against this design.
Recording them here so the README can be honest rather than quietly divergent.

- **FR2 / FR4 (pages do not re-flow; footnotes sit at the bottom of *that chunk's
  page*).** The editor has no pages, by D5. Both clauses are satisfied *at
  export*, where pagination is computed. In the editor, a footnote's number is
  derived from the **source photo** of the chunk it references, which is stable
  and cheap to compute, and which coincides with the exported number whenever a
  photo's content stays within one page — the common case.
- **FR4 (numbers restart at 1 on each page).** Satisfied literally by the export
  pagination pass, which renumbers footnotes per output page.
- **FR5 (draw a rectangle and it is inserted at the cursor if the cursor is on
  that page).** "That page" is interpreted as "that source photo's block", which
  is the only page-like grouping the editor has.

## 5. Architecture

### 5.1 Shape

Ports and adapters. Dependencies point inward only. The domain layer imports
nothing — not React, not the DOM, not a worker.

```
                    ┌───────────────────────────────────────────┐
   ui/  React       │  ProseMirror view, source panel, toolbar,  │
                    │  export dialog, stress route               │
                    └────────────────────┬──────────────────────┘
                                         │ calls use-cases
                    ┌────────────────────▼──────────────────────┐
   application/     │  ImportPhoto, DrawBox, ExportHtml,         │
                    │  ExportPdf, AttachFootnote                 │
                    └────────────────────┬──────────────────────┘
                                         │ depends on interfaces only
        ┌────────────────────────────────┼───────────────────────────────┐
        │                                │                               │
┌─────────────────┐            ┌────────────────────┐                        ┌────────────────────┐
│ SegmentationPort │            │ document model     │                        │ binarise, CC,      │
│ PaginationPort   │            │ chunk scale        │                        │ word grouping,     │
│ TextMeasurer     │            │ reading order      │                        │ ordering, bidi,    │
│ HtmlExportPort   │            │ footnote numbering │                        │ pdf-lib, HTML      │
│ PdfExportPort    │            │ text layout        │                        │ serialiser         │
└─────────────────┘            └────────────────────┘                        └────────────────────┘
         ▲                                                                          │
         └────────────────── adapters run inside Web Workers ────────────────────┘
```

The engine split matters more than it looks. Segmentation and PDF export are
both multi-second operations on large data; running them on the main thread is
what produces the frozen tab that FR8 forbids. Making the worker the *default*
deployment of every port implementation — rather than an optimisation added
later — is what keeps the rule honest.

### 5.2 Module map

```
src/
  domain/                # Pure. No DOM, no React, no worker globals.
    document.ts          #   Document model types + pure operations
    chunk-scale.ts       #   Chunk height normalisation + per-line baseline
    footnote.ts          #   Footnote numbering by source photo
    ids.ts

  engine/
    ports/               # Interfaces only. Pure TS, structurally typed.
      segmentation.ts    #   segment(rgba, opts) -> Box[]
      text-measurer.ts   #   widthOf(text, style, dir)
      pagination.ts      #   paginate(doc, pageSpec, measurer) -> PageLayout
      html-export.ts
      pdf-export.ts
    segmentation/        # Default SegmentationPort implementation
      binarize.ts        #   Adaptive threshold via integral image
      components.ts      #   Connected components (union-find, typed arrays)
      lines.ts           #   Blob -> line clustering
      words.ts           #   Line -> word grouping
      reading-order.ts   #   LTR / RTL ordering
      punctuation.ts     #   Merge orphan small blobs into their word
      pipeline.ts        #   Composes the above; owns the error taxonomy
    pagination/
    export/
      text-layout.ts     #   Line breaking. Pure; measures via TextMeasurer
      bidi.ts            #   Per-line visual reordering, wrapping bidi-js
      html.ts            #   Serialiser + inliner
      pdf.ts             #   pdf-lib renderer

  application/           # Use-cases. Orchestrate ports. No UI, no DOM.
    import-photo.ts
    draw-box.ts
    export-document.ts
    attach-footnote.ts

  ui/
    editor/              # ProseMirror: schema, chunk node, footnote node,
                         # list config, paste rules, editor component
    source-panel/        # Photo + detected boxes + draw-a-box
    toolbar/
    export-dialog/
    stress/
    app.tsx

  workers/
    segmentation.worker.ts
    pdf-export.worker.ts

  platform/              # The only modules allowed to touch browser APIs
    image-decode.ts      #   createImageBitmap + OffscreenCanvas -> RGBA
    image-crop.ts        #   Crop + JPEG encode, used at import time
    blob-store.ts        #   In-memory chunk image store; blob: URL lifecycle

assets/
  fonts/                 # Committed TTFs, subset at export. See §8.4
```

### 5.3 SOLID, concretely

The previous implementation used SOLID as a slogan. Here each principle is tied
to a specific place it must show up, and the test suite should be able to fail if
it does not.

- **Single responsibility.** `segmentation/pipeline.ts` orchestrates; it contains
  no threshold constants and no image math. `chunk-scale.ts` owns normalisation
  and is callable without a document.
- **Open/closed.** Adding a new element type means adding a ProseMirror node and
  a branch in the two serialisers. Adding a new engine means implementing
  `SegmentationPort`. Neither touches the other.
- **Liskov.** Any object satisfying `PaginationPort` is substitutable. We ship
  one implementation and one test fake; the fake is the proof.
- **Interface segregation.** Five small ports, not one `Engine` interface. The
  HTML exporter has no business depending on segmentation, and `TextMeasurer`
  is separated precisely so line layout can be tested without a canvas.
- **Dependency inversion.** `application/` imports from `engine/ports/`, never
  from `engine/segmentation/`. Composition happens in exactly one file
  (`ui/app.tsx`) and is the only place that knows both.

### 5.4 Ports

```ts
// engine/ports/segmentation.ts
export interface SegmentationPort {
  segment(rgba: RGBA, width: number, height: number,
          opts: SegmentationOptions): Promise<SegmentationResult>
}

// engine/ports/pagination.ts
export interface PaginationPort {
  paginate(doc: DocView, page: PageSpec,
           measurer: TextMeasurer): PageLayout
}

// engine/ports/text-measurer.ts
export interface TextMeasurer {
  widthOf(text: string, style: TextStyle, dir: Direction): number
}

// engine/ports/html-export.ts
export interface HtmlExportPort {
  export(doc: DocView, page: PageSpec, chunks: ChunkImageStore,
        onProgress?: (fraction: number) => void): Promise<Blob>
}

// engine/ports/pdf-export.ts
export interface PdfExportPort {
  export(doc: DocView, page: PageSpec, chunks: ChunkImageStore,
        fonts: FontSet, onProgress?: (fraction: number) => void): Promise<Blob>
}
```

`DocView` is deliberately *not* the ProseMirror document. It is a plain,
serialisable projection — blocks with their `dir`, positioned lines, and a
footnote table — so the exporters depend on a data structure they can reason
about and test, not on ProseMirror. It is also what forces a decision about
plugin state: anything the exporter needs must live in `DocView`, which is why
the footnote table (§6.3) travels with it rather than sitting inside plugin
state that only the editor can see.

`TextMeasurer` exists so that `text-layout` stays pure and testable. In the
browser it is backed by canvas `measureText`; in tests it is a table of
canned widths. This is the same substitution discipline as `SegmentationPort`
and it is what keeps the export layout testable without a canvas (§10).

`segment` takes an RGBA buffer, not an image file. This is a deliberate
architectural choice with two payoffs: the engine becomes testable in Node with
no canvas shim (§10), and decode is isolated in a platform adapter where it
belongs.

```ts
type SegmentationResult =
  | { ok: true; boxes: Box[] }
  | { ok: false; reason: SegmentFailure }
```

The failure arm is not an error type — it is part of the port's signature, because
"this photo has nothing usable on it" (FR6) is an expected outcome, not an
exception.

```ts
type SegmentFailure =
  | 'too-dark' | 'too-low-contrast' | 'almost-empty' | 'decode-failed'
```

## 6. Document model

### 6.1 Schema

```
doc
└─ pageBlock(sourcePageId: string, dir: 'ltr' | 'rtl')   # provenance, not layout
   └─ (paragraph | bullet_list | ordered_list)*          # dir inherited
      └─ listItem+
         └─ inline*                                      # text | chunk | footnoteRef
```

A list is a real container, not an attribute on a paragraph. FR3 requires that a
list item is a line that may mix chunks and typed text *and* that the list can be
continued with typed text — so typed-only items must be legal, which rules out
modelling a list as a single optional `listItem` hung off a paragraph.

`pageBlock` exists to answer "which photo did this come from", which is what
footnote numbering needs (§6.3) and what the source panel needs to decide which
photo to display. It imposes no layout constraint. Users never see it; a
`div[data-page-block]` wrapper is the entire visual consequence.

### 6.2 The chunk node

An inline atom. Everything about its appearance comes from attrs, so the
serialisers never need to touch layout code.

```ts
chunk: {
  inline: true, group: 'inline', atom: true, draggable: false,
  attrs: {
    chunkId: string
    sourcePageId: string
    inkW: number, inkH: number   // ink bounding box, original photo pixels
    lineIndex: number             // line within its photo, for baseline grouping
    baselineOffset: number        // ink bottom relative to the line's baseline, px
  }
}
```

Rendered as `<img contenteditable="false">` with `src` supplied by the blob
store, `vertical-align: baseline`, and a vertical offset computed from
`baselineOffset` so the ink sits on the text baseline rather than the image box
bottom. Without that offset a descender in the crop pushes the whole line up.

**Pixels live in the store, not the document.** The node holds geometry; the
actual JPEG sits behind `chunkId` in `platform/blob-store.ts`. This keeps the
document JSON small and re-exportable, keeps `src` attributes short, and means
one image is decoded once regardless of how many times it is rendered.

The store holds **bytes**, not just object URLs, and it is owned by the main
thread with a documented path for the workers. Both exporters run off-thread and
both need the actual JPEG bytes — one to base64 it into HTML, one to embed it in
a PDF — so the store has to answer a worker's request for bytes rather than
hand out a main-thread-only `blob:` URL. Getting this wrong produces an export
that works for the first page and then silently emits empty images, so it is
specified here rather than left to implementation.

### 6.3 Footnotes

A footnote is two things: a `footnoteRef` inline atom in the flow, and an entry
in a footnote table held in editor plugin state, keyed by an id, carrying the
referenced chunk's `sourcePageId`.

Numbering in the editor is `1..n` **within each `sourcePageId`**, computed by
walking footnote refs in document order. The walk touches only footnote refs —
typically tens, not thousands — so it is cheap enough to recompute on every
transaction, and it never requires a re-render of anything.

The footnote text is edited in a panel pinned below the document, one row per
ref, each row showing its number and its target chunk's thumbnail so the pairing
stays obvious.

At export, pagination assigns each ref to an output page, numbers are recomputed
per page, and each page's footnote area is filled with the refs that landed on
it. This is the only place numbering changes.

### 6.4 Pages in the editor

There are none, by D5. If visible page guides are wanted later, they are a pure
function of the document and a chosen page size — `PaginationPort.paginate` —
already needed for export. Rendering them in the editor is then a decoration
layer over an existing pure function, and can be measured for cost before it is
adopted. Nothing in the core design has to change to add them, and nothing is
spent on them until then.

### 6.5 Direction

Direction is specified at three levels, and getting all three right is what
makes the app feel correct in Hebrew and in English.

**1. Per upload.** SRS FR1: the user chooses LTR or RTL once per upload, and it
applies to every photo in it. This drives segmentation reading order (§7.2) —
it decides whether the first word off the page is its leftmost or its
rightmost — and it sets the initial `dir` of the `pageBlock` created for each
photo in that upload.

**2. Per block.** `pageBlock` carries `dir`. A toolbar action flips the current
block. This is what lets an English note and a Hebrew note live in the same
document without either being wrong. List items inherit from their block; a
future per-item override needs no structural change.

**3. Within a block.** Free, and this is the part worth not over-engineering.
Once `dir` is set correctly, the browser applies the Unicode Bidi Algorithm. An
English word typed inside a Hebrew paragraph renders correctly, as do digits,
punctuation and mixed parentheses — all without anything we write. Footnote
`<sup>` markers land on the visually correct side of their chunk, list bullets
move to the right margin, and the caret, Backspace and native Hebrew IME all
behave as the OS intends. Every one of these is a consequence of setting `dir`
and nothing else.

### The chunk-ordering invariant

**Flipping a block's direction is a model operation, not a CSS toggle.**

Chunks enter the document in reading order. An RTL photo's chunks therefore
enter the model rightmost-word-first, and they render correctly *only* because
`dir="rtl"` makes the browser lay that same sequence out from the right. Flip
the block to LTR and the browser lays the identical sequence out from the left —
so the sentence now renders in reverse, because the first chunk in the model is
the word that was last in reading order.

The fix is to reverse the order of chunk nodes within the block as part of the
direction change, and reverse back when it flips home. It is a small operation
and it is exactly the kind of thing that produces a convincing demo right up
until a judge types an English word into a Hebrew line and the whole page turns
backwards.

Two consequences to hold onto:

- The invariant is *model order matches visual order for the block's direction*.
  It should be asserted by a test for both directions, and after any operation
  that reorders chunks.
- Export inherits it. The paginator reads each block's `dir` and applies bidi
  per rendered line in that base direction (§9.3). If the model invariant ever
  breaks, both exports break together, which at least makes it visible.

`dir="auto"` is deliberately not offered at the block level. It would be
attractive for text-only blocks, but a block containing chunk images has no
first strong character to infer from, and an inferred direction that disagrees
with the chunk ordering is the exact failure above. Direction is explicit.

## 7. Segmentation

### 7.1 Pipeline

Pure functions over typed arrays, run in `segmentation.worker.ts`. Input is a
downscaled RGBA buffer; output is a list of boxes in **original photo pixel
coordinates**, so the source panel overlay and the crop both work without a
second transform.

| # | Stage | Notes |
|---|-------|-------|
| 1 | Decode | `platform/image-decode.ts`. Off the main thread. |
| 2 | Downscale | Long edge to ~2400 px, bilinear. Photo aspect and full-resolution size are retained for the inverse transform |
| 3 | Luma | Integer BT.601 weights into a `Uint8Array` |
| 4 | Adaptive binarise | Integral image, one pass; ink where `v < mean − c`. Chosen over global Otsu because phone photos of paper have uneven lighting, which is exactly Otsu's failure mode |
| 5 | Connected components | Two-pass union-find over `Int32Array` labels. Returns per-component bbox and area |
| 6 | Filter | Drop components below a minimum area; drop any component covering a large fraction of the image (borders, shadows, a hand) |
| 7 | Line clustering | Bucket blobs by vertical centre with tolerance derived from median blob height. **Runs before word grouping** |
| 8 | Word grouping | Within a line bucket only, union blobs whose horizontal gap is under `medianBlobWidth × 1.5`. Bucket-local, so this is near-linear instead of the previous implementation's all-pairs sweep |
| 9 | Reading order | Lines top-to-bottom; within a line by left edge for LTR, right edge for RTL |
| 10 | Punctuation merge | Small orphan blobs (`height < 0.4 × median`) adjacent to a word, with a plausible aspect ratio and ink fill, are absorbed into that word's box |
| 11 | Emit | Transform back to original coordinates; attach per-line baseline |

Step 7 before step 8 is a deliberate change from the previous implementation,
which grouped words first and inferred lines afterwards. Clustering lines first
is both cheaper and more robust, because a word's blobs are by construction
already inside one line.

**Everything between selecting a photo and seeing chunks is off the main
thread.** That is decode, downscale, the eleven stages above, *and* the crop
and JPEG re-encode of every detected chunk. The encode is the one that gets
forgotten: a 3,000-chunk document means 3,000 JPEG encodes at import, which is
seconds of `toBlob` work that will freeze the tab and violate FR8 exactly as
surely as segmentation does. Cropping and encoding are therefore part of the
segmentation worker's job, not a main-thread afterthought, and the batch import
path streams results back per photo so the first page becomes editable before
the last one is encoded.

### 7.2 Reading order and the line baseline

Each line gets a baseline: the maximum ink bottom across its blobs. Each chunk
records `baselineOffset` relative to it. This is what lets a descender on one
word not drag its neighbours down, and it is why `chunk-scale.ts` needs the line
index rather than just the box.

Reading order takes `{ direction, columns }` and today honours `columns: 1`
only. The signature is kept so multi-column support is an additive change
(D11), and so the reading-order unit tests can assert the shape of that extension
without the UI existing.

### 7.3 Thresholds

All thresholds are named constants in one module, derived from the median
statistics of the image being processed rather than hard-coded pixels wherever
the previous implementation did so. Tuning is therefore a function of the test
fixture, not of a developer's machine. The previous implementation's tuned
values are the starting point — they were fitted against real photographs.

### 7.4 Failure

If stages 5–11 yield nothing usable, `segment` returns
`{ ok: false, reason }` and the UI states it plainly, per FR6. "Nothing usable
on this photo — it may be too dark or too low-contrast. Try again with more
light, or draw boxes on it manually." The manual path always exists: a photo
that cannot be segmented can still have hand-drawn boxes added to it, so the
user is never stuck.

## 8. Chunk scale and rendering

### 8.1 The no-recognition boundary

Stage 10 looks at a blob's aspect ratio and ink density to decide whether it
belongs to its neighbour. This is geometry, not recognition: nothing in the
codebase maps an ink shape to a character, a language model, or a codepoint.
It is load-bearing to state this explicitly because stage 10 is the stage where
a future contributor would be tempted to "improve" it into real recognition,
and that would violate the product's only non-negotiable rule (G3).

### 8.2 Normalisation

Three steps, all pure, all in `domain/chunk-scale.ts`:

1. Map the photo onto a page width: `mmPerPx = pageWidthMm / photoWidthPx`.
2. A chunk's natural display height is `inkH × mmPerPx`. Compute this for every
   chunk and take the median — the median is robust to the outliers that will
   certainly exist (a speck, a struck-through word).
3. A single document-wide scale brings that median to the typed text's target ink
   height. Per-chunk display height is then clamped to a band around the target
   so a single pathological blob cannot dominate a line.

One global scale, not per-chunk normalisation: per-chunk would flatten genuine
size variation in the handwriting, which is part of the artefact being preserved.

### 8.3 Rendering at 3,000 chunks

This is the highest-risk requirement in the SRS. The design position is that
**the DOM must contain the whole document** — that is what makes native
selection, caret movement and undo correct — so virtualisation of the document
structure is off the table. What we do instead is make a large DOM cheap:

- **`content-visibility: auto` + `contain-intrinsic-size` on every `pageBlock`.**
  This is the primary mechanism. Off-screen page subtrees skip layout and paint
  while staying in the DOM, so selection and caret still work across the whole
  document. It is one CSS declaration and it is what makes G4 plausible.
- **`decoding="async"` and `loading="lazy"` on chunk images**, plus fixed
  intrinsic dimensions from the normalisation formula, so image decode never
  participates in a layout pass.
- **Blob URLs, not data URIs,** in the live document — attribute strings stay
  short and the base64 expansion of a 3,000-image document never exists in
  memory at once.
- **Measurement cache keyed by `(text, direction, style)`** in the layout
  adapter, so a keystroke in a document of existing words almost always hits.
- **rAF-coalesced transaction flushing**, so a burst of input produces one paint.

If measurement shows these are insufficient, the escalation is *source*
virtualisation, not structural: an `IntersectionObserver` swaps `src` to a
1×1 placeholder for off-screen chunks while preserving their computed box, so
memory and decode drop while layout stays stable. That is a ProseMirror plugin
and does not disturb the model.

The `?stress=N` route (§11) exists to measure this rather than assume it.

### 8.4 Fonts

**Editor and HTML export: ship nothing.** The browser already has a Hebrew face
on every platform, so the UI uses a system stack and costs zero bytes:

```css
--font-ui: system-ui, -apple-system, "Segoe UI", Roboto,
           "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
```

Noto is installed by default on most Linux, Arial covers Hebrew on Windows and
macOS. Native shaping, native IME, nothing to download, nothing to subset.

**PDF export: ship one font.** Noto Sans Hebrew, SIL Open Font License 1.1 —
free to redistribute, and it pairs with Noto Sans for the Latin runs that appear
inside Hebrew lines. One static Regular instance, committed under
`assets/fonts/`.

**The static-instance rule is not optional.** `pdf-lib`'s font subsetting has a
history of rendering some embedded fonts as empty boxes in Acrobat and Safari
(pdf-lib #688), and variable fonts are a recurring trigger. Use the static
instance, and keep one real-viewer test that opens an exported Hebrew PDF and
confirms glyphs are visible. A font that embeds silently and renders as blanks
is worse than no font at all.

## 9. Export

Both exporters consume the same `paginate()` output. That is the point of
having a `PaginationPort`: page assignment, footnote renumbering, line breaking
and footnote-area allocation are computed once, in one pure module, and the two
renderers differ only in how they draw. Neither renderer owns a layout decision,
which is what stops the HTML and PDF from drifting apart.

### 9.1 Pagination

`paginate(doc, pageSpec) -> PageLayout` assigns every block to an output page,
reserving vertical space at the bottom of each page for the footnote area that
page needs, and returns per-page element ranges plus per-page footnote groups.
Pure, synchronous, no DOM measurement beyond what the layout adapter supplies.

`pageSpec` defaults to the first source photo's aspect ratio at a fixed width,
per D7; the export dialog can override with any standard size or a custom one.

### 9.2 HTML

One file, no scripts, no network. CSS inlined in a `<style>` block. Chunk images
inlined as `data:image/jpeg;base64,…`, re-encoded once at import time at
quality 80 rather than re-encoded per export. Text escaped properly; direction
set with `dir` on the page container so RTL bidi resolution is the browser's job.

Generated in a worker with progress reporting. A 3,000-chunk document lands
around 10–25 MB, which is large but opens immediately in any browser and is the
honest cost of "no network, ever".

Direction needs no work here at all, which is the payoff for getting `dir` right
in the model: each block carries `dir`, and the browser resolves bidi natively.
Hebrew paragraphs, and Hebrew paragraphs with English and digits in them, are
correct by construction rather than by our arithmetic.

### 9.3 PDF

`pdf-lib` in a worker, writing a real file download — never the print dialog.
Typed text is embedded as **selectable, searchable text** in both directions.

**The problem this has to solve.** `pdf-lib` maps characters to glyphs in the
order given. It implements no bidirectional reordering and no complex-script
shaping. A Hebrew PDF built the obvious way renders right-to-left text
visually reversed, and digits and Latin runs come out in the wrong order — the
behaviour is documented and reproducible in pdf-lib issues #657, #1159 and #688.
Embedding a Hebrew TTF alone does not fix it: that repairs missing glyphs, not
ordering.

**Why it is nevertheless tractable here.** Hebrew is a *non-joining* script.
Letters do not connect, so there is no cursive shaping to perform — glyph
selection is effectively one codepoint to one glyph, and text widths are purely
additive. This is the single fact that makes correct embedded Hebrew possible
without a shaping engine, and it does not hold for Arabic or Devanagari. Nikud
is explicitly out of scope (SRS), which conveniently also removes the one Hebrew
feature that would demand real shaping.

**How it works.** `bidi-js` (MIT, ~16 KB, zero dependencies) implements the
Unicode Bidirectional Algorithm v13 and passes the official UAX #9 conformance
suite. Its API takes a `start`/`end` range per call, which is exactly the
per-line granularity bidi is specified at — and we are already splitting text
into lines for pagination (§9.1), so this extends machinery that exists rather
than adding a parallel one.

Per rendered line: resolve embedding levels against the block's base direction,
reorder to visual order with bracket mirroring applied, then `drawText` once at
the line's computed position. Lines that interleave chunk images and typed text
use the segment API instead, so each visual run is measured with
`widthOfTextAtSize` and placed sequentially.

Three deliberate constraints:

- **Reorder per line, after line breaking.** UAX #9 applies to a line, not to
  the paragraph. Running bidi over the whole block and then wrapping would be
  wrong at the boundaries.
- **One rendering path.** There is no rasterised fallback. Two renderers would
  double the surface we have to test, and a silently-degraded second path is
  precisely what G6 forbids. If the font fails to embed, the export reports it
  in plain words and fails.
- **The base direction comes from the block, never from sniffing the text.** It
  must agree with the chunk-ordering invariant (§6.5), and the block is the one
  place that already knows.

### 9.4 Shared layout

`paginate()` is direction-aware throughout: it reads each block's `dir`, breaks
lines in that base direction, and aligns LTR lines to the left margin and RTL
lines to the right. Line measurement goes through `TextMeasurer`, so the whole
export layout is pure and testable against canned widths — no canvas, no
browser, no jsdom.

It is also the only place that knows about fonts. The PDF renderer asks the
paginator for line boxes in logical order and applies bidi to each one; the HTML
renderer asks for the same boxes and emits `dir` attributes instead.

## 10. Testing

`npm test` is the only command, and it runs offline. Two Vitest projects:

- **`node`** — domain and engine. Because `segment` takes an RGBA buffer rather
  than a file, segmentation tests construct pixel buffers directly and need no
  canvas implementation, no native binary, and no network. Reading order,
  punctuation merging, chunk scaling, footnote numbering and pagination are all
  pure and tested directly against hand-built inputs.
- **`jsdom`** — ProseMirror schema and node views, source panel interaction,
  export dialog, list and footnote commands.

**Real-handwriting regression.** Unit tests built from synthetic buffers would
only prove the algorithm runs, not that it still segments real photographs. So we
commit three real handwriting photos, converted to raw single-channel grayscale
fixtures (~4.2 MB total, no dependencies, no decoder needed to read them), plus
the expected number of words each must yield. The test asserts a tolerance, not
an exact count, because the correct answer for a photograph is not a single
integer — and it asserts the tolerance was set from a real run, so it cannot be
widened to hide a regression. This catches the regression that matters: a
threshold change that quietly stops finding words in real ink.

**Excluded from the test command.** Playwright. `npm test` is Vitest only and
never invokes a browser, so the offline one-command rebuild is unaffected.
`npm run e2e` exists and is documented in the README; it needs
`npm run e2e:install` first, and no judge is required to run it to reach
acceptance.

## 11. Stress route

`?stress=N` generates N synthetic handwriting pages **through the real
segmentation port** — not a mock, and not a shortcut around the pipeline.
Procedurally drawn squiggle glyphs on a noisy, slightly blurred, JPEG-degraded
white page, encoded to a blob and fed to the same worker the upload path uses.

It then reports, on screen: total segmentation time, time to first paint, a
synthetic typing benchmark (median keystroke-to-paint latency over 200 simulated
keystrokes), and a scroll benchmark (long-task count and dropped frames over a
programmed scroll). This turns G4 from an assertion into a measurement anyone can
reproduce in one click, which is what the SRS asks for.

## 12. Rebuildability

Every item on the judges' checklist, by construction:

| Requirement | How |
|-------------|-----|
| Git | One repository; commit per working step |
| Lockfile | `package-lock.json`, committed, `npm ci` everywhere |
| Pinned language | `.nvmrc`, Node 22 |
| Dockerfile | `node:22-slim`; `npm ci`; `CMD ["npm","test"]`. No compiler, no Rust, no wasm toolchain, no native modules |
| One offline test command | `npm test` — Vitest only, no browser binaries, no network |
| README | What it is, setup, run, test, live link |
| `.env.example` | Present, empty. The app has no backend, no secrets, no configuration |
| No machine paths | No absolute paths outside the project |
| No native dependencies | `bidi-js` is pure JS; the one font file is committed; `node:22-slim` needs no compiler toolchain |

The single most valuable consequence of D2 lives here: the Docker image needs
nothing but Node, so a first-time rebuild failure is very unlikely — which is
directly rewarded under *Best Use*.

## 13. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| 3,000 chunk nodes degrade typing or scrolling | Fails acceptance 6 | `content-visibility` per page block first (§8.3); source virtualisation as escalation; `?stress=N` measures it rather than guessing |
| Hebrew PDF renders in the wrong order | Hebrew documents export backwards — the most visible failure this app has | `bidi-js` reorders per line before drawing; Noto Sans Hebrew static instance; one real-viewer regression test (§8.4, §9.3) |
| pdf-lib renders an embedded font as blank boxes | Hebrew export shows empty squares in Acrobat or Safari | The static-instance rule plus a test that opens an exported PDF in a real viewer (§8.4). A silently-blank glyph is worse than a visible failure |
| Segmentation quality regresses on real photographs | Fails acceptance 2 | Commit real grayscale fixtures with expected word counts (§10); thresholds derived from image statistics, not fixed pixels |
| ProseMirror fights us on paste or drag of chunks | Chunks get duplicated or lost on paste | Chunk `parseDOM`/`toDOM` round-trip rules, `draggable: false`, paste tests in the jsdom project |
| 25 MB HTML export exhausts memory on modest hardware | Fails acceptance 5 | Build in a worker, assemble via `Blob` parts rather than one concatenated string, report progress |
| Scope creep into recognition | Violates G3, the product's premise | §8.1 states the boundary; the README lists OCR as permanently out of scope |

## 14. What this design deliberately does not do

Multi-column reading order (D11), live page guides (§6.4), persistent storage
(D6), a desktop shell (D1), real cross-browser end-to-end tests (D10). Each is a
plausible future change with a defined seam in this design and no rework implied
— and none of them is worth the rebuildability budget that D2 protects.

One thing is out of scope that looks like a feature: **Arabic, Devanagari and
other cursive or complex scripts**. D14 works because Hebrew does not join
letters. Extend the product to those scripts and the PDF path needs a real
shaping engine — `harfbuzzjs`, most likely — which is a project of its own. The
README should say so rather than implying general Unicode support.
