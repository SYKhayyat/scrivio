# Scrivio Lite — Requirements

A word processor that starts with photos of handwriting. Words are lifted off
the page as opaque image chunks — never recognized, never retyped.
**No OCR. No transcription. Just your handwriting, structured.**

## Purpose

Handwritten notes are stuck on paper. OCR destroys authorship; the goal is not
to read the handwriting but to edit around it. A chunk is a cropped image of
one handwritten word. Chunks and typed text live in the same document: type
between chunks, delete them, add a missed word by drawing a box, make lists
out of chunks, attach footnotes to chunks.

## Scope

**In:** photo upload (single or batch, JPG/PNG, more photos may be added to
the document at any time); LTR/RTL; word-level segmentation of each photo; a
document made of pages — one page per imported photo — of chunks and typed
text; editing (type between chunks, delete chunks, new lines); lists made from
chunks; typed footnotes attached to chunks; draw-a-box to add a missed word;
source-photo panel with detected boxes; export to a single self-contained
HTML file and to a native PDF file; responsive at 100 pages.

**Out (permanent, stated in the README — not a backlog):** OCR or any
recognition of handwriting text; nikud/diacritics; fixed page layout
customization, columns; persistent storage or accounts; mobile layout.

## Functional requirements

1. User uploads one or more handwriting photos and chooses direction once per
   upload, applying to all photos in it.
2. The app segments each photo into word chunks and shows them as images in a
   document the user can edit: insert typed text between chunks, delete
   chunks, start new lines. Each imported photo defines a page. Pages do not
   re-flow automatically — content stays on its page unless the user moves
   it. New photos can be added at any time and append as new pages.
3. The user can mark a run of chunks as a list (bulleted or numbered) and
   continue the list with typed text. A list item is a line that may mix
   chunks and typed text.
4. The user can attach a typed footnote to a chunk. A superscript marker
   appears next to the referenced chunk; the footnote text renders in a
   footnote area at the bottom of that chunk's page. Numbers restart at 1 on
   each page, in order of attachment.
5. Detected boxes are shown on the source photo; the user can draw a rectangle
   over a missed word and it becomes a chunk in the document, inserted at the
   cursor if the cursor is on that page, otherwise at the end of that page.
   The source panel shows the photo of the page the user is currently on.
6. When segmentation finds nothing usable on a photo, the app says so in
   plain words rather than failing silently.
7. Export produces two formats: one self-contained HTML file (chunk images
   embedded, opens offline in any browser) and a real .pdf file download (not
   the browser's print dialog). Both contain the full document — chunks, typed
   text, lists, and footnotes — and view correctly with no network.
8. A batch upload shows progress and never freezes the interface.

## Non-functional requirements

- **Scale:** a 100-page document (~3,000+ chunks) must keep typing and
  scrolling responsive: keystrokes appear with no perceptible delay, and
  scrolling never freezes the tab. The app ships a built-in stress route
  (`?stress=N`) that generates N synthetic pages through the same
  segmentation pipeline as real photos, so this is reproducible in one click.
- **Speed:** chunks from a ~2MP photo appear within 3 seconds of selection.
- **Photo quality bar:** well-lit handwriting on white paper (phone photo
  acceptable). Dark scans, heavy shading, tight cursive, and multi-column
  layouts are explicitly not required to work.
- **Rebuildability:** a judge on a clean machine follows the README: install,
  run the single documented test command with no network — all tests pass;
  a production build succeeds; the whole project rebuilds in Docker offline.
- **Dependencies:** no secrets, no configuration, no machine-specific paths;
  lockfile committed; toolchain version pinned.

## Acceptance (what a judge can do)

1. Install, run the documented test command (offline), and build — all succeed.
2. Drop in a photo → chunks appear, boxes show on the source panel.
3. Type between chunks; delete a chunk; draw a box around a missed word.
4. Turn three chunks into a bulleted list; attach a footnote to a chunk and
   see a marker next to the chunk and the numbered footnote at the bottom of
   that page.
5. Export HTML and PDF; open both with no network; both show the full
   document, lists and footnotes included.
6. `?stress=100`: type and scroll a 100-page document without lag.
