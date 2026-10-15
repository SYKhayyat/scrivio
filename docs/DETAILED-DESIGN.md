# Scrivio Lite — Detailed Design

> Implementation specification for the rewrite described in [`DESIGN.md`](./DESIGN.md).
> Read that first: it says *what* and *why*. This says *how*, down to the exact
> signature of every module, the algorithm each one implements, and the test
> that proves it.
>
> **Status:** accepted. **Method:** TDD. **Scope:** everything in `DESIGN.md`.

---

## 0. How to use this document

Three rules govern everything below.

1. **Every module has a "Done when" list, and that list is its test file.** The
   tests are written first and watched fail. A module is not started until the
   previous module's list is green.
2. **Signature changes are design changes.** If an implementation wants a
   different signature than the one written here, that is a change to this
   document, not a detail discovered during implementation.
3. **Nothing may be implemented that no test names.** A module with no
   "Done when" list does not exist yet.

Where this document contradicts `DESIGN.md`, `DESIGN.md` wins and this document
is wrong — except for the deviations recorded in §14, which were agreed
explicitly.

### 0.1 Build order at a glance

```
M0 scaffold ──► M1 domain+ports ──► M2 segmentation ──► M3 platform+workers
     │                                        │
     │                                        └────► (M2 gate: real fixtures pass)
     ▼
M4 editor ──► M5 source panel ──► M6 footnotes ──► M7 pagination+HTML
                                                        │
                                                        ▼
                                                  M8 PDF+bidi ──► M9 stress
                                                                        │
                                                                        ▼
                                                                  M10 e2e ──► M11 docs
```

M0–M2 are the risk-bearing part. M7–M9 are the largest amount of code. Full
milestone definitions, including what to cut if time runs short, are in §11.

---

## 1. Elaborations

`DESIGN.md` makes fifteen decisions. Building them surfaces twenty smaller
ones that also have to be decided once, here, rather than per-implementation.
Each is a decision, not a preference.

| # | Question | Decision | Why |
|---|----------|----------|-----|
| E1 | How does `pdf-lib` embed the Hebrew font? | `subset: false`. The full static instance is embedded (~180 KB). | `DESIGN.md` §8.4 names pdf-lib #688 (subset fonts rendering as blank boxes) as a named risk. Not subsetting removes the entire failure class rather than reducing its probability. 180 KB in a PDF file is invisible; blank glyphs are the most visible failure this app has. |
| E2 | Which font draws Latin runs in a PDF? | Per visual bidi segment: any character above `U+024F` uses the embedded Hebrew font, otherwise pdf-lib's standard `Helvetica`. | Keeps a single PDF font story for Hebrew without depending on whether Noto Sans Hebrew happens to carry Latin coverage. A bidi segment is homogeneous in direction, so one font per segment is sufficient. |
| E3 | Page margins | 20 mm on all sides; the export dialog can change them. | One number, stated, not derived from anything. |
| E4 | Type sizes | Body 11 pt, footnote 9 pt, line height 1.45. Footnote separator rule at 0.4 pt. | A4 at 20 mm margins holds ~40 lines at 11 pt/1.45, which is the expected density of a photographed note page. |
| E5 | Chunk-scale granularity: per photo or per document? | **Per source photo.** The median is taken within one photo; the clamp band is shared and absolute. | `DESIGN.md` §8.2 assumes a document-wide scale, which is only correct if every photo has the same pixel width. A 1056 px scan and a 3264 px photo differ 3×, and a document-wide median lets the high-resolution photos dictate the scale for the low-resolution ones. Per-photo normalisation is a strict generalisation: when all photos share a width it reduces to exactly the document-wide scale. It still satisfies D12 — genuine size variation *within* a photo is preserved. |
| E6 | Extra geometry on the chunk node | `inkOffsetY`, `boxW`, `boxH` alongside `inkW`/`inkH`. | The crop is padded, so the image box is not the ink box. Without the offset the baseline alignment in `DESIGN.md` §6.2 cannot be computed from the node alone, and every consumer would re-derive the padding constant. |
| E7 | Crop padding | `padX = 0.06 × inkW`, `padY = 0.04 × inkH`, minimum 2 px, clamped to photo bounds. JPEG quality 0.82. | Enough padding that antialiasing at the ink edge is not clipped; little enough that the box stays close to the ink. Quality 0.82 is the knee of the size/artefact curve for a small high-contrast crop, and is set once at import (§9.2 relies on never re-encoding). |
| E8 | Downscale target | Long edge 2400 px, bilinear, never upscaling. | As `DESIGN.md` §7.1. Restated because it is a constant that will otherwise be guessed. |
| E9 | Working threshold constants | A single exported frozen object, `engine/segmentation/thresholds.ts`. Every magic number in segmentation lives there. | `DESIGN.md` §7.3 requires this; naming the file removes the argument. |
| E10 | Playwright | Retained as `npm run e2e`. **Excluded from `npm test` and from the Docker image's command.** `@playwright/test` is an ordinary devDependency; browsers are only downloaded by `npx playwright install`. | Deviation from D10, agreed: acceptance items 2–6 keep automated coverage, and the offline single-command rebuild is untouched because the Docker `CMD` never invokes Playwright. |
| E11 | Playwright browsers | Chromium only. | One browser, one download. |
| E12 | Blob store lifetime | Explicit `release()`, called when a document is replaced or the tab closes. Object URLs revoked. | No persistence (D6), so there is no eviction policy to get wrong — but there is a leak to prevent, and `beforeunload` is the wrong place to do it. |
| E13 | PDF export runs in the same worker as HTML export, or its own? | Its own worker (`pdf-export.worker.ts`), as `DESIGN.md` §5.2 says. HTML export stays on the main thread but yields between chunks. | HTML assembly is string building; the expensive part is base64 of already-encoded JPEGs, which is fast. Making it a worker too would mean transferring ~25 MB twice for no gain. |
| E14 | What happens when a chunk in the document has no bytes? | It renders as a labelled placeholder box and the export reports the chunk id in plain words and fails. | G6. Silent blank is the failure mode this design exists to prevent, and paste can legitimately produce a chunk whose id is not in the store (E19). |
| E15 | Block direction command | `setBlockDirection` reverses the order of chunk nodes inside the target block when the direction changes, and never touches text nodes. | The invariant in `DESIGN.md` §6.5, made into a command with a test rather than an intention. Text node order must not move, or the typed sentence inverts. |
| E16 | Overflow | A single line that cannot fit on an empty page is drawn anyway and the page is flagged `overflow: true`; the export dialog reports the page number before the download. | Clipping silently is forbidden by G6. Blocking the export is worse — the user can still get the document. |
| E17 | Lists | Three commands: `wrapInBulletList`, `wrapInOrderedList`, `liftOutOfList`. No nesting. | SRS FR3 asks for flat lists. Nesting is a schema and export change with no requirement behind it. |
| E18 | Footnote marker rendering | Inline `<sup>` widget decoration, number recomputed from the document on every change. Footnote text lives in plugin state, not in the document. | `DESIGN.md` §6.3. The consequence to hold onto: a footnote is not portable by copy/paste, and that is accepted — a pasted footnote ref without an entry renders as a plain superscript with no number, per E14's sibling rule. |
| E19 | Paste of a chunk | `parseDOM` matches `data-chunk-id`. If the store has no bytes for that id, the node is kept and rendered as a placeholder. | Never drop user data on paste. The alternative — rejecting the paste — loses more than it protects. |
| E20 | ESLint | Not included. `npm run typecheck` (`tsc --noEmit`, `strict`) is the static gate. | One more toolchain in the offline rebuild for a codebase this size buys little. TypeScript's strict mode catches the class of error that matters here. |

### 1.1 Things this document deliberately does not specify

Visual design (colours, spacing, iconography), the exact stress-route
benchmark thresholds (§11.7 gives the procedure, not the pass marks), and the
wording of UI strings beyond the failure messages, which §6.14 fixes
because they are load-bearing (G6, FR6).

---

## 2. M0 — Scaffold

The milestone exists so that the offline rebuild works before a single line of
product code exists. It is the cheapest insurance in the project.

### 2.1 Files

```
.nvmrc                 "22"
.gitignore             node_modules, dist, coverage, .env, test-results,
                       playwright-report, *.tsbuildinfo, .DS_Store
.env.example           empty (the app has no configuration)
.dockerignore          node_modules, dist, .git, test-results, playwright-report
Dockerfile             see §2.3
index.html             <div id="root">, <script type=module src=/src/main.tsx>
package.json           see §2.2
package-lock.json      committed; `npm ci` everywhere
tsconfig.json          strict, bundler resolution, verbatimModuleSyntax,
                       noUncheckedIndexedAccess, erasableSyntaxOnly
tsconfig.node.json     config for vite.config.ts / vitest.config.ts
vite.config.ts         react plugin, base './', build.outDir dist
vitest.config.ts       two projects, see §2.4
playwright.config.ts   chromium only, webServer: npm run dev, see §2.5
src/main.tsx           React 19 root
src/App.tsx            placeholder, replaced in M4
AGENTS.md              rewritten: no Rust, no WASM, new scripts (M0 step 1)
```

### 2.2 package.json

Scripts, in full — this is the contract with the judge:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "e2e": "playwright test",
  "e2e:install": "playwright install chromium"
}
```

Note what is absent: no `pre*` hooks, no WASM guard script, no build step
outside `tsc` and `vite`. The previous implementation had a `pretest` that ran
`require-wasm.mjs`; that class of hook is exactly what D2 removes, and its
absence is a feature to preserve.

### 2.3 Dockerfile

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["npm", "test"]
```

No compiler, no `wasm-pack`, no Rust. `node:22-slim` matches `.nvmrc`. The
image runs the same command a judge runs by hand.

