# Scrivio — MVP Requirements

> A word processor that starts with a photo of handwriting and lets you edit the words
> as opaque image chunks — no OCR, no transcription, just segmentation and layout.

---

## Core Thesis

People write by hand. They have handwritten pages. Instead of transcribing them (OCR),
we lift the words off the page as opaque image blobs ("chunks") and build a word
processor on top of those chunks. The user edits the *sequence* of chunks using
standard document tools — they never need to convert handwriting to typed text.

**No OCR. No transcription. Just your handwriting, structured.**

---

## Architecture — The Unified Data Model

The entire document is a single ordered list of elements. Every element — whether a
handwritten chunk, a typed word, a break, or a footnote reference — is the same kind
of object with the same interface. The reflow engine operates on this list. The two
rendering layers (canvas and DOM) both read from this list. Undo/redo mutates this
list. Export reads this list.

```
┌─────────────────────────────────────────┐
│  Data model: flat list of elements      │  (the source of truth)
│  [chunk, typed-word, break, ...]        │
├─────────────────────────────────────────┤
│  Reflow engine: positions every element │  (reads list, writes x/y/w/h)
├──────────┬──────────────────────────────┤
│  Canvas  │  DOM                         │  (two renderers, one list)
│  (chunks)│  (typed text + cursors)      │
└──────────┴──────────────────────────────┘
```

A typed word and a chunk are the same thing as far as layout is concerned. You can
delete a chunk and replace it with typed text — remove one element, insert another.
You can type between any two chunks and it just works. The list doesn't know or care
whether content is an image or text.

---

## V1 User Flow

### 1. Upload

- User uploads one or more photos/scans of handwritten pages (JPG, PNG, PDF).
- Drag-and-drop and file picker both supported.
- User selects script direction (LTR or RTL) at upload time.
- **Chunks from an upload appear at the cursor position** (or end of document if
  no cursor). The user can then move chunks anywhere using cut/paste or drag.
- The upload is essentially a paste operation — the user gets chunks and decides
  where they go. They can selectively grab chunks from a photo and ignore the rest.
- **Source layout declaration**: The user can declare the layout of the uploaded
  photo — single column (default), multi-column (specify count), table, etc.
  This tells the segmentation step how to order the chunks. The output is always
  the same flat list regardless of source layout. The layout declaration is metadata
  on the chunks (provenance), not a structural element in the document.
- **Footnote placement**: The user can exclude certain chunks from an upload and
  place them in the footnote zone manually (for handwritten footnotes in margins).

### 2. Segmentation

The app processes each uploaded image to produce a sequence of chunks. This runs
in Rust/WASM.

