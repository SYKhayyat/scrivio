// Guard that runs before `dev` and `build`.
//
// The Rust→WASM bundle in `src/wasm-pkg/` is the real engine — segmentation,
// cropping and reflow all run in Rust (`crates/scrivio-wasm`). It is build
// output and therefore not committed (only the `.d.ts` type files are, so a
// fresh checkout still typechecks). That means a fresh clone needs to build it
// before it can dev/build, and the failure must say so clearly rather than
// surfacing as a cryptic "could not resolve ...scrivio_wasm.js" deep in the
// bundler. Mirror of ksav's `wasm-smoke.mjs`: missing bundle → loud exit.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const glue = path.resolve(here, '../src/wasm-pkg/scrivio_wasm.js');

if (!existsSync(glue)) {
  console.error(
    [
      '',
      '  Rust/WASM engine is missing.',
      '',
      '  The app needs its Rust engine before it can run or build. Build it first:',
      '',
      '    npx wasm-pack build crates/scrivio-wasm --target web --out-dir src/wasm-pkg',
      '    # or: npm run wasm:build',
      '',
      '  (requires wasm-pack and the wasm32-unknown-unknown Rust target)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}