### 2.4 Vitest: two projects

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node',
               include: ['src/{domain,engine,application,platform}/**/*.test.ts',
                         'tests/**/*.test.ts'] } },
      { test: { name: 'jsdom', environment: 'jsdom',
               include: ['src/ui/**/*.test.ts?(x)'] } },
    ],
  },
})
```

`platform/` is in the node project: it is the only layer allowed to touch
browser APIs, and its tests either stub those APIs or are in the jsdom
project. Which one is a per-file decision made when the file is written.

If `test.projects` is not the right key for the installed Vitest, the first
M0 test fails loudly and the key is corrected here. This is the one place in
the document where a version detail is left to be discovered, because it is
discovered in five minutes by a test that must run anyway.

### 2.5 Playwright

```ts
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173',
               reuseExistingServer: true },
  projects: [{ use: { ...devices['Desktop Chrome'] } }],
})
```

Not part of `npm test` (E10). `npm run e2e` requires `npm run e2e:install`
first; the README says so, and `npm test` never does.

### 2.6 Dependency set

Runtime: `react`, `react-dom`, `pdf-lib`, `bidi-js`, and the ProseMirror
packages `prosemirror-model`, `prosemirror-state`, `prosemirror-view`,
`prosemirror-transform`, `prosemirror-commands`, `prosemirror-keymap`,
`prosemirror-schema-list`, `prosemirror-history`.

Dev: `vite`, `vitest`, `typescript`, `@vitejs/plugin-react`, `@types/react`,
`@types/react-dom`, `@types/node`, `jsdom`, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`,
`@playwright/test`, `fontkit`.

`fontkit` earns its place: §9.5 asserts that the committed font actually
contains Hebrew glyphs, and `pdf-lib`'s own copy is not a direct dependency.
`bidi-js` declares one transitive dependency (`require-from-string`) that its
built bundle does not use; that is harmless and is not worth avoiding.

Versions are pinned to the majors current at implementation time and recorded
in the lockfile. Do not add a dependency without writing down what it replaced.

### 2.7 M0 exit criteria

- `npm ci && npm test` passes offline with the two projects each running at
  least one test.
- `npm run typecheck` clean.
- `npm run build` produces `dist/`.
- `docker build -t scrivio . && docker run --rm --network none scrivio` exits 0.
- `npm run e2e` runs and reports "no tests found" without error.

---

## 3. Conventions

- ESM only. No default exports except React components.
- Every exported function has an explicit return type. `import type` for
  type-only imports (`verbatimModuleSyntax` enforces it).
- No `any`. No non-null assertion `!` outside tests. `noUncheckedIndexedAccess`
  is on, so typed-array reads are checked — this is deliberate; the
  segmentation code is where an unchecked index would silently produce a
  plausible wrong box.
- Comments explain *why*. A comment restating the line below it is deleted in
  review.
- Tests: `describe('<module path>')`, `it('behaves like …')` phrased as a
  sentence about behaviour, never about the implementation.
- Result unions, not exceptions, for anything a user can cause. Exceptions are
  reserved for programmer error and for genuinely exceptional I/O.

---

## 4. Shared types — `src/domain/types.ts`

One file, no imports, no logic. Everything else references these names.

```ts
export type Direction = 'ltr' | 'rtl'
export type Id = string

export interface RGBA {
  data: Uint8ClampedArray
  width: number
  height: number
}

export interface Box { x0: number; y0: number; x1: number; y1: number }  // inclusive

export interface SourcePage {
  id: Id
  widthPx: number          // original photo width
  heightPx: number
  thumbUrl?: string        // main-thread-only; never sent to a worker
  displayUrl?: string
}

export interface ChunkGeometry {
  chunkId: Id
  sourcePageId: Id
  inkW: number             // ink bbox, original photo pixels
  inkH: number
  inkOffsetY: number       // ink top relative to the cropped box top
  boxW: number             // cropped box size, padded
  boxH: number
  lineIndex: number        // line within its photo
  baselineOffset: number   // ink bottom below the line baseline, px
}

export type Inline =
  | { kind: 'text'; text: string }
  | ({ kind: 'chunk' } & ChunkGeometry)
  | { kind: 'footnoteRef'; id: Id }

export type DocNode =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }

export interface DocBlock {
  id: Id
  kind: 'pageBlock'
  sourcePageId: Id
  dir: Direction
  children: DocNode[]
}

export interface FootnoteEntry { id: Id; text: string; sourcePageId: Id }

export interface DocView {
  sourcePages: SourcePage[]
  blocks: DocBlock[]
  footnotes: FootnoteEntry[]
}

export interface SizeMm { w: number; h: number }

export interface TextStyle {
  fontPt: number
  lineHeight: number
}

export interface PageSpec {
  widthMm: number
  heightMm: number
  marginMm: number
  fontPt: number
  lineHeight: number
  footnoteFontPt: number
  footnoteGapMm: number
}

export interface PlacedRun {
  kind: 'text'
  text: string            // already in visual order
  rtl: boolean            // bidi level parity of this run
  xMm: number
  widthMm: number
  sizePt: number
}
export interface PlacedChunk {
  kind: 'chunk'
  chunkId: Id
  xMm: number
  widthMm: number
  heightMm: number
  baselineOffsetMm: number
}
export interface PlacedFootnoteMark { kind: 'footnoteRef'; n: number; xMm: number; widthMm: number }

export type PlacedItem = PlacedRun | PlacedChunk | PlacedFootnoteMark

export interface PlacedLine {
  blockId: Id
  lineIndex: number
  dir: Direction
  xMm: number
  baselineMm: number       // from the top of the page
  heightMm: number
  items: PlacedItem[]
}

export interface PlacedFootnote {
  n: number
  xMm: number
  widthMm: number
  lines: { text: string; rtl: boolean; xMm: number; widthMm: number }[]
}

export interface OutputPage {
  index: number
  widthMm: number
  heightMm: number
  lines: PlacedLine[]
  footnotes: PlacedFootnote[]
  overflow: boolean
}

export interface PageLayout {
  pageSpec: PageSpec
  pages: OutputPage[]
}
```

Two properties of these types are load-bearing:

- **`DocView` is not the ProseMirror document.** It is a projection built by
  `ui/editor/to-docview.ts` and consumed by everything below `application/`.
  It is plain JSON and survives `structuredClone`, which is what lets it cross
  into the PDF worker.
- **`PlacedLine.items` are already in visual order and already positioned.**
  An exporter that reorders or re-measures anything is duplicating
  `paginate()`, which is the one duplication `DESIGN.md` §9 exists to prevent.

---

## 5. Ports — `src/engine/ports/`

Interfaces only, structurally typed, no imports from any implementation.

```ts
// segmentation.ts
export interface SegmentationOptions {
  direction: Direction
  columns: number          // 1 today (D11); the parameter exists for later
  crop: boolean            // also crop+encode, or boxes only
  jpegQuality: number
}
export type SegmentFailure = 'too-dark' | 'too-low-contrast' | 'almost-empty'
export type SegmentationResult =
  | { ok: true; boxes: Box[]; lineIndexOf: number[]; baselineOf: number[]; chunks: CroppedChunk[] }
  | { ok: false; reason: SegmentFailure }
export interface CroppedChunk { chunkId: Id; bytes: Uint8Array; boxW: number; boxH: number }
export interface SegmentationPort {
  segment(rgba: RGBA, opts: SegmentationOptions): Promise<SegmentationResult>
}

// text-measurer.ts
export interface TextMeasurer {
  widthOf(text: string, style: TextStyle, dir: Direction): number  // mm
  ascentOf(style: TextStyle): number                              // mm
}

// pagination.ts
export interface PaginationPort {
  paginate(doc: DocView, page: PageSpec, measurer: TextMeasurer,
           chunkSizes: Map<Id, SizeMm>): PageLayout
}

// html-export.ts / pdf-export.ts
export interface ExportProgress { (fraction: number, note: string): void }

export interface HtmlExportPort {
  export(doc: DocView, layout: PageLayout, chunks: ChunkImageStore,
        fonts: FontSet, onProgress?: ExportProgress): Promise<Blob>
}
export interface PdfExportPort {
  export(doc: DocView, layout: PageLayout, chunks: ChunkImageStore,
        fonts: FontSet, onProgress?: ExportProgress): Promise<Blob>
}
```

`SegmentationResult`'s success arm carries `lineIndexOf` and `baselineOf` as
parallel arrays indexed like `boxes`, rather than enriching `Box` itself.
`Box` is a geometry type that other code (the source-panel overlay, the manual
box path) also uses, and it should not carry segmentation's line bookkeeping.

### 5.1 `ChunkImageStore`

Not a port in the SOLID sense — it is a resource both exporters need, and it
lives in `platform/` because it owns `URL.createObjectURL`. Its interface is
the one specified in `DESIGN.md` §6.2: it answers a worker's request for
**bytes**, never a main-thread-only `blob:` URL.

```ts
export interface ChunkImageStore {
  put(id: Id, bytes: Uint8Array, boxW: number, boxH: number): void
  has(id: Id): boolean
  bytesOf(id: Id): Uint8Array | undefined
  /** Fresh copies, transferable to a worker. Never the live arrays. */
  exportBytes(ids: Id[]): { chunkId: Id; bytes: Uint8Array }[]
  /** Main thread only. Creates on first call, revokes in release(). */
  urlFor(id: Id): string | undefined
  missing(ids: Id[]): Id[]
  release(): void
}
```

Two rules that exist because getting them wrong is invisible:

1. `exportBytes` copies. Transferring the live arrays would detach them from
   the store and break the editor's rendering on the next export.
2. `urlFor` is not implemented in workers and must not be. A `blob:` URL made
   on the main thread is meaningless in a worker; if an exporter asks for one
   it is a bug, and the store throws rather than returning a URL that 404s
   inside the worker.

---

## 6. M1–M2 — Domain and segmentation

### 6.1 `domain/ids.ts`

`newId(prefix: string): Id` — `prefix + '-' + base36(time) + '-' +
base36(counter)`. Monotonic within a session, so ids sort in insertion order
and a diff of two documents is readable. Collisions across sessions are
irrelevant (D6: nothing is persisted).

**Done when:** `it('produces ids that are unique across 10k calls')`,
`it('sorts ids in creation order')`.

### 6.2 `domain/chunk-scale.ts`

Per-photo normalisation (E5).

```ts
export interface ChunkScaleInput {
  photoWidthPx: number
  chunks: { chunkId: Id; inkH: number }[]
  pageWidthMm: number
  targetInkMm: number
}
export interface ChunkScaleResult {
  scaleMmPerPx: number
  sizes: Map<Id, SizeMm>       // display size of each chunk's cropped box
}
export function computeChunkScale(input: ChunkScaleInput): ChunkScaleResult
```

Algorithm, exactly:

```
1. mmPerPx = pageWidthMm / photoWidthPx
2. natural_i = inkH_i * mmPerPx                       // natural display height
3. median   = median(natural)                         // robust to specks/struck words
4. if median == 0 -> return identity (1.0) with all sizes = inkW/inkH * mmPerPx
5. k = targetInkMm / median
6. for each chunk:
     h = clamp(inkH_i * mmPerPx * k, targetInkMm*0.6, targetInkMm*1.6)
     w = boxW_i / boxH_i * h
7. return { scaleMmPerPx: mmPerPx * k, sizes }
```

`targetInkMm` is derived from the type style, not chosen freely:
`targetInkMm = fontPt * 0.72 / PT_PER_MM * 1.0` — an 11 pt face has roughly
0.72 em of x-height-to-cap band for handwriting, which is what makes the ink
and the type look like the same document. This constant is named
`chunk-scale.ts:TARGET_INK_EM`.

The clamp in step 6 is what stops one pathological blob (a struck-through
word, a shadow fragment) from setting the line height for everything around
it. It is in absolute mm, identical for every photo, which is why it survives
being applied per photo.

**Done when**

- scale is a no-op when the photo's ink is already at the target height
- the median is used, not the mean: a fixture with one 10× outlier blob yields
  the same scale as one without it
- clamping bounds a pathological blob to the band while its neighbours stay at
  the target
- two photos of different resolutions in one document produce the same median
  display height per photo (this is the E5 test, and it is the one that fails
  if someone "simplifies" back to a document-wide median)
- display width preserves the chunk's aspect ratio

### 6.3 `domain/footnote.ts`

```ts
export function numberFootnotes(doc: DocView): Map<Id, number>
```

Walks `doc.blocks` in order, and within each block walks its inline content in
document order, assigning `1..n` per `sourcePageId` (design §6.3). Exported
numbers are per *output* page and are computed in `paginate`, not here — this
function is the editor-side view and the source-panel view only.

**Done when**

- two refs to the same source photo number 1, 2; a different photo restarts at 1
- refs in nested list items are numbered in document order
- an unknown footnote id is skipped, not thrown on (E18)
- the walk is a single pass and touches no chunk images (assert via a fixture
  where `bytesOf` would throw if called)

### 6.4 `engine/segmentation/thresholds.ts`

Every constant the pipeline uses, exported frozen (E9):

```ts
export const THRESH = {
  longEdgePx: 2400,
  windowDivisor: 40, windowMin: 15, windowMax: 101,
  binarizeCFrac: 0.18, binarizeCFloor: 6,
  minBlobArea: 12, minBlobAreaFrac: 0.000015,
  maxBlobAreaFrac: 0.25,
  lineToleranceFrac: 0.6,
  wordGapFrac: 1.5,
  punctHeightFrac: 0.4, punctGapFrac: 1.2, punctFillMin: 0.08,
  minWordsForSuccess: 3,
  tooDarkMean: 60, tooFlatStd: 12,
} as const
```

### 6.5 `engine/segmentation/luma.ts`

`toLuma(rgba: RGBA): Uint8Array` — integer BT.601, `v = (77*r + 150*g + 29*b) >> 8`.

**Done when:** pure colours map to the expected values (`#808080` → 127 or
128, `#fff` → 255, `#000` → 0); output length is `w*h`; an all-grey image has
zero variance.

### 6.6 `engine/segmentation/binarize.ts`

```ts
export function binarize(luma: Uint8Array, w: number, h: number,
                        out: Uint8Array, th: typeof THRESH): BinarizeStats
```

Integral image: `S` is `Uint32Array((w+1)*(h+1))`, running sums of `luma`. Max
sum at 2400×1800 is 2400*1800*255 ≈ 1.1e9 — inside `Uint32`, so no `Float64`
and no overflow.

Window `W` = odd, `clamp(round(min(w,h)/windowDivisor), windowMin, windowMax)`
forced odd. Per pixel, `mean = (S[..] - S[..]) / (W*W)`; ink iff
`v < mean - max(binarizeCFloor, binarizeCFrac * std)` where `std` is the local
standard deviation from the same integral sums (`sqrt(max(0, E[x²] - mean²))`
scaled). The `binarizeCFloor` term is what keeps a blank page from
binarising its own noise.

Adaptive, not global Otsu: phone photos of paper have a lighting gradient, and
a single global threshold turns the shadowed corner of a page into a solid
block of ink. That is the reason this choice is made, and it is the first
thing to revisit if segmentation fails on a real photograph.

**Done when**

- a synthetic page with a left-to-right brightness gradient binarises to
  uniform ink density in every column (the test that Otsu fails)
- a uniform mid-grey region produces no ink
- `out` is `Uint8Array(w*h)` with values 0 or 1 only
- the window size is odd and within `[windowMin, windowMax]` for a 300 px and a
  5000 px input
- stats reports mean and std that match a brute-force computation on a small
  input

### 6.7 `engine/segmentation/components.ts`

```ts
export interface Blob { x0: number; y0: number; x1: number; y1: number; area: number; fill: number }
export function connectedComponents(ink: Uint8Array, w: number, h: number,
                                    minArea: number): Blob[]
```

Two-pass union-find, 8-connectivity. `parent` is an `Int32Array(w*h)`
initialised to `-1` (unlabelled); `find` is iterative with path halving, never
recursive — a 2400×1800 ink field can produce a component deep enough to blow
a recursive stack, and that failure mode is a mystery crash in production.

Pass 1 scans row-major, assigning a provisional label and unioning with the
already-labelled neighbours `(x-1,y) (x-1,y-1) (x,y-1) (x+1,y-1)`. Pass 2
re-scans, resolves each label to its root, and accumulates per-root
`x0,y0,x1,y1,area`. `fill = area / ((x1-x0+1)*(y1-y0+1))` is computed once
here because §6.10 needs it and nothing else does.

**Done when**

- two squares 1 px apart are one component (8-connectivity); two squares 2 px
  apart are two
- a diagonal chain is a single component
- `area` equals the pixel count; `fill` ∈ (0,1]
- components below `minArea` are dropped
- a full-image component (a border) is returned by this function and dropped by
  the pipeline's filter — the two responsibilities stay separate, and each has a
  test saying so
- no recursion: a 500×500 solid ink rectangle completes without a stack error

### 6.8 `engine/segmentation/lines.ts`

```ts
export interface Line { blobs: Blob[]; top: number; bottom: number; baseline: number; medianCy: number }
export function clusterLines(blobs: Blob[], th: typeof THRESH): Line[]
```

Sort by `cy` ascending. Sweep: for each blob, scan candidate lines **from the
most recent backwards** and adopt the first whose `|cy - line.medianCy| <=
lineToleranceFrac * medianBlobHeight`; otherwise open a new line. (Scanning
backwards only is what makes this O(n·k) with small k rather than O(n²).)

After the sweep, each line's `baseline = max(bottom)` over its blobs, per
`DESIGN.md` §7.2. `medianBlobHeight` is the median over *all* surviving
blobs, not per line, so the tolerance does not change as lines are formed.

**Done when**

- a row of blobs at the same height forms one line; two rows far apart form two
- a blob with a very different height but the same centre joins the line
  (this is a `g`/`l` next to `x-height` letters, and it must not open a line)
- `baseline` is the maximum ink bottom, not the median
- the result is sorted top-to-bottom, with ties broken by `x0`
- 3000 blobs cluster in under 50 ms (a timeout assertion, not a benchmark —
  it is there to catch an accidental O(n²), not to police constant factors)

### 6.9 `engine/segmentation/words.ts`

```ts
export interface WordBox extends Box { blobIds: number[] }
export function groupWords(line: Line, medianBlobWidth: number, th: typeof THRESH): WordBox[]
```

Within a line, sort blobs by `x0`. Walk, accumulating a current word; close it
and start a new one when `gap = next.x0 - cur.x1 - 1 > wordGapFrac *
medianBlobWidth`. `medianBlobWidth` is the median `width` over all surviving
blobs in the image, with a per-line fallback when the line has fewer than
three blobs.

Bucket-local by construction — the line was already computed, so this is a
single linear pass and never an all-pairs sweep.

**Done when**

- blobs separated by a space-sized gap become two words
- blobs separated by a hairline gap become one word
- the same input in two different lines produces different words (proving
  bucket-locality)
- words come out sorted left-to-right
- a line with a single blob returns that blob as a single word

### 6.10 `engine/segmentation/punctuation.ts`

**This is the stage the no-recognition boundary is about** (`DESIGN.md` §8.1).
It is geometry and nothing else. No codepoint, no glyph class, no character
frequency, no model.

```ts
export interface MergeResult { words: WordBox[]; droppedBlobIds: number[] }
export function mergePunctuation(words: WordBox[], blobs: Blob[],
                                 lineOf: number[], th: typeof THRESH): MergeResult
```

Two passes:

1. **Absorb.** Any blob that ended up in no word, and which is a plausible
   neighbour of some word — `height < punctHeightFrac * medianBlobHeight`,
   `fill >= punctFillMin`, and horizontal gap to the word `< punctGapFrac *
   medianBlobWidth` — is absorbed into that word's box.
2. **Drop.** Any blob still in no word is a speck and is dropped. This is the
   common case: a JPEG artefact or a paper fibre.

