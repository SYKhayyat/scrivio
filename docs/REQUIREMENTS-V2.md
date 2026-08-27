# Scrivio — V2+ Roadmap

> Future features and capabilities beyond the MVP. Organized by rough priority,
> not strict version numbering.

---

## Phase 2: Handwriting Input

The natural extension — let users write directly on screen.

### On-Canvas Handwriting

- Full-screen canvas for stylus/touch input.
- Strokes are captured as vector paths (points with timestamps and pressure).
- On lift (pen up), strokes are segmented into chunks using the same space-detection
  algorithm as the upload flow.
- New chunks are appended to the document at the cursor position or end of document.
- **Latency target**: < 10ms from stylus contact to ink appearing on screen.

### Mixed-Mode Editing

- Typed text and handwritten chunks interleave in the same document.
- User can switch between typing mode and drawing mode (toggle button or keyboard shortcut).
- Handwritten chunks are still treated as opaque images — even the ones you just drew.

### Stamp and Sketch

- Users can draw small sketches (diagrams, arrows, annotations) as non-chunk elements
  that float in the document alongside chunks and text.

---

## Phase 3: Better Input Processing

### Camera Capture (Mobile/Tablet)

- Use device camera to photograph handwritten pages.
- Live edge detection to guide the user into framing the page.
- Auto-perspective correction and cropping.
- Then feed into the same segmentation pipeline as upload.
- Chunks appear at cursor position, same as file upload.

### Improved Segmentation

- Handle handwriting that is very close together (aggressive kerning).
- Better handling of erasures and cross-outs.
- Support for non-standard writing surfaces (whiteboards, sticky notes, margins).

---

## Phase 4: Advanced Editing

### Semantic Chunk Operations

- **Highlight**: Apply a color highlight behind a chunk (like a highlighter pen).
- **Annotation**: Attach a typed note to a chunk (visible as a small indicator, expandable on hover/click).
- **Reorder**: Drag chunks to reorder them within or across lines.
- **Group**: Mark a group of chunks as belonging together (for list items, quoted text, etc.).

### Table Support

- Create a grid layout where chunks (and typed text) can be placed in cells.
- Useful for structured handwritten content (forms, ledgers, data tables).

### Comment Threads

- Attach threaded comments to specific chunks or ranges.
- Useful for review workflows (teacher grading, editor feedback).

---

## Phase 5: Recognition (Optional, User-Triggered)

> Note: This is intentionally optional and user-triggered, not automatic.

### On-Demand OCR

- User selects a chunk or range of chunks and clicks "Read this."
- The app sends the chunk images to an OCR service (or runs a local model).
- The recognized text appears as a tooltip, side panel, or converted typed text.
- **The user chooses whether to replace the image with text** — this is always opt-in.

### Searchable Documents

- Once chunks have been OCR'd (with user consent), the document becomes searchable.
- Search highlights the relevant chunks (by border or background).

### Translation

- Similar to OCR — user selects chunks, app translates and shows the typed translation
  alongside or below the handwritten original.

---

## Phase 6: Collaboration and Cloud

### Cloud Storage and Sync

- Account system with cloud document storage.
- Sync across devices (desktop ↔ tablet ↔ phone).
- Offline-first with conflict resolution on reconnection.

### Sharing

- Share a document with view-only or edit access.
- Shared documents show chunk images + typed additions.
- Comment-only sharing for review workflows.

### Real-Time Collaboration

- Multiple users editing the same document.
- Each user sees others' cursors and edits in real time.
- Chunks are immutable (they're images), so conflicts are limited to typed text
  and structural edits (insert/delete chunks, reflow).

---

## Phase 7: Platform Expansion

### Desktop App (Electron/Tauri)

- Offline-first desktop application.
- Native file system integration (open/save directly to disk).
- Better performance for large documents.

### Mobile App (React Native / Capacitor)

- Native tablet app with optimized stylus support.
- Camera capture as a first-class workflow.
- Push notifications for shared document activity.

### Browser Extension

- Capture handwritten content from web pages or emails.
- Quick-edit chunks without opening the full app.

---

## Longer-Term Ideas

### Handwriting Style Analysis

- Analyze the visual properties of a user's handwriting (size, slant, spacing)
  without reading the content.
- Offer to "clean up" chunk segmentation based on learned patterns.

### Template Documents

- Pre-made document layouts (lined paper, grid paper, forms) that provide
  visual structure alongside the chunks.

### Version History

- Full document history with visual diffs (show which chunks were added/removed/moved).
- Branch/fork documents for different versions.

### AI-Assisted Layout

- Suggest paragraph breaks based on spacing patterns.
- Auto-format lists when the app detects a pattern of repeated chunks.
- Suggest where to add footnotes based on content structure.
