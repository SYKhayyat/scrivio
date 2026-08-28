// Does the Rust engine actually run?
//
// `npm run wasm:build` succeeding proves the crate compiled for
// wasm32-unknown-unknown. It does not prove the module instantiates, and it
// certainly does not prove it can segment a page: a panic on first use, a bad
// wasm-bindgen boundary, a missed export — all of those link cleanly and fail
// the moment the app calls in. Since the built package is git-ignored and
// produced locally, nothing would otherwise exercise this path.
//
// So this loads the real module the way the browser does (the wasm-pack
// `--target web` glue + the `.wasm` binary) and drives the engine through the
// same surface the app touches: segment a synthetic handwriting page into
// chunks, crop one out, and run a flat reflow. Node rather than a browser on
// purpose — the module and its JS glue are identical in both.
//
// Mirrors ksav's `wasm-smoke.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '../src/wasm-pkg');

const glue = path.join(pkg, 'scrivio_wasm.js');
const binary = path.join(pkg, 'scrivio_wasm_bg.wasm');
for (const f of [glue, binary]) {
  if (!fs.existsSync(f)) {
    console.error(`missing ${f} — run \`npm run wasm:build\` first`);
    process.exit(1);
  }
}

const started = Date.now();
const engine = await import(pathToFileURL(glue).href);
const bytes = fs.readFileSync(binary);
// `--target web` expects to fetch its own URL; hand it the bytes instead.
await engine.default({ module_or_path: bytes });
console.log(`instantiated in ${Date.now() - started} ms (${(bytes.length / 1048576).toFixed(1)} MB)`);

const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

// A 4x4 grid of dark "words" on a white page — the segmentation should find
// them all and nothing spurious.
const W = 400;
const H = 300;
const cell = 50;
const raw = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    // Fill the cell's centre with a dark "word" blob.
    const inBlob = (x % cell) > 10 && (x % cell) < 40 && (y % cell) > 10 && (y % cell) < 40;
    const v = inBlob ? 40 : 245;
    const o = (y * W + x) * 3;
    raw[o] = v;
    raw[o + 1] = v;
    raw[o + 2] = v;
  }
}
const pngBuf = await sharp(raw, { raw: { width: W, height: H, channels: 3 } })
  .png()
  .toBuffer();

// --- Fully-qualified engine surface the app uses (Direction 'Ltr'). ---
let chunks;
try {
  chunks = engine.segment_image(new Uint8Array(pngBuf), 'Ltr', null, null);
  check('segment_image returns chunks', Array.isArray(chunks) && chunks.length > 0, JSON.stringify(chunks?.length));
  check('RTL also accepted', Array.isArray(engine.segment_image(new Uint8Array(pngBuf), 'Rtl', null, null)));
  check('regions parameter accepted', Array.isArray(engine.segment_image(new Uint8Array(pngBuf), 'Ltr', 1, [])));
} catch (e) {
  check('segment_image runs', false, e?.message);
}

if (chunks && chunks.length > 0) {
  const c = chunks[0];
  const hasBBox =
    c && typeof c.boundingBox === 'object' &&
    typeof c.x !== 'undefined' && typeof c.x === 'number';
  // wasm-pack returns { id, boundingBox, lineIndex, positionOnLine, ... }
  check('chunk shape', !!c && typeof c === 'object' && 'boundingBox' in c && Number.isFinite(Number(c.lineIndex)), JSON.stringify(c));
  // Crop the first chunk out at its bbox.
  try {
    const out = engine.crop_chunk(new Uint8Array(pngBuf), Math.round(c.boundingBox?.x ?? c.x) || 0, Math.round(c.boundingBox?.y ?? c.y) || 0, 30, 30, 85);
    check('crop_chunk returns bytes', out instanceof Uint8Array && out.length > 0, `len=${out?.length}`);
  } catch (e) {
    check('crop_chunk runs', false, e?.message);
  }
}

try {
  // Flat reflow over 3 words + a paragraph break (kind codes: 0 generic, 1 line, 2 paragraph).
  const kinds = new Uint8Array([0, 0, 1, 0, 2, 0, 0]);
  const widths = new Float64Array([100, 100, 0, 120, 0, 90, 90]);
  const heights = new Float64Array([20, 20, 0, 20, 0, 20, 20]);
  const out = engine.reflow_flat(kinds, widths, heights, 210, 12, 18, 18);
  check('reflow_flat returns positions', out instanceof Float64Array && out.length === kinds.length * 2, `len=${out?.length}`);
  // First element sits at the left margin, second stacks after the first.
  if (out instanceof Float64Array) {
    check('left margin respected', Math.abs(out[0] - 18) < 0.001, `x0=${out[0]}`);
    // Words are 100+ mm wide in a 174 mm content width, so the second word must
    // wrap to the next line, landing at the left margin *below* the first word.
    const [x0, y0, x1, y1] = [out[0], out[1], out[2], out[3]];
    check('overflow wraps to next line', x1 === x0 && y1 > y0, `x0=${x0} y0=${y0} x1=${x1} y1=${y1}`);
  }
} catch (e) {
  check('reflow_flat runs', false, e?.message);
}

try {
  // Page-break positions: laid-out elements at y=0, 55, 56, 110 with a 50 mm
  // body height → pages start at element y once y crosses each 50 mm boundary
  // (after a break at 55 the next page ends at 100, so 56 does NOT start one).
  const ys = new Float64Array([0, 10, 55, 56, 110]);
  const breaks = engine.reflow_page_breaks(ys, 50);
  const expected = new Float64Array([55, 110]);
  check(
    'reflow_page_breaks returns page starts',
    breaks instanceof Float64Array && Array.from(breaks).join(',') === Array.from(expected).join(','),
    `breaks=${Array.from(breaks).join(',')}`,
  );
} catch (e) {
  check('reflow_page_breaks runs', false, e?.message);
}

try {
  // Visible indices: band [5, 15] mm. Elements 1 and 2 overlap it; 0 and 3 don't.
  const ys = new Float64Array([0, 10, 18, 30]);
  const hs = new Float64Array([4, 4, 6, 4]);
  const vis = engine.reflow_visible_indices(ys, hs, 5, 15);
  check('reflow_visible_indices returns culled indices', vis instanceof Uint32Array && Array.from(vis).join(',') === '1', `vis=${Array.from(vis).join(',')}`);
} catch (e) {
  check('reflow_visible_indices runs', false, e?.message);
}

try {
  // Ksav/Typst body: header + escaping + image line, built in Rust.
  const body = engine.ksav_body_typst(
    [
      { kind: 'typed-word', text: '50% off #1' },
      { kind: 'chunk', id: 'c1', width: 25.4, hasBytes: true },
      { kind: 'paragraph-break' },
    ],
    true,
  );
  check(
    'ksav_body_typst builds body',
    typeof body === 'string' &&
      body.includes('#set text(lang: "he", dir: rtl') &&
      body.includes('50% off \\#1') &&
      body.includes('#image("chunk-c1.jpg", width: 25.4mm)'),
    `body=${body}`,
  );
} catch (e) {
  check('ksav_body_typst runs', false, e?.message);
}

console.log('');
if (failures.length) {
  console.error(`wasm smoke failed (${failures.length}): ${failures.join(', ')}`);
  process.exit(1);
}
console.log('all wasm smoke checks passed');