A blob that is small but has `fill < punctFillMin` is not absorbed; it is a
noise pixel cluster, not a mark.

**Done when**

- a small mark adjacent to a word extends that word's box
- a small mark far from every word is dropped, and the drop is reported rather
  than silently discarded
- a large blob adjacent to a word is *not* absorbed (height guard)
- a sparse small blob is dropped rather than absorbed (fill guard)
- an integration test asserts that no code path in `engine/segmentation`
  imports a Unicode property table, a character class beyond ASCII
  punctuation, or anything from `/recognition/` — a grep test over the source
  tree, which is the cheapest possible guard against G3 erosion and the only
  one that keeps working

### 6.11 `engine/segmentation/reading-order.ts`

```ts
export function orderReading(boxes: Box[], lines: Line[],
                             opts: { direction: Direction; columns: number }): Box[]
```

`columns` is honoured only for `1` today; a value > 1 is a `throw` in
development and is documented as unimplemented rather than silently behaving as
1 (a silent fallback here would be D11 violated quietly). Lines top-to-bottom;
within a line, `x0` ascending for LTR, `x1` descending for RTL.

The extension seam is real and tested: a test feeds a two-column fixture and
asserts the *shape* of the expected order — column-major, each column
top-to-bottom, RTL columns right-to-left — against a reference function in the
test file, so the moment D11 is implemented the test flips from
"documents the seam" to "verifies the behaviour" by deleting one function.

**Done when**

- LTR orders a 2-line fixture left-to-right
- RTL is the exact mirror of LTR on the same fixture
- line order is top-to-bottom regardless of direction
- `columns: 2` throws

### 6.12 `engine/segmentation/pipeline.ts`

The orchestrator. It contains no thresholds (§5.3's single-responsibility claim
is a test, see below) and no image maths.

```ts
export function segmentSync(rgba: RGBA, opts: SegmentationOptions): SegmentationResult
```

Stage order, with the decision each stage owns:

| # | Stage | Module | Decision |
|---|-------|--------|----------|
| 0 | Stats | `luma` | mean < `tooDarkMean` → `too-dark`; std < `tooFlatStd` → `too-low-contrast` |
| 1 | Luma | `luma` | — |
| 2 | Binarise | `binarize` | — |
| 3 | Components | `components` | drop `area < max(minBlobArea, minBlobAreaFrac*w*h)`; drop `area > maxBlobAreaFrac*w*h` (borders, shadows, a hand) |
| 4 | Lines | `lines` | — |
| 5 | Words | `words` | — |
| 6 | Punctuation | `punctuation` | — |
| 7 | Read | `reading-order` | — |
| 8 | Emit | `pipeline` | fewer than `minWordsForSuccess` words → `almost-empty` |
| 9 | Baseline | `pipeline` | per line, `baselineOffset_i = baseline − box.y1` |

`stage 3`'s large-component drop is the "a hand in the photo" filter and it is
a blunt instrument: a hand that is 20% of the frame survives. Accept it; the
manual box path (§10.3) is the answer for that photo, and FR6's message tells
the user so.

`emit` also transforms working coordinates back to original photo pixels:
`orig = round(working * origW / workingW)`, and each box is clamped to
`[0, origW-1] × [0, origH-1]` after the transform, because bilinear
downscaling can put the last row half a pixel outside.

**Done when**

- a synthetic buffer with 12 drawn word-like strokes yields 12 boxes, in order
- an all-white buffer returns `{ ok: false, reason: 'too-low-contrast' }`
- a near-black buffer returns `'too-dark'`
- a buffer with three or fewer blobs returns `'almost-empty'`
- boxes are in original photo coordinates (assert against a known scale factor)
- a stage-order regression: two strokes in the same line with a wide gap produce
  two words, and moving line clustering *after* word grouping would merge them
  (this is a comment-documented test; the assertion is on the outcome)
- `pipeline.ts` contains no numeric literals other than `0`, `1`, `2` and `4`
  (a source-text assertion; it is the only way to make §5.3's SOLID claim
  testable rather than aspirational)
- the no-recognition grep test (§6.10) passes

### 6.13 Fixture regression — `tests/segmentation.real.test.ts`

Three real photographs, already converted to raw 8-bit luma
(`tests/fixtures/*.gray`, `manifest.json` describes each). The test:

1. loads the buffer with `fs.readFileSync` — no canvas, no decoder;
2. runs `segmentSync` with `crop: false`;
3. asserts `words.length` is within `tolerance` of `expectedWords`;
4. asserts every box is inside the image and non-degenerate (`w>0, h>0`);
5. asserts the reading order is monotone in `y` — the ordering property that
   must not regress even when counts do.

`expectedWords` is filled in **once**, by running the pipeline and recording the
result, and never adjusted afterwards except by a deliberate, commented change
to `thresholds.ts`. That is the entire point: a fixture whose expectation moves
with the implementation tests nothing.

Tolerances are ±12% of the recorded count. A photograph does not have one
correct answer, but it has a narrow band, and a threshold change that stops
finding words in real ink falls outside it.

**Done when**

- the three fixtures pass with the recorded tolerances
- deliberately raising `binarizeCFrac` by 30% makes at least one fixture fail
  (a green test that cannot go red is not a regression test; this assertion is
  written by temporarily patching `THRESH` inside the test and asserting the
  count moved outside tolerance)
- the test runs in under 3 s for all three

### 6.14 Failure messages

`DESIGN.md` §7.4 fixes the segmentation message. FR6 makes the wording
load-bearing, so it is written here once and referenced, not re-invented per
call site.

| `SegmentFailure` | Message shown to the user |
|---|---|
| `too-dark` | "Nothing usable on this photo — it is too dark to read the ink. Try again with more light." |
| `too-low-contrast` | "Nothing usable on this photo — the writing is too faint or the page too flat. Try again with more contrast." |
| `almost-empty` | "Nothing usable on this photo — no words were found. Try again with more light, or draw boxes on it manually." |
| `decode-failed` (platform) | "This file could not be read as an image. JPG and PNG are supported." |

Every one ends with a route forward, and in all three segmentation cases the
manual box path is reachable from the same screen. The app never says "error".

---

## 7. Platform adapters and workers

`platform/` is the only directory allowed to touch browser APIs. Nothing in
`domain/`, `engine/` or `application/` may import from it.

### 7.1 `platform/image-decode.ts`

```ts
export interface DecodedImage {
  bitmap: ImageBitmap     // original resolution
  widthPx: number
  heightPx: number
}
export async function decodeToBitmap(file: Blob): Promise<DecodedImage>
```

`createImageBitmap(file)` → `{ ok: true, bitmap }` or
`{ ok: false, reason: 'decode-failed' }`. A caught `DOMException` from
`createImageBitmap` is the expected path for "this is not an image", not an
exceptional one.

Downscaling happens in the worker, not here (§7.4), because the *original*
bitmap is needed there for cropping (§6.18) and transferring a 12 MP bitmap to
transfer it downscaled would be wasteful.

**Done when:** a PNG buffer decodes and reports its dimensions; a
non-image buffer returns `decode-failed` rather than throwing.

### 7.2 `platform/image-crop.ts`

Used inside the worker.

```ts
export async function cropEncode(bitmap: ImageBitmap, box: Box, pad: PadFractions,
                                 quality: number): Promise<Uint8Array>
```

`OffscreenCanvas(w, h).drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)` then
`convertToBlob({ type: 'image/jpeg', quality })` → `Uint8Array`. Padding is
E7, clamped to the photo bounds, with a minimum of 2 px on each side so a blob
touching the photo edge still gets a white margin rather than a hard cut.

**Done when:** a crop of a known rectangle produces a JPEG of exactly those
dimensions; a box at the photo's corner is clamped, not negative; the returned
bytes start with `FF D8 FF` (it really is a JPEG — asserted, because a silent
PNG here would double the export size and nothing else would notice).

### 7.3 `platform/blob-store.ts`

`ChunkImageStore` (§5.1) over a `Map<Id, { bytes: Uint8Array; boxW: number;
boxH: number }>`. `urlFor` memoises object URLs in a second `Map`; `release()`
revokes every one and clears both maps.

**Done when:** `put`/`has`/`bytesOf` round-trip; `urlFor` returns the *same*
string on two calls and `undefined` for an unknown id; `exportBytes` returns
copies that survive the caller detaching them; `release` revokes every created
URL (assert via a spy on `URL.revokeObjectURL`); `missing(['a','b'])` returns
only the unknown one.

### 7.4 Workers

One file per worker, plus `workers/protocol.ts` with the message types shared
between main thread and worker. Typed as a discriminated union on `type`, so
adding a message is a compile error in both directions until both sides handle
it.

```ts
// workers/protocol.ts
export type ToSegWorker =
  | { type: 'segment'; jobId: string; bitmap: ImageBitmap;
      direction: Direction; columns: number; crop: boolean; jpegQuality: number }
  | { type: 'cancel'; jobId: string }

export type FromSegWorker =
  | { type: 'accepted'; jobId: string }
  | { type: 'progress'; jobId: string; phase: string; fraction: number }
  | { type: 'photo-done'; jobId: string; result: SegmentationResult }
  | { type: 'failed'; jobId: string; message: string }
```

`segment` transfers the `ImageBitmap`, so the main thread's copy is detached
and cannot be used for a thumbnail — which is why thumbnails come from a
separate small decode on the main thread, not from this bitmap.

The worker processes jobs **serially** and streams results per photo (FR8).
Serial is not a limitation: segmentation is the bottleneck and running two at
once on a phone doubles the peak memory of the largest step for no wall-clock
gain that the user can see while they wait for photo one.

`crop: true` means the worker also crops and encodes every chunk and returns
`chunks: CroppedChunk[]` with the byte arrays transferred back. This is the
step `DESIGN.md` §7.1 insists on: 3,000 `convertToBlob` calls on the main
thread would freeze the tab exactly as segmentation would.

**Done when**