**Step 1 — Binarize**: Convert the image to black-and-white using adaptive thresholding
(Otsu's method or adaptive Gaussian). This handles uneven lighting and produces a
binary image where ink is black and paper is white.

**Step 2 — Connected-component analysis**: Find all connected regions of black pixels.
Each connected region is a "blob." Use a union-find (disjoint set) algorithm for
效率. Output: a list of blobs, each with a bounding box and pixel mask.

**Step 3 — Filter noise**: Remove blobs that are too small (area < threshold, e.g.
5 pixels — likely dust) or too large (area > threshold, e.g. 50% of the image —
likely a border or shadow).

**Step 4 — Group blobs into word-level chunks**: For each pair of horizontally
adjacent blobs, compute the horizontal gap between their bounding boxes. If the
gap is less than the median blob width × 1.5 (a heuristic for "same word"),
merge them into the same chunk. This uses a union-find: start with each blob as
its own set, merge pairs that are close enough.

**Step 5 — Detect lines**: Sort chunks by vertical center. Group chunks whose
vertical centers are within the median chunk height × 0.5 of each other into
the same line. Large vertical gaps (> median chunk height × 2) indicate line
breaks.

**Step 6 — Order chunks within lines**: For LTR, sort chunks on each line by
left edge (ascending). For RTL, sort by right edge (descending). For
multi-column layouts, the user has declared columns — sort by column first,
then by reading order within each column.

**Step 7 — Punctuation**: Run the proximity-filtered micro-OCR (or height-band
capture, per user setting). Small blobs near word chunks are classified and
attached. Remaining small blobs are discarded.

**Step 8 — Output**: Produce the ordered list of chunk elements with bounding
boxes and source image references.

**No nikud/diacritics handling in V1** — these may detach from words during
segmentation. Deferred to a later version.

**Punctuation handling** — two approaches:

*Approach A (preferred): Proximity-filtered micro-OCR.*
Small blobs (below a height threshold relative to the line) are considered candidates
for punctuation ONLY if they are within a proximity threshold of a word chunk (e.g.,
within ~1 character width horizontally, or vertically aligned with the word's
baseline/x-height). Candidates that are far from any word are treated as noise.
For nearby candidates, a simple template-matching or feature-based classifier answers:
"is this a period, comma, question mark, exclamation mark, colon, semicolon, or
quotation mark?" The shape set is tiny and distinct — no neural network needed.
- If a match is found → the blob is attached to the nearest word chunk (merged into
  that chunk's image crop). The chunk becomes `ran.` or `fast!` as a single unit.
- If no match → treated as noise and discarded. The user can recover it by drawing
  a box if needed.
- This avoids detached punctuation fragments and avoids capturing dust/smudges.

*Approach B: Height-band capture.*
Keep all blobs that sit at roughly the same vertical position as the word chunks on
the same line (within the x-height band of the line). This captures everything that
"looks like it belongs" — punctuation, diacritics, stray marks. The downside is it
also captures ink smudges, dust, and paper artifacts. The upside is it's simpler to
implement and catches edge cases the template matcher might miss. The user cleans up
noise in the document view using backspace or draw-a-box.

Each chunk is cropped from the original image and stored as an opaque image patch
with a bounding box and position metadata.

**Manual chunk override**: The user can draw a rectangle on the image to define a
chunk. Everything inside the rectangle becomes one chunk; everything outside is
excluded or re-segmented. This single gesture handles:
- **Merge**: draw around two small chunks → they become one
- **Split**: draw around part of one chunk → that part becomes a new chunk
- **Erase**: draw around something to remove it from the document

The draw-a-box tool is available inline in the document view — no view switching.
The user can zoom and scroll freely while using it.

**Output**: a sequence of chunks, each with:
- `imageCrop`: the image data (or coordinates into the source image)
- `boundingBox`: original x, y, width, height
- `lineIndex`: which line it belongs to
- `positionOnLine`: its order within the line

### 3. Document View — Desktop Word Processor UX

The interface is modeled on Word / LibreOffice — not a mobile app:

- **Window-filling document canvas** with a toolbar at the top.
- **Toolbar**: Bold, Italic, Underline, Bullet List, Numbered List, Paragraph Break,
  Footnote, Draw Chunk tool, Zoom slider.
- **Standard cursor**: click between chunks or typed text to place it. Arrow keys to
  move. Shift+arrows to select. Ctrl+C/X/V for copy/cut/paste.
- **Mouse interaction**: click to place cursor between chunks or within typed text.
  Click-drag across chunks to highlight a range (like selecting text in Word).
  No "select a chunk" as an object — chunks are content, not manipulable items.
- **Zoom/scroll**: standard scroll wheel, Ctrl+scroll to zoom, trackpad pinch-to-zoom.
  The user can zoom and scroll freely, including while in Draw Chunk mode.
- **Rulers and margins**: visible at the top and left of the document, showing the
  printable area.

#### The Flat List

The document is a single ordered list of elements. No pages, no 2D grid. Just a list.
Each element has a type, width, height, and position:

```
[chunk "The"] [chunk "dog"] [chunk "ran."] [typed "however"] [chunk "it"] ...
  [paragraph-break] [chunk "The"] [chunk "cat"] ...
```

Element types and their fields:

```typescript
// A word from the uploaded handwriting image
type ChunkElement = {
  kind: 'chunk'
  id: string                    // unique identifier
  sourceImageId: string         // which uploaded photo this came from
  boundingBox: { x: number; y: number; w: number; h: number }  // in source image pixels
  // Layout (computed by reflow engine)
  x: number; y: number         // position in document (mm)
  width: number; height: number // size in document (mm)
}

// A word typed by the user
type TypedWordElement = {
  kind: 'typed-word'
  id: string
  text: string                  // the typed text
  fontFamily: string            // e.g. 'serif', 'sans-serif'
  fontSize: number              // in mm
  bold: boolean
  italic: boolean
  underline: boolean
  // Layout (computed by reflow engine)
  x: number; y: number
  width: number; height: number
}

// Forces a new line (like Enter in Word)
type LineBreakElement = {
  kind: 'line-break'
  id: string
  x: number; y: number
  width: 0; height: 0
}

// Forces a new paragraph with extra spacing (like Shift+Enter in Word)
type ParagraphBreakElement = {
  kind: 'paragraph-break'
  id: string
  x: number; y: number
  width: 0; height: 0
}

// Superscript reference in body, linking to footnote content
type FootnoteRefElement = {
  kind: 'footnote-ref'
  id: string
  footnoteId: string            // links to a footnote entry in the footnote list
  number: number                // the displayed superscript number
  // Layout
  x: number; y: number
  width: number; height: number // sized to the superscript text
}

// Bullet character at the start of a paragraph
type BulletElement = {
  kind: 'bullet'
  id: string
  indentLevel: number           // 0 = first level, 1 = second level, etc.
  // Layout
  x: number; y: number
  width: number; height: number
}

type DocumentElement = ChunkElement | TypedWordElement | LineBreakElement
                      | ParagraphBreakElement | FootnoteRefElement | BulletElement
```

Footnote content is stored in a separate list per page viewport:

```typescript
type FootnoteEntry = {
  id: string                    // matches FootnoteRefElement.footnoteId
  elements: DocumentElement[]   // the footnote's own flat list (usually typed words)
}
```

The footnote zone renders footnote entries in order. If entries overflow the
footnote zone, they spill onto the next page's footnote zone.

Every editing operation modifies the main element list (insert, delete, reorder)
and then reflows.

#### Page Zones

Pages are user-configured viewports over the infinite document flow. Each page has
three zones:

```
┌──────────────────────────┐
│                          │
│     Body area            │  (chunks + typed text flow here)
│     (user-configurable)  │
│                          │
│                          │
├──────────────────────────┤
│     Footnote area        │  (footnote content rendered here)
│     (user-configurable)  │
└──────────────────────────┘
```

- **Page width**: affects line wrapping. Set to A4 (210mm) or Letter (216mm) width,
  or arbitrary. Changing width triggers a full reflow.
- **Body height**: the vertical space where body content flows.
- **Footnote height**: reserved at the bottom of each page for footnotes.
- Page break lines are drawn between pages. Content flows seamlessly across them —
  pages are viewports, not containers.
- **Footnotes that overflow the footnote area spill onto the next page's footnote
  area.** The user can adjust the footnote zone height if needed.

**Sidenotes** (optional, same model):
- A reserved area on the right margin where side-notes are rendered.
- Body text wraps to avoid the sidenote area.
- Sidenotes are anchored to the chunk they reference and positioned vertically
  alongside it.

#### Rendering — Two Layers, One Document

- **Canvas layer** (bottom): renders chunk images at their calculated positions.
- **DOM layer** (top): renders typed text as selectable/editable text nodes, positioned
  to align with the canvas layout. Also contains invisible anchor elements at each
  chunk position so the browser cursor can be placed between chunks.
- Both layers read from the same flat element list with the same (x, y, w, h) for
  every element. The user sees one seamless document.

### 4. Cursor Behavior

The cursor is a blinking caret that sits between two elements in the flat list.
It represents the insertion point for typed text.

**Cursor movement**:
- **Left/Right arrow**: In typed text, moves character-by-character. At a chunk
  boundary, jumps to the other side of the chunk (one chunk = one "character" for
  navigation purposes). At a line break, moves to the end of the previous line
  (left) or start of next line (right).
- **Up/Down arrow**: Moves to the nearest x-position on the line above/below.
  If the target line is shorter, snaps to the end of that line.
- **Home**: Moves to the start of the current line.
- **End**: Moves to the end of the current line.
- **Ctrl+Home**: Moves to the start of the document.
- **Ctrl+End**: Moves to the end of the document.

**Selection**:
- **Shift+arrow**: Extends selection by one character (typed text) or one chunk.
- **Shift+click**: Extends selection from cursor to click position.
- **Ctrl+A**: Selects all elements in the document.

**Visual appearance**: The cursor is a thin vertical line (like Word). When between
two chunks, it appears in the gap. When within typed text, it appears between
characters. Selected ranges are highlighted with a blue background (like Word).

### 5. Editing Operations

All editing is cursor-based, like Word/LibreOffice. The user places a cursor
(insertion point) and operates from there. There is no "select a chunk as an object"
mode in V1.

| Operation | How it works |
|-----------|-------------|
| **Insert typed text** | Place cursor between two chunks (or at start/end). Type. |
| **Insert space** | Press Space at the cursor — inserts a space. |
| **Insert line break** | Press Enter — creates a new line. Subsequent chunks reflow. |
| **Insert paragraph break** | Press Shift+Enter or toolbar button — new paragraph (extra spacing). |
| **Insert bullet/list item** | Place cursor on a line, click "Bullet" in toolbar — bullet prepended, paragraph indented. |
| **Delete chunk** | Place cursor next to chunk, press Backspace/Delete — chunk removed, reflow. |
| **Merge chunks** | Draw a box around two or more adjacent chunks — they become one chunk. |
| **Split chunk** | Draw a box around part of a chunk — that part becomes a new chunk. |
| **Add footnote** | Place cursor after a chunk, click "Footnote" — superscript number added to body, footnote content rendered in the footnote zone. Overflow spills to next page. |
| **Range selection** | Click-drag to highlight across chunks and/or typed text. Then type to replace, or press Delete to remove the range. |
| **Undo/Redo** | Full undo/redo stack (Ctrl+Z / Ctrl+Shift+Z). |

### 6. Reflow Engine

The reflow engine takes the flat element list and computes (x, y, width, height) for
every element. It is the single source of truth for layout.

**Algorithm** (pseudocode):
```
cursor_x = margin_left
cursor_y = 0
line_height = 0

for element in document:
    if element is paragraph_break:
        cursor_x = margin_left
        cursor_y += paragraph_spacing
        line_height = 0
        continue
    if element is line_break:
        cursor_x = margin_left
        cursor_y += line_height
        line_height = 0
        continue
    if cursor_x + element.width > page_width:
        cursor_x = margin_left
        cursor_y += line_height
        line_height = 0
    element.x = cursor_x
    element.y = cursor_y
    cursor_x += element.width
    line_height = max(line_height, element.height)
```

This is O(n) — iterate once, place every element. Even with 5,000 elements, this
takes microseconds.

**Dirty-region optimization**: Only reflow forward from the edit point. Elements
before the edit are unaffected. Propagate forward until layout stabilizes (line
breaks may cascade). This is how Word/LibreOffice work internally.

**User-facing reflow tip**: The app can suggest: "Insert a line break before making
changes, do your edits, then remove the line break." This limits reflow scope,
reducing cascading.

**Paragraph break threshold**: The user can configure how much vertical whitespace
constitutes a paragraph break (default: 2× normal line spacing).

### 7. Draw-a-Box Tool

The draw-a-box tool lets the user redefine chunks by drawing a rectangle on the
document. It is always available (toolbar button or keyboard shortcut) and works
inline without switching views.

**Activation**: Click the "Draw Chunk" button in the toolbar, or press Ctrl+D.
The cursor changes to crosshairs. The user can still zoom and scroll.

**Drawing**: Click and drag to draw a rectangle. A semi-transparent blue overlay
shows the rectangle during drawing (rubber-band style). On mouse release:

- **Empty area inside the box**: Creates a new chunk from that region of the source
  image. The new chunk is inserted into the flat list at the nearest cursor position
  or at the position of the nearest existing chunk.
- **Existing chunks inside the box**: All chunks fully or partially inside the box
  are merged into one new chunk. The new chunk's bounding box is the drawn rectangle.
  The merged chunks are removed from the list and replaced by the new one.
- **Part of a chunk inside the box**: The chunk is split. The part inside the box
  becomes a new chunk; the part outside remains as a separate chunk.
- **Nothing inside the box (on the source image)**: The box region is treated as
  an erase — any overlapping chunks are removed.

**Exit**: Press Escape or click the toolbar button again to exit draw mode.
Cursor returns to normal.

**Source image access**: The draw-a-box tool needs access to the original uploaded
image to crop new chunks. Each chunk stores a `sourceImageId` linking to the
original. The canvas layer can display the source image at reduced opacity behind
the chunks when in draw mode, so the user can see what they're drawing over.

### 8. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy selected range to clipboard |
| Ctrl+X | Cut selected range |
| Ctrl+V | Paste at cursor |
| Ctrl+A | Select all |
| Ctrl+D | Toggle draw-a-box mode |
| Ctrl+B | Bold (typed text) |
| Ctrl+I | Italic (typed text) |
| Ctrl+U | Underline (typed text) |
| Delete | Delete element after cursor |
| Backspace | Delete element before cursor |
| Enter | Insert line break |
| Shift+Enter | Insert paragraph break |
| Space | Insert typed space |
| Left/Right arrow | Move cursor by character (typed) or chunk |
| Up/Down arrow | Move cursor to line above/below |
| Home | Start of current line |
| End | End of current line |
| Ctrl+Home | Start of document |
| Ctrl+End | End of document |
| Escape | Exit draw-a-box mode |

### 9. First Launch / Empty State

When the user first opens the app (or creates a new document):

- Show a blank document with a toolbar at the top.
- A centered prompt: "Drop a photo of handwriting here, or click Upload."
- The upload dialog asks for: file(s), script direction (LTR/RTL), source layout
  (single column / multi-column / table).
- After upload and segmentation, chunks appear in the document.
- If the document is empty, the cursor is at position 0 (start of document).

### 10. Storage (IndexedDB)

V1 is local-only. Documents are stored in IndexedDB.

**Schema**:

```
Object Store: documents
  key: documentId
  value: {
    id: string
    name: string
    createdAt: number
    updatedAt: number
    settings: {
      pageWidthMm: number        // default 210 (A4)
      bodyHeightMm: number       // default 240
      footnoteHeightMm: number   // default 40
      direction: 'ltr' | 'rtl'
      defaultFontFamily: string
      defaultFontSize: number
    }
    elements: DocumentElement[]  // the flat list, serialized
    footnotes: FootnoteEntry[]   // footnote content
  }

Object Store: images
  key: imageId
  value: Blob                    // the original uploaded image

Object Store: chunkCrops
  key: chunkId
  value: Blob                    // the cropped chunk image (generated during segmentation)
```

**Loading**: On document open, load the element list and settings from `documents`.
Load chunk crop images from `chunkCrops` as needed for rendering (lazy loading
for large documents). Source images from `images` are loaded only when the
user activates draw-a-box mode.

### 11. Export

- Export as **PDF**: Use `pdf-lib` (Rust WASM or JS). Render each page viewport:
  draw chunk images at their positions, render typed text as vector text, draw
  footnote content in the footnote zone, draw page break lines. Footnotes that
  overflow spill to the next page's footnote zone.
- Export as **JSON manifest + crop images**: The element list serialized as JSON,
  chunk crop images as separate files, source images included. For
  interoperability / re-import.

---

## Technical Decisions

### Why No OCR

OCR is a solved problem, but it's the wrong abstraction here. We don't want to convert
handwriting to text — we want to preserve the handwriting as-is and add document
structure around it. Segmentation (finding word blobs) is a much simpler and more
reliable operation than recognition (reading the letters). It also works for **every
language and script** without any model training.

### Tech Stack

- **UI layer**: TypeScript + React — DOM interaction, rendering, user events
- **Computation layer**: Rust compiled to WebAssembly (via wasm-pack/wasm-bindgen)
  - Reflow engine: layout math, dirty-region propagation, line-breaking
  - Segmentation: image binarization, connected-component analysis, chunk grouping
  - Micro-OCR: template matching for punctuation classification
  - Undo/redo: command stack with inverse operations
- **Image processing**: Rust `image` + `imageproc` crates (runs in WASM, no OpenCV.js)
- **Rendering**: Canvas layer for chunk images, DOM layer for typed text. Both read
  from the same flat element list. Invisible to the user.
- **Storage**: Browser IndexedDB for local documents (V1 is local-only, no server)
- **Desktop (future)**: Tauri (Rust-native) wraps the same web UI + WASM module

**Why Rust/WASM**: The reflow engine's layout math is fast in any language (O(n)
iteration). The real CPU work is **image segmentation** — binarization and
connected-component analysis over 20–50 megapixel photos. That's O(pixels) and
needs efficient memory management. Rust's `image` and `imageproc` crates handle
this well, WASM runs at near-native speed, and there's no GC pausing during the
segmentation loop. C++ via Emscripten is the only comparable alternative but has
worse tooling. Zig is interesting but its WASM ecosystem is immature.

### Coordinate System

All measurements are in millimeters. A chunk's width is its crop width in mm
(computed from the original image's DPI). A typed word's width is measured in mm
at the current font size. Page width is set in mm (210mm for A4, 216mm for Letter).
Everything is in the same unit.

For uploads with unknown DPI: default to A4 width and let the user adjust the page
width setting. This calibrates the entire document.

### Performance Budget

- Segmentation of a full-page photo: < 1 second (WASM, with downscaling)
- Reflow after any edit: < 16ms (60fps), using dirty-region propagation
- Max document size: ~50 pages, ~5000 chunks per document
- Startup (WASM load): < 500ms on fast connection, < 2s on slow
- Memory: < 200MB for a 5000-chunk document (with eviction)

### Performance Optimizations

These are the key optimizations that make the difference between "works" and
"feels instant":

**Segmentation:**
- **Downscale before segmenting.** Reduce the source image to 2-4MP (long edge
  2000-4000px) before running binarization and connected-component analysis.
  The original high-res image is kept for chunk crops; segmentation coordinates
  are mapped back. 10-20x speedup.
- **Pre-allocate WASM working buffer.** Don't allocate/free a 40MP buffer per
  frame. Allocate once at startup, reuse for every segmentation.
- **Lazy chunk cropping.** Don't crop all chunks at upload time. Crop as they
  scroll into view. For 5000 chunks, only ~50-100 are visible at once.

**Rendering:**
- **Only render visible chunks.** Use reflow coordinates to determine which chunks
  are in the viewport. Skip off-screen chunks entirely.
- **Offscreen canvas cache per chunk.** Pre-render each visible chunk to its own
  small offscreen canvas at the current zoom level. Subsequent frames draw from
  the cached offscreen canvas (GPU-cached) instead of re-decoding PNGs.
- **Virtualize the DOM.** Only create DOM nodes for visible elements. Off-screen
  elements are data in the list only. Create/destroy nodes as elements enter/leave
  the viewport. Standard virtual scroll pattern.
- **RequestAnimationFrame batching.** Batch reflow + re-render into a single rAF
  callback. Multiple rapid keystrokes only trigger one render per frame.
- **Never read DOM layout in a loop.** Don't call `getBoundingClientRect()` or
  `offsetWidth` in a loop. Compute all positions in WASM, only write to DOM.

**Storage:**
- **Batch IndexedDB writes.** Write all chunk crops in a single transaction, not
  one at a time. 5-10x faster.
- **Incremental saves.** Don't re-save the entire document on every edit. Save the
  full document on first load, then append edit operations to a journal. Compact
  periodically.
- **JPEG for chunk crops.** JPEG at quality 85-90 is visually identical for
  handwriting and 3-5x smaller than PNG. Reduces storage and memory.

**Startup:**
- **Split WASM modules.** Load the reflow engine (small, needed immediately) first.
  Load the segmentation engine (large, needed only on upload) lazily.
- **Service worker caching.** After first load, cache WASM modules in a service
  worker. Subsequent loads are instant from disk cache.

**Memory:**
- **LOD (Level of Detail).** Store chunk images at multiple resolutions: full-res
  for export, medium-res for screen, thumbnail for overview. Use the appropriate
  one based on zoom level.
- **Evict off-screen chunks.** Release `ImageBitmap` from memory when chunks scroll
  off-screen. Re-load from IndexedDB when they scroll back in. Keeps only visible
  chunks in RAM.

**What would make it slow:**
- No downscaling — segmenting 40MP in WASM = 2-3 seconds
- Rendering all chunks every frame — 5000 drawImage calls = janky
- Full document save on every edit — IndexedDB thrashing
- PNG crops at full resolution — 500MB RAM for 5000 chunks
- One WASM module for everything — slow initial load
- Reading DOM layout in a loop — layout thrashing kills framerate

---

## Non-Goals for V1

- No OCR / handwriting recognition
- No handwriting input on screen (that's V2)
- No cloud sync or collaboration
- No sharing / export to .docx
- No search (can't search image chunks without OCR)
- No auto-correction or suggestions
- No mobile-optimized layout (desktop web first)
- No nikud / diacritics handling

---

## Decisions Made

1. **One infinite document**: Not separate pages. Content flows continuously.
   Page width and height are user settings that define viewports and zone boundaries.
2. **Script direction**: User-selected LTR or RTL at upload time.
3. **Diacritics/nikud**: Not supported in V1. Deferred.
4. **Punctuation**: Proximity-filtered micro-OCR (preferred). Small blobs near a word
   are classified via template matching and attached to the word. Far-away blobs are
   noise. Alternative: height-band capture (keep all blobs in the word's vertical band,
   accept some noise).
5. **Interaction model**: Purely cursor-based, like Word. No "select a chunk as an
   object." Click to place cursor, click-drag to range-select, type to insert,
   backspace to delete. Draw-a-box for chunk merge/split/override.
6. **Draw-a-box**: Available inline in document view. No view switching. User can
   zoom and scroll freely while using it.
7. **Paragraph breaks**: Configurable whitespace threshold (default 2× line height).
8. **Undo history**: Stored as a list of changes (command pattern). Reverting is
   O(1) per change — just replay the inverse.
9. **Typed text mixing**: Both typed fonts and handwritten chunk images in the
   same document. Font choice available for typed text.
10. **No confidence scoring / review screen**: Segmentation results are used directly.
    The user fixes issues as they go using the draw-a-box tool.
11. **Two-layer rendering**: Canvas for chunks, DOM for typed text. Shared layout
    coordinates. Invisible to the user.
12. **Footnotes**: Reserved zone at bottom of each page. Overflow spills to next page.
    User can configure footnote zone height.
13. **Sidenotes**: Optional reserved zone on right margin. Body wraps around it.
14. **Units**: All measurements in millimeters. DPI calibrated via page width setting.
15. **Upload model**: Chunks from an upload appear at the cursor position, not
    automatically appended. User decides where they go. Essentially a paste operation.
16. **Source layout**: User declares the layout of each upload (single column,
    multi-column, table, etc.). This affects chunk ordering during segmentation.
    Output is always the flat list. Layout is metadata, not structure.
17. **Footnote placement from source**: User can exclude chunks from an upload and
    place them in the footnote zone manually (for handwritten margin notes).

## Implementation Notes

These are the non-obvious details that a builder needs to know. The design sections
above describe *what*; these describe *how* for the tricky parts.

### Rendering Sync — How the Two Layers Stay Aligned

The canvas layer draws chunk images. The DOM layer has typed text and invisible
anchor elements for cursor placement. Both must agree on positions exactly.

**How it works:**

1. The reflow engine outputs a flat list of positioned elements:
   `[{id, kind, x, y, width, height}, ...]`

2. TypeScript builds the DOM from this list:
   - For each `typed-word`: create a `<span>` with `position: absolute; left: x; top: y`
     containing the text. Style with the element's font settings.
   - For each `chunk`: create an invisible `<span>` (zero-width, same height) at the
     same position. This is the cursor anchor — the browser places the caret inside
     this span.
   - For each `line-break` / `paragraph-break`: create a zero-width `<span>` at the
     current position.

3. TypeScript draws the canvas from the same list:
   - For each `chunk`: call `ctx.drawImage(cropImage, x * scale, y * scale, w * scale, h * scale)`
   - For typed words: nothing on canvas (they're on the DOM layer).

4. Both layers use the same `x, y` values from the reflow engine. The DOM uses
   `position: absolute` with `left` and `top` in pixels (converting from mm using
   a scale factor: `px = mm * (96 / 25.4)` for screen, or `px = mm * zoom * (96 / 25.4)`
   at a given zoom level).

5. On reflow, TypeScript clears and rebuilds both layers from the new positions.
   This happens inside a `requestAnimationFrame` callback to avoid visual tearing.

**The scale factor:** 1mm = 96/25.4 ≈ 3.78 pixels at 96 DPI (standard screen).
At 200% zoom, 1mm = 7.56 pixels. The reflow engine works in mm; the renderers
convert to pixels using the current zoom level.

### Cursor and Event Handling

The DOM layer is on top, so all mouse/keyboard events go to the DOM. The user
never interacts with the canvas directly.

**Click handling:**
- The DOM layer has invisible anchor spans at every chunk position.
- When the user clicks, the browser's native selection lands inside one of these
  anchors (or inside a typed-word span).
- We listen to `selectionchange` events to track where the cursor is.
- The cursor position is mapped back to an index in the flat list (which element
  is the cursor between?).

**Keyboard handling:**
- A hidden `<input>` or `contentEditable` div captures keyboard events.
- On `keydown`, we check the key and perform the appropriate action:
  - Printable characters → insert a new `typed-word` element at cursor
  - Backspace → delete the element before cursor
  - Delete → delete the element after cursor
  - Arrow keys → move cursor index in the flat list
  - Enter → insert line-break element
- The hidden input is focused whenever the user clicks in the document area.

**Selection highlighting:**
- When the user drags to select, we track the start and end indices in the flat list.
- We render a blue highlight rectangle on the canvas layer behind the selected
  elements (using their x/y/width/height from the reflow).
- This is a canvas overlay, not a DOM highlight, so it works across both chunks
  and typed text.

### Undo/Redo Data Structure

The undo stack is an array of `Edit` objects. Each edit has an `apply` and `undo`
operation.

```typescript
type Edit =
  | { type: 'insert'; index: number; element: DocumentElement }
  | { type: 'delete'; index: number; element: DocumentElement }  // stores the deleted element
  | { type: 'replace'; index: number; old: DocumentElement; new: DocumentElement }
  | { type: 'move'; fromIndex: number; toIndex: number; element: DocumentElement }

// Applying an edit:
function applyEdit(doc: DocumentElement[], edit: Edit): void {
  switch (edit.type) {
    case 'insert': doc.splice(edit.index, 0, edit.element); break;
    case 'delete': doc.splice(edit.index, 1); break;
    case 'replace': doc[edit.index] = edit.new; break;
    case 'move':
      doc.splice(edit.fromIndex, 1);
      doc.splice(edit.toIndex, 0, edit.element);
      break;
  }
}

// Undoing = apply the inverse:
function undoEdit(doc: DocumentElement[], edit: Edit): void {
  switch (edit.type) {
    case 'insert': doc.splice(edit.index, 1); break;
    case 'delete': doc.splice(edit.index, 0, edit.element); break;
    case 'replace': doc[edit.index] = edit.old; break;
    case 'move':
      doc.splice(edit.toIndex, 1);
      doc.splice(edit.fromIndex, 0, edit.element);
      break;
  }
}
```

The undo stack is capped at ~1000 entries. Redo stack is cleared on any new edit.
After applying or undoing an edit, reflow from the affected index forward.

### Chunk Crop Storage Pipeline

1. **During segmentation:** For each chunk, crop the region from the downscaled
   image (for initial display) and from the original high-res image (for export).
   Encode both as JPEG (quality 85).

2. **Store in IndexedDB:** Write the crop blobs to the `chunkCrops` object store,
   keyed by chunk ID. Batch all writes in one transaction.

3. **On document load:** Don't load all crops immediately. Load only the crops for
   chunks that are in or near the viewport. Use a viewport + 200px buffer on each
   side.

4. **On scroll:** As new chunks enter the viewport, load their crops from IndexedDB
   (async). Show a gray placeholder rectangle while loading. As chunks leave the
   viewport, release their `ImageBitmap` to free memory.

5. **Cache in memory:** Once loaded, keep a Map<string, ImageBitmap> of visible
   chunk crops. The canvas draws from this cache. On zoom change, invalidate the
   cache (the images need to be drawn at a different scale).

### WASM-JS Interface

The Rust WASM module exposes these functions to TypeScript:

```rust
// Segmentation: takes image bytes, returns chunk list
fn segment_image(
    image_bytes: &[u8],
    direction: Direction,        // LTR or RTL
    columns: Option<u32>,        // number of columns, or None for single
) -> Vec<ChunkData>;

// Reflow: takes element list + settings, returns positioned elements
fn reflow(
    elements: &[ElementData],
    page_width_mm: f64,
    paragraph_spacing_mm: f64,
    margin_left_mm: f64,
) -> Vec<PositionedElement>;

// Crop a chunk from the source image
fn crop_chunk(
    image_bytes: &[u8],
    bbox: &BoundingBox,
    format: CropFormat,          // JPEG or PNG
    quality: u8,                 // for JPEG: 0-100
) -> Vec<u8>;                    // encoded image bytes
```

TypeScript calls these via `wasm-bindgen`. The image bytes are passed as
`Uint8Array`. The Rust side allocates and returns byte arrays that TypeScript
reads and then frees.

### PDF Export Strategy

1. Calculate page boundaries: walk the positioned element list, split at every
   `y` value that crosses a page boundary (bodyHeightMm).
2. For each page, create a PDF page with the configured dimensions.
3. Draw chunk images at their positions using `pdf-image` or embedded JPEGs.
4. Draw typed text as PDF text objects at their positions, with font/size/bold/italic.
5. Draw footnote content in the footnote zone at the bottom of each page.
6. Draw page break lines between pages.
7. Output the PDF bytes for download.

Use `pdf-lib` (JavaScript) for PDF generation. It's mature, well-documented,
and handles image embedding and text rendering.

---

## Remaining Open Questions

(None — all design decisions resolved.)