- the worker's pipeline is invoked with the same arguments as `segmentSync`
  (the worker is a thin shell over it, and a test asserts the worker module's
  handler calls the pure pipeline — not a reimplementation of it)
- a job posted from the main thread returns exactly one terminal message
- `cancel` before the job starts produces no `photo-done`
- bytes arrive as transferable and the sender's buffers are detached

### 7.5 The main-thread worker client

```ts
export interface SegmentationClient {
  submit(file: Blob, opts: { direction: Direction; columns: number },
         on: (ev: ImportEvent) => void): Promise<void>
  cancelAll(): void
}
```

One in-flight photo at a time from a queue of files, `onProgress` forwarded to
the UI, per-photo results applied to the document as they arrive so page one is
editable while page ninety is still being segmented (FR8, `DESIGN.md` §7.1).

**Done when:** three files submitted produce three `photo-ready` events in
order, with progress between them; a failed photo produces `photo-failed` and
the queue continues.

---

## 8. Layout

The one module that owns every layout decision (§9 of `DESIGN.md`).

### 8.1 `engine/pagination/text-layout.ts`

Breaks one block's inline content into lines. Pure; all measurement through
`TextMeasurer`.

```ts
export type LayoutInput =
  | { kind: 'text'; text: string; rtl: boolean }
  | { kind: 'atom'; widthMm: number; heightMm: number; baselineOffsetMm: number; ref: unknown }
export interface LaidOutLine {
  dir: Direction
  heightMm: number
  baselineMm: number      // from this line's own top
  items: (LayoutInput & { widthMm: number })[]
  text: string            // concatenation of the line's text items, logical order
}
export function layoutBlock(items: LayoutInput[], widthMm: number,
                            style: TextStyle, measurer: TextMeasurer): LaidOutLine[]
```

Rules, all of which have a test:

- Break opportunities are spaces in text, and both sides of every atom. A
  Hebrew word has no internal space; English inside it breaks normally.
- Trailing whitespace at a break is dropped; leading whitespace at a line's
  start is dropped.
- An item wider than `widthMm` is **hard-broken by codepoint** (never
  mid-combining-mark: skip a break before a codepoint in `\u0300-\u036f`).
  This is the "one very long typed word" case, and silently overflowing it is
  forbidden.
- Line height is `max(style.fontPt * style.lineHeight, tallest atom on the
  line)`. A line containing a tall chunk grows rather than clipping it.
- `baselineMm` is `ascentOf(style)`, except on a line whose tallest atom
  exceeds the style's ascent, where it becomes the atom's height above its own
  baseline offset. This is the export equivalent of `DESIGN.md` §6.2's baseline
  alignment, and the two must agree to within one pixel at 96 dpi — there is a
  test comparing them.
- An empty block yields one empty line, so an empty paragraph still occupies a
  line's height.

**Done when:** each rule above has its own test; a mixed
`[chunk][text "hello world"][chunk]` block breaks only at spaces and atom
edges; a hard break never lands between a base character and its combining
mark.

### 8.2 `engine/pagination/paginate.ts`

```ts
export function paginate(doc: DocView, page: PageSpec, measurer: TextMeasurer,
                         chunkSizes: Map<Id, SizeMm>): PageLayout
```

Algorithm:

```
contentTop    = marginMm
contentBottom = heightMm - marginMm
contentWidth  = widthMm - 2*marginMm

reserve: Map<pageIndex, footnoteAreaHeightMm>   // start empty

repeat up to 3 times:
  1. flow every block's lines, in block order, into pages:
       cursor = contentTop
       for each line:
         if cursor + line.heightMm > contentBottom - reserve.get(page) :
             page += 1; cursor = contentTop
         place the line: xMm = dir === 'ltr' ? marginMm : widthMm - marginMm - lineWidth
         cursor += line.heightMm
       blocks never reorder and never move backwards; a block that starts past
       the top of a page starts at that page's content top
  2. assign each footnoteRef to the page its line landed on; for each page,
     wrap its footnotes' text at contentWidth - footnoteIndent using
     layoutBlock with the footnote style, and sum their heights
  3. next = that map
     if next equals reserve: stop
     reserve = next

use the last layout produced
```

Three properties this buys, each with a test:

- **Convergence.** Small documents converge on iteration 1 or 2. The loop is
  bounded at 3 and the last layout wins if it has not converged; a document
  that oscillates is pathological, and blocking an export on it would be worse
  than a slightly-off footnote area. Tested: a 40-page document with 60
  footnotes converges in ≤ 2 iterations.
- **Footnotes never push content past the bottom.** A page whose footnote area
  grows re-flows its own content in the next iteration, so the FR4 requirement
  (numbering restarts at 1 per page, footnote sits at the bottom of that page)
  holds without a special case anywhere in the renderer.
- **Ordering is a function of direction alone.** Line *filling* is
  direction-independent — items are placed in model order, which the
  chunk-ordering invariant guarantees is reading order. `dir` decides only
  which margin the line is anchored to. Tested both ways on the same fixture,
  producing mirrored output.

Footnote indent: `6 mm`, numbers followed by `2 mm`, drawn as `¹`-style
prefixes via a superscript digit run rather than Unicode superscript
codepoints (the committed font's coverage of U+2070–U+209F is not something to
depend on).

**Done when**

- blocks flow in order and pages are filled top to bottom
- a block taller than one page splits at line boundaries
- `overflow: true` is set for a page containing a line that could not fit even
  on an empty page (E16)
- footnotes land on the page of their reference and renumber from 1 per page
- a footnote whose text is long enough to wrap produces multiple `lines`
- LTR and RTL of the same document produce mirrored placement
- an empty document produces exactly one empty page

### 8.3 `engine/export/bidi.ts`

`DESIGN.md` §9.3. `bidi-js` is the only dependency here and the algorithm is
fixed:

```ts
import bidiFactory from 'bidi-js'
const bidi = bidiFactory()

export interface VisualRun { text: string; rtl: boolean }
export function visualRuns(line: string, base: Direction): VisualRun[]
```

1. `const levels = bidi.getEmbeddingLevels(line, base)` — the base direction is
   always explicit; it comes from the block, never from sniffing (§9.3's third
   constraint).
2. `const mirrored = bidi.getMirroredCharactersMap(line, levels.levels)` and
   apply it to a mutable copy. Note the second argument is the `Uint8Array`
   `levels`, not the `EmbeddingLevels` object — a mismatch that TypeScript
   catches, which is the reason for pinning the API here.
3. `const flips = bidi.getReorderSegments(mirrored, levels, 0, line.length - 1)`
   — applied **per line**, which is what makes the API's start/end range the
   right granularity rather than a convenience.
4. Build a visual index order by applying each `[start, end]` flip in order.
5. Group consecutive visual indices that share embedding-level parity into
   runs; each run's `rtl` is `level & 1`. Drop trailing whitespace from the
   last run.

This produces segments, not one reordered string, because the PDF renderer
needs to measure and place each segment separately (E2). The HTML renderer
does not use this at all — it emits logical text and lets the browser's own
bidi do the work, which is the payoff of D13.

**Done when**

- pure Hebrew in an RTL base yields one `rtl` run, unchanged in content
- Hebrew + Latin + digits yields runs whose visual order is correct per UAX #9,
  asserted against hand-written expectations for `"שלום world 42"`
- parentheses around a Hebrew word in an RTL line are mirrored
- the same input with base `ltr` produces the mirror-image order
- an empty line yields `[]`
- a string with no RTL characters yields exactly one `ltr` run

### 8.4 Measurement cache

`platform/canvas-measurer.ts` implements `TextMeasurer` on a 2D canvas with a
memo keyed by `` `${dir}|${fontPt}|${lineHeight}|${text}` ``, bounded at 20,000
entries with a simple clear-on-overflow. In the browser the underlying
`measureText` is already cached by the engine, so the gain is small; the cache
matters because the *paginator* re-measures the same words repeatedly across its
three convergence iterations.

`tests/fake-measurer.ts` implements `TextMeasurer` as `text.length *
style.fontPt * 0.5 / PT_PER_MM` — a monospace model. Every layout test uses
it, which is what makes §12's "no canvas, no jsdom" claim true for layout.

---

## 9. Export

### 9.1 Shared contract

Both exporters receive `DocView`, `PageLayout` and `ChunkImageStore`, and both
iterate `layout.pages[i].lines[j].items` in the order given. Neither
re-measures, re-breaks or re-orders anything. The test that proves this is in
§12: a fake `PageLayout` with deliberately odd placements must come out of each
renderer in exactly those positions.

Both fail loudly (G6): a missing chunk, an unbaked font, or an unwritable
result rejects with a message naming what went wrong.

### 9.2 HTML — `engine/export/html.ts`

```ts
export function exportHtmlToParts(doc: DocView, layout: PageLayout,
                                 store: ChunkImageStore): BlobPart[]
```

Returns an array of string and `Uint8Array` parts, assembled into a `Blob` by
the caller. Never one concatenated string — a 25 MB string is a GC event, and
`DESIGN.md` §13 names this risk.

Structure:

```html
<!doctype html>
<html lang="he"><head><meta charset="utf-8">
<title>Scrivio — <n> pages</title>
<style> … inlined, no @import, no url() … </style>
</head><body>
<section class="page" style="width:210mm;height:297mm;padding:20mm" dir="ltr">
  <p class="line" dir="rtl" style="…">
    <img alt="" style="width:12.3mm;height:4.1mm;vertical-align:baseline;margin-bottom:-0.2mm">
    <span>שלום</span><sup>1</sup>
  </p>
  <ol class="list"><li>…</li></ol>
  <aside class="fn"><hr><p><sup>1</sup> text…</p></aside>
</section>
</body></html>
```

Rules:

- **Logical text, `dir` attributes.** The renderer emits `PlacedRun.text` as
  given (which is already visual order for PDF, logical for HTML — the two
  differ, and `paginate` must therefore store both, or store logical and let
  bidi run here). Resolution: `PlacedRun` carries **logical** text plus its
  `rtl` flag; `visualRuns` (§8.3) is called by the PDF renderer only, on the
  line's concatenated logical text, and the HTML renderer emits logical text
  with `dir`. Positions come from `xMm` in both cases, so a line that bidi
  reorders within itself has its runs placed at the positions `paginate`
  computed — which is correct, because `paginate` computes those positions from
  the same `visualRuns` output.
- Images are `data:image/jpeg;base64,…`, encoded **once** from the bytes
  already in the store. Never re-encoded at export (D8, E7).
- Escaping: `& < > "` in text and attribute values, always.
- `@page { size: <w>mm <h>mm; margin: 0 }` so a browser print of the file
  matches, but printing is not the export path (D9).
- The system font stack from `DESIGN.md` §8.4, inlined. No webfont, no
  network, no `<script>` — the file must survive being opened from a text
  editor, which D8 states as the reason.

**Done when**

- output contains no `http`, no `<script`, no external `url(`
- every chunk in the layout appears exactly once as a `data:image/jpeg`
- RTL text is emitted in logical order with `dir="rtl"` on its line
- a chunk id with no bytes in the store throws with the id in the message (E14)
- `&` and `<` in typed text survive a round trip through the escaping
- the result is a `Blob` whose size is within 15% of the sum of its parts

### 9.3 PDF — `engine/export/pdf.ts`

```ts
export async function exportPdf(doc: DocView, layout: PageLayout,
                                store: ChunkImageStore,
                                fonts: FontSet): Promise<Uint8Array>
```

Runs in `pdf-export.worker.ts` (E13).

- Page size in points: `mm * 72 / 25.4`. Drawing origin is bottom-left;
  `PlacedLine.baselineMm` is from the page top, so `y =
  pageHeightPt - baselineMm * PT_PER_MM`.
- **Font embedding (E1):** `doc.embedFont(hebrewBytes, { subset: false })`,
  plus `doc.embedFont(StandardFonts.Helvetica)` for Latin segments (E2).
  A single font per visual run, chosen by the rule: any character above
  `U+024F` → Hebrew font, otherwise Helvetica.
- **Chunk images:** `doc.embedJpg(bytes)` once per chunk id, cached, then
  `page.drawImage(img, { x, y, width, height })` per placement.
- **Text:** per line, concatenate the line's logical text, run
  `visualRuns(line, block.dir)`, then place each run at successive x
  positions derived from `PlacedRun.xMm` and the measured run widths. If the
  recomputed widths disagree with `paginate`'s by more than 1% the export
  **fails** rather than drawing a line whose pieces do not add up — a silent
  mismatch here is how an RTL document ends up with its words overlapping.
- `doc.save()` → `Uint8Array`.

The one rendering path (D14): there is no rasterised fallback. If
`embedFont` throws, the export reports it in plain words and fails.

**Done when**

- the output starts with `%PDF-` and its length matches `save()`'s
- a Hebrew document's extracted text (via `pdfjs-dist`, a devDependency
  available in the node project) round-trips to the typed strings in the
  original logical order
- `"שלום world 42"` in an RTL block produces visual runs in the order §8.3
  specifies — asserted by inspecting the drawn content stream order, not by
  eyeballing a rendered page
- a Latin-only document never embeds the Hebrew font, and a Hebrew document
  always does
- a missing chunk fails with the chunk id in the message
- every page's `drawText` x positions are monotonically increasing within a
  line (the property whose violation means the placement maths is wrong)
- a document whose lines exceed the page height sets and reports `overflow`

### 9.4 `FontSet`

```ts
export interface FontSet { hebrew: Uint8Array }   // Noto Sans Hebrew, OFL 1.1
```

Committed at `assets/fonts/NotoSansHebrew-Regular.ttf`, imported with Vite's
`?url` so the worker receives an `ArrayBuffer`. One static instance, never a
variable font (§8.4 of `DESIGN.md`). The OFL licence file ships beside it.

**Done when:** the file exists, is > 50 KB, and parses as a TTF.

### 9.5 Font glyph coverage test

The static-instance rule is not optional, and neither is checking it. A test
opens the committed font with `fontkit` and asserts every Hebrew character the
product claims to support has a glyph:

```ts
const font = fontkit.open(bytes)
for (const cp of 'אבגדהוזחטיכלמנסעפצקרשתךםןףץ')   // the alphabet the fixtures use
  expect(font.hasGlyphForCodePoint(cp.codePointAt(0)!)).toBe(true)
```

The test suite's Hebrew strings are drawn from this alphabet only, so a missing
glyph cannot reach a judge unannounced. It also asserts that the font has
*Latin* coverage — and if it does not, that is when E2's Helvetica fallback
earns its place, discovered here rather than in a PDF.

### 9.6 `application`-level export trigger

`platform/download.ts` — `saveBlob(blob, filename)`, an `<a download>` click.
Injected into the use case, so `application/` never touches the DOM.

---

## 10. Application use-cases

No UI, no DOM, no React. Each takes its ports as arguments and emits events.

### 10.1 `import-photo.ts`

```ts
export interface ImportDeps {
  segmentation: SegmentationPort
  client: SegmentationClient
  store: ChunkImageStore
}
export type ImportEvent =
  | { type: 'progress'; fileName: string; fraction: number; phase: string }
  | { type: 'photo-ready'; sourcePage: SourcePage; chunkIds: Id[] }
  | { type: 'photo-failed'; fileName: string; reason: SegmentFailure | 'decode-failed'; message: string }
export async function importPhotos(deps: ImportDeps, files: File[],
                                   opts: { direction: Direction; columns: number },
                                   insert: (sourcePage: SourcePage, chunkIds: Id[]) => void,
                                   on: (ev: ImportEvent) => void): Promise<void>
```

Sequencing per photo: decode → segment (+ crop/encode) → `chunk-scale` for
that photo → `insert(...)` into the document → emit `photo-ready`. Each photo
becomes one `pageBlock` whose `dir` is the upload's direction (§6.5 level 1).

The document is edited **per photo, as each completes** — not after the last
one. That is FR8's "never freezes the interface" in its most literal form, and
it is why the batch path streams rather than collecting.

### 10.2 `attach-footnote.ts`

```ts
export function attachFootnote(state: EditorState, dispatch: (tr: Transaction) => void,
                               footnoteId: Id, sourcePageId: Id): boolean
```

Inserts a `footnote_ref` node after the caret's chunk (or at the caret) and
records `{ id, text: '', sourcePageId }` in plugin state. Returns `false` and
changes nothing if there is no chunk at or before the caret in the current
block — attaching a footnote to nothing is a disabled toolbar button, not an
error.

### 10.3 `draw-box.ts`

FR5. Given a rectangle in original photo coordinates:

1. crop + encode via the worker (same `segment` job type with `crop: true` and
   a pre-set box — the worker exposes a `crop-only` job, not a second
   segmentation path);
2. if the caret is inside the `pageBlock` for this `sourcePageId`, insert at
   the caret; otherwise append as a new paragraph at the end of that block
   (§4's FR5 interpretation);
3. emit the new chunk id so the source panel can draw its box.

### 10.4 `set-block-direction.ts`

```ts
export function setBlockDirection(dir: Direction): Command
```

E15. Finds the block containing the selection, and if `dir` differs from the
current one, reverses the order of `chunk` nodes within it — **within each
paragraph and list item individually**, not across the block, because a block
may hold several paragraphs which must not be reordered relative to each other.
Text nodes are untouched. Then sets the `dir` attribute.

**Done when**

- an RTL block's chunks reverse to model-LTR order, and the visible sentence is
  unchanged
- flipping twice restores the exact original order (round trip)
- paragraphs are not reordered relative to each other
- typed text keeps its order
- this test is the one named in `DESIGN.md` §6.5 as the invariant assertion

### 10.5 `export-document.ts`

```ts
export async function exportDocument(deps: {
  paginate: PaginationPort
  html: HtmlExportPort
  pdf: PdfExportPort
  store: ChunkImageStore
  measurer: TextMeasurer
  save: (blob: Blob, filename: string) => void
  fonts: FontSet
}, doc: DocView, page: PageSpec, format: 'html' | 'pdf'): Promise<void>
```

Builds `chunkSizes` from `computeChunkScale` per photo, calls `paginate` once,
reports `overflow` pages to the user *before* the download (E16), then runs the
chosen port. One `paginate` call for both formats is the mechanism that stops
HTML and PDF drifting apart; a test asserts both ports received the identical
`PageLayout` object.

---

## 11. UI

### 11.1 Layout

Three panes, CSS grid: source panel (left, resizable, default 30%), editor
(centre), and a collapsible footnote strip (bottom). Toolbar across the top.

### 11.2 `ui/editor/schema.ts`

```ts
export const schema = new Schema({
  nodes: {
    doc:      { content: 'pageBlock+' },
    pageBlock:{ content: 'block+', group: 'block', defining: true,
                attrs: { sourcePageId: { default: '' }, dir: { default: 'ltr' } },
                parseDOM: [{ tag: 'section[data-page-block]',
                             getAttrs: d => ({ sourcePageId: d.getAttribute('data-source') ?? '',
                                               dir: (d.getAttribute('dir') as Direction) ?? 'ltr' }) }],
                toDOM: n => ['section', { 'data-page-block': '', 'data-source': n.attrs.sourcePageId,
                                          dir: n.attrs.dir }, 0] },
    paragraph:{ content: 'inline*', group: 'block', parseDOM: [{ tag: 'p' }], toDOM: () => ['p', 0] },
    bullet_list: { content: 'list_item+', group: 'block', attrs: { tight: { default: false } } },
    ordered_list: { content: 'list_item+', group: 'block', attrs: { order: { default: 1 } } },
    list_item: { content: 'paragraph block*', defining: true, parseDOM: [{ tag: 'li' }], toDOM: () => ['li', 0] },
    chunk:    { inline: true, group: 'inline', atom: true, draggable: false, selectable: true,
                attrs: { chunkId: {}, sourcePageId: {}, inkW: {}, inkH: {},
                         inkOffsetY: {}, boxW: {}, boxH: {}, lineIndex: {}, baselineOffset: {} },
                parseDOM: [{ tag: 'img[data-chunk-id]',
                             getAttrs: d => attrsFrom(d) }],
                toDOM: n => ['img', { 'data-chunk-id': n.attrs.chunkId,
                                      class: 'chunk', contenteditable: 'false',
                                      draggable: 'false',
                                      width: n.attrs.boxW, height: n.attrs.boxH }] },
    footnote_ref: { inline: true, group: 'inline', atom: true, selectable: false,
                    attrs: { id: {} },
                    parseDOM: [{ tag: 'sup[data-footnote-id]',
                                 getAttrs: d => ({ id: d.getAttribute('data-footnote-id') ?? '' }) }],
                    toDOM: n => ['sup', { 'data-footnote-id': n.attrs.id }, ''] },
    text:     { group: 'inline' },
  },
})
```

`list_item` contains `paragraph block*` rather than `inline*` because a typed
list item must be a real paragraph — FR3 requires continuing a list with typed
text, which is exactly the case that rules out the shortcut model
`DESIGN.md` §6.1 rejects.

E19: `parseDOM` matches on `data-chunk-id` and keeps the node even when the
store has no bytes; the node view then renders a placeholder.

### 11.3 Chunk node view

`toDOM` cannot set `src` (it does not know the store), so a node view supplies
it:

```ts
// inline: style.verticalAlign = 'baseline'
//         style.marginBottom = `${-((boxH - inkOffsetY - inkH) * mmPerDocPx)}mm`
//         style.width / style.height from computeChunkScale
```

`verticalAlign: 'baseline'` with a negative `margin-bottom` puts the *ink
bottom* on the text baseline, which is what `DESIGN.md` §6.2 asks for: without
it, a descender in the crop lifts the whole line. `contenteditable="false"` and
`draggable="false"` are on the element (E/D4).

A missing chunk renders `<span class="chunk-missing">▯</span>` with a `title`
naming the id (E14).

### 11.4 Plugins

| Key | Purpose | State |
|---|---|---|
| `footnotes` | `{ entries: Record<Id, FootnoteEntry> }`; transactions carry `setFootnoteText` / `removeFootnote` metas. | recomputed decorations on every doc change, never a transaction of its own (§6.3) |
| `chunkSrc` | resolves `chunkId` → blob URL, and swaps in placeholders for unknown ids | derived in `decorations` |
| `baseDir` | applies `dir` to the rendered `pageBlock` and marks the current block | derived |

Footnote decorations walk the document, assign numbers per `sourcePageId`, and
attach a `<sup>` widget after each ref. The walk is O(refs), tens per document
(§6.3), and runs on every transaction including every keystroke — which is fine
precisely because it touches nothing else.

### 11.5 `ui/editor/to-docview.ts`

```ts
export function toDocView(state: EditorState, store: ChunkImageStore): DocView
```

Pure projection: reads the ProseMirror doc plus footnote plugin state, returns
`DocView` with chunk geometry from the node attrs. This is the seam that keeps
`pdf-lib` from ever importing ProseMirror, and it has a test that asserts
`DocView` survives `structuredClone` unchanged.

### 11.6 Source panel

- Shows the photo of the `pageBlock` the caret is in, falling back to the last
  block before the caret.
- Detected boxes drawn as absolutely positioned `<div>`s, scaled by
  `panelWidth / photoWidthPx`. Non-interactive.
- **Draw mode**: a toolbar toggle. In draw mode the panel captures
  pointerdown/move/up on an overlay and draws a rubber band. On release the
  rectangle is converted to photo coordinates and added to a small tray of
  pending boxes, each with a confirm and a discard button — a two-step confirm
  because a mis-drawn rectangle that is inserted immediately is annoying to
  undo and impossible to notice.
- Confirmed boxes are highlighted in the editor for one second.

### 11.7 Stress route

`?stress=N`:

1. Synthesise N pages on a canvas: each page is ~800×1100, with 6–10 lines of
   8–14 procedurally drawn squiggly glyphs (cubic beziers, randomised), plus
   value noise, a slight blur (three offset draws at 30% alpha), a soft
   lighting gradient, and JPEG compression at 0.7. The degradation is not
   decoration — without it the pipeline sees cleaner input than any real
   photograph.
2. Convert to a `Blob` and hand each one to the **same** `SegmentationClient`
   the upload path uses. Not a mock, not a shortcut (§11 of `DESIGN.md`).
3. On completion, print a report panel: total segmentation time, time from
   page 1 editable, a typing benchmark (median keystroke-to-paint over 200
   programmatic keystrokes), a scroll benchmark (long-task count via
   `PerformanceObserver` and dropped frames via `requestAnimationFrame`), and
   DOM node count.

Pass marks are not fixed here. The procedure is: run it, record the numbers on
this machine, and treat a regression as "materially worse than the recorded
baseline". A hard threshold in a document invites tuning the benchmark.

### 11.8 Toolbar and dialogs

Toolbar: import photos, direction toggle, bullet list, ordered list, lift out
of list, attach footnote, draw box, export.

Export dialog: page size (A4 / A5 / Letter / first photo's aspect / custom),
margins, font size, then HTML or PDF, with a progress bar fed by
`ExportProgress`. Errors appear in the dialog as text (G6) — never a `console`
message and never a silent no-op.

### 11.9 Styles

```css
:root { --font-ui: system-ui, -apple-system, "Segoe UI", Roboto,
                   "Noto Sans Hebrew", "Arial Hebrew", Arial, sans-serif;
        --doc-width: 210mm; --doc-pad: 20mm; --ink: #1a1a1a; }

section[data-page-block] {
  content-visibility: auto;                       /* the primary G4 mechanism */
  contain-intrinsic-size: auto 297mm;             /* the estimate, not a fixed height */
  max-width: var(--doc-width);
  margin: 0 auto 24px;
  padding: var(--doc-pad);
}
img.chunk { vertical-align: baseline; user-select: none; }
sup[data-footnote-id], .fn-marker { font-size: 0.7em; vertical-align: super; }
```

`content-visibility: auto` is the load-bearing declaration (`DESIGN.md` §8.3)
and `contain-intrinsic-size` must be an *estimate*, not a fixed size, or
scrolling jumps. `.chunk` images carry `decoding="async"` and `loading="lazy"`
in the node view, and explicit `width`/`height` so no image participates in a
layout pass.

The source virtualisation escalation (`IntersectionObserver` swapping off-screen
`src` for a 1×1 placeholder) is **not** built. `DESIGN.md` §8.3 names it as the
escalation if measurement says it is needed, and §11.7 is how we find out.
Building both at once means neither is measured.

---

## 12. Testing

`npm test` runs Vitest only, offline, with no browser binaries. Three suites
exist; only two are in that command.

| Suite | Command | Environment | Covers |
|---|---|---|---|
| node | `npm test` | node | `domain/`, `engine/`, `application/`, `platform/` (where stubbed), `tests/` |
| jsdom | `npm test` | jsdom | `ui/`, `platform/` (where a real DOM is needed) |
| e2e | `npm run e2e` | Chromium | acceptance flows, manual-box path, export round trip |

**Layout is tested against canned widths**, so no layout test needs a canvas
(§8.4). **Segmentation is tested against constructed pixel buffers**, so no
segmentation test needs a decoder. Together those are the reason `npm test` can
run in a bare Node container with no native modules — which is the whole of
D2's promise.

### 12.1 Test doubles

Three, and they exist to prove substitutability rather than to be convenient:

- `tests/fake-measurer.ts` — `TextMeasurer` as a monospace model.
- `tests/fake-segmentation.ts` — returns a fixed box list, used by the
  application use-cases. Its existence is the proof of the Liskov claim in
  `DESIGN.md` §5.3.
- `tests/fake-pagination.ts` — returns a fixed `PageLayout`. Used to prove the
  exporters draw what they are told, §9.1.

### 12.2 Real-handwriting regression

§6.13, three fixtures, `tests/fixtures/*.gray` + `manifest.json`. `expectedWords`
and `tolerance` are filled in during M2 and never silently updated.

### 12.3 Export fidelity tests

- **HTML:** parse the exported string, assert structure and content without a
  DOM (regex + a tiny tag scanner). Assert no `http`, no `<script`.
- **PDF:** use `pdfjs-dist` (already a dependency of the old build, and a
  devDependency here) in the node project to extract text per page and compare
  with the logical text of the source document. This is the only automated way
  to catch "the Hebrew came out backwards", and it is the highest-value test in
  the project.
- **Both:** given a `FakePagination` layout with distinctive coordinates, assert
  each renderer emits those coordinates.

### 12.4 jsdom scope

ProseMirror needs a DOM but not layout, so these are real: schema round trips
(`parseDOM`/`toDOM` for every node type), command behaviour (list wrapping,
direction flip, footnote attach), node view rendering including the missing
chunk placeholder, the footnote panel's dispatch, the source panel's draw
gesture, and the export dialog's error rendering.

### 12.5 e2e scope

`npm run e2e`, six specs mirroring the acceptance list:

1. load, upload one photo, chunks appear, source panel shows boxes
2. type between chunks, delete a chunk
3. draw a box, confirm, chunk inserted
4. three chunks into a bulleted list; footnote attached, marker and numbered
   footnote both visible
5. export HTML, assert the file contains no `http`; export PDF, assert the file
   header and non-trivial length
6. `?stress=20` completes and reports timings without console errors

Run only against a locally installed Chromium. `npm test` never invokes it
(E10), and the Docker image contains no browser.

---

## 13. Build plan

Twelve milestones in dependency order. Each names its exit criterion, and a
milestone is not started until the previous one's criterion is met.

The implementation is AI-written, which changes the *shape* of the risk rather
than removing it. An agent can produce a plausible twelve-stage segmentation
pipeline in minutes; it cannot tell a plausible one from a correct one without
the tests. So the plan is ordered by **where being wrong is expensive**, and
the expensive places are front-loaded: M2 (segmentation quality) and M8 (Hebrew
PDF) are the two places where a subtle, silent, demo-looking-correct failure is
possible. Everything else fails loudly and is cheap to fix.

### M0 — Scaffold
**Goal:** the offline rebuild works before any product code exists.
**Exit:** §2.7, all five items.
**Cuts:** none. This is the cheapest milestone in the project and the one that
protects every later hour.

### M1 — Domain and ports
**Goal:** types, ids, chunk-scale, footnote numbering, the five port interfaces,
and the three fakes.
**Exit:** `npm test` green; every §6.1–6.3 test present; `domain/` imports
nothing outside itself (assert with a source-text test over the directory).

### M2 — Segmentation
**Goal:** `segmentSync` works end to end on synthetic buffers.
**This is the highest-risk milestone in the project.** Segments 11 stages of
image code whose only real judge is a photograph.
**Exit:** every §6.5–6.13 test green, including the three real fixtures with
recorded tolerances, the `pipeline.ts` no-literals assertion, the no-recognition
grep, and the deliberate-degradation test proving the fixture test can go red.
**Notes:** fill `manifest.json` here. If the fixtures do not pass, stop and fix
segmentation before writing anything else — every later milestone assumes a
working segmenter, and a broken one makes every later bug ambiguous.

### M3 — Platform and workers
**Goal:** decode, crop, encode, store, worker, streaming client.
**Exit:** §7.1–7.5 tests green; a real photo goes through the worker and
yields encoded chunks; the main thread stays responsive (measurable by
instrumenting a frame counter during a 10-photo import).

### M4 — Editor
**Goal:** ProseMirror schema, node views, plugins, commands, toolbar; a photo
lands in an editable document.
**Exit:** §11.2–11.5 jsdom tests green; typing between chunks, deleting a
chunk, and undo all work in a real browser by hand.
**Notes:** M4 is where the app becomes demonstrable. If time is short, this is
the milestone to protect — a judge needs to see a document.

### M5 — Source panel and draw-a-box
**Goal:** panel shows the current photo with detected boxes; manual boxes
become chunks.
**Exit:** §11.6 tests green; FR5's two insertion cases both work by hand.

### M6 — Footnotes
**Goal:** attach, marker, numbering per source photo, editing panel.
**Exit:** §6.3 and §11.4 tests green; FR4's editor-side behaviour visible by
hand.

### M7 — Pagination and HTML export
**Goal:** `paginate` + `text-layout` + `bidi` + HTML renderer.
**Exit:** §8.1–8.3 and §9.2 tests green; an exported HTML file opens offline in
a browser with chunks, lists, footnotes and correct RTL.
**Why HTML before PDF:** HTML export satisfies half of acceptance 5 at a
fraction of the risk. Getting it done de-risks acceptance before the hardest
code in the project starts.

### M8 — PDF export
**Goal:** `pdf-lib` renderer with bidi reordering and the embedded font.
**Exit:** §9.3 and §9.5 tests green; `pdfjs-dist` extracts the Hebrew text in
logical order; the exported file opens in a real viewer with visible glyphs.
**Notes:** if the font renders blank, E1 (`subset: false`) is the first thing
checked, then the file's licensing/format, and only then the glyph coverage
test. Do not add a fallback renderer (D14).

### M9 — Stress route
**Goal:** `?stress=N` through the real pipeline, with the report panel.
**Exit:** §11.7 procedure runs at N=20 and N=100; results recorded in
`docs/PERFORMANCE.md`, replacing the previous implementation's file.

### M10 — e2e
**Goal:** the six specs in §12.5.
**Exit:** `npm run e2e` green against a local Chromium. Not in `npm test`.
**Cuts:** if time is short, this milestone is the first to cut entirely. It is
real value but it is the only milestone whose absence is invisible to a judge
running the README.

### M11 — README, Docker, final pass
**Goal:** README with install/run/test/export and the honest scope list
(recognition, persistent storage, columns, mobile — plus **Arabic and other
joining scripts**, per `DESIGN.md` §14); `.env.example`; Docker verified with
`--network none`; every acceptance item walked once, by hand, from a clean
checkout.
**Exit:** all six acceptance items pass on a clean machine.

### 13.1 Cut order

If the schedule slips, cut in this order, and only in this order:

1. **M10 e2e** — invisible to a judge.
2. **M9 stress route's N=100 run** — keep the route, run it smaller.
3. **The source virtualisation escalation** — already not built (§11.9).
4. **Export dialog custom page size** — the defaults cover acceptance 5.
5. **Multi-column reading order** — already out of scope (D11).

Never cut: segmentation quality (M2), the RTL chunk-ordering invariant
(§10.4), the no-recognition boundary, or `npm test` passing offline. Those four
are the product.

---

## 14. Acceptance mapping

Every acceptance item, traced to the milestone and the tests that prove it.

| # | Acceptance item | Milestone | Proof |
|---|---|---|---|
| 1 | Install, run the offline test command, build | M0 | `docker run --network none` exits 0; `npm test` green |
| 2 | Photo → chunks, boxes on the source panel | M2, M3, M4, M5 | §6.13 fixtures; §7.4; §11.6 |
| 3 | Type between chunks, delete one, draw a box | M4, M5 | §11.2–11.5 jsdom tests; §10.3 |
| 4 | Three chunks as a bulleted list; footnote with marker and numbered entry at the bottom of that page | M4, M6 | §11.4; §6.3; §8.2 (export-side numbering) |
| 5 | Export HTML and PDF, both open offline, both complete | M7, M8 | §9.2 (no `http`), §12.3 (PDF text extraction), §12.5 |
| 6 | `?stress=100` types and scrolls without lag | M9 | §11.7 report; `docs/PERFORMANCE.md` |

Requirement-level trace:

| SRS | Where |
|---|---|
| FR1 direction per upload | §10.1, §6.5 |
| FR2 pages per photo, no reflow, photos appendable | §6.1 (`pageBlock`), §10.1 |
| FR3 lists mixing chunks and typed text | §11.2 (`list_item` contains `paragraph`), §11.8 |
| FR4 footnotes, restart per page | §6.3 (editor side), §8.2 (export side) |
| FR5 draw a box | §10.3, §11.6 |
| FR6 plain-language failure | §6.14, §10.1 |
| FR7 two export formats, offline, complete | §9.2, §9.3 |
| FR8 progress, never freezes | §7.4, §7.5, §10.1 |

---

## 15. Risks and deviations

### 15.1 Deviations from DESIGN.md

| # | Deviation | Reason |
|---|---|---|
| 1 | **Playwright is retained** as `npm run e2e`, excluded from `npm test` and from the Docker `CMD` (E10). D10 said exclude it entirely. | Agreed. Acceptance 2–6 keep automated coverage; the single-command offline rebuild is unaffected because nothing invokes Playwright. `DESIGN.md` D10 and §12 have been updated to match. |
| 2 | **Fixtures are 4.2 MB**, not the "100–200 KB each" `DESIGN.md` §10 estimated. | Raw 8-bit luma of three real photographs, long edge capped at 1600 px. Keeping them raw avoids a decoder in `npm test`; shrinking them further starts to alter stroke detail, which is the thing the fixture exists to measure. |
| 3 | **`pdf-lib` embeds the font without subsetting** (E1). | Removes the pdf-lib #688 blank-glyph failure class rather than mitigating it. |
| 4 | **Chunk-scale is per photo**, not per document (E5). | A strict generalisation of §8.2, needed as soon as two photos in one document have different pixel widths. |

### 15.2 Risks carried into implementation

| Risk | Where it is answered | Residual |
|---|---|---|
| Segmentation regresses on real photographs | §6.13 fixtures with recorded tolerances, plus a test that proves they can go red | Tolerance must be set from a real run, not guessed; a fixture recorded too loosely guards nothing |
| Hebrew PDF renders reversed | §8.3 `visualRuns`, §9.3, §12.3 text extraction | Only Latin/Hebrew/digits/parentheses are covered. Other RTL scripts are non-joining too, but their *punctuation and shaping* are not verified |
| Font embeds and renders blank | E1 `subset: false`, §9.5 coverage test, one real-viewer check in M8 | A viewer that disagrees with `pdfjs-dist` is still possible; the M8 manual check is what catches it |
| ProseMirror paste/undo of chunks misbehaves | §11.2 parse rules, `draggable: false`, jsdom round-trip tests | Real drag-and-drop is hard to test in jsdom; covered only by e2e |
| Large HTML export exhausts memory | §9.2 part-array + `Blob`, §9.6 | 25 MB of `BlobPart` is fine on desktop, marginal on a phone — the SRS does not require mobile |
| 3,000 chunks degrade typing | §11.9 `content-visibility`, §11.7 measurement | If it is not enough, the escalation is source virtualisation (§11.9) — not structural virtualisation, which would break native selection |
| Scope creep into recognition | §6.10's grep test over `engine/segmentation` | Only guards the segmentation tree; a recognition attempt elsewhere would not be caught. The README's scope list is the second line of defence |

### 15.3 The three things most likely to be wrong

Recorded now, while they are hypothetical, because each will look correct:

1. **The fixture tolerances in `manifest.json`.** If they are set from a run
   that was itself wrong, the regression test guards nothing and reports
   confidence it has not earned.
2. **The line baseline vs the text baseline in export.** The editor and the
   paginator compute baselines separately (§8.1 requires they agree to a pixel).
   They will agree in the tests and disagree by a few points in a real export
   because a real `TextMeasurer` and the fake one disagree about ascent.
3. **`visualRuns` output versus `paginate`'s x positions.** §9.3 asserts they
   agree within 1%. If they do not, the fix is to have `paginate` store
   per-run x positions *after* bidi rather than before — a change to the type in
   §4, and therefore a change to this document, made deliberately rather than
   discovered in the renderer.

