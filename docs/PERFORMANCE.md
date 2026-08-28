# Performance — real and fast, everywhere

Budgets enforced in code and tests:

- **Segmentation**: <1s per full-page photo on mid device. Achieved by: downscale long edge to 3000px before binarize (10-20x), pre-allocated integral image, union-find CC, lazy JPEG crop (quality 85) only for visible chunks.
- **Reflow**: <16ms for any edit (60fps). O(n) single pass + dirty-region `reflowFrom(index)` — prefix already flowed, suffix only. See `ReflowEngine.layout()`. Bench: 5000 elements in microseconds.
- **Rendering**: Offscreen canvas cache per chunk + virtualized DOM (only visible nodes). No `getBoundingClientRect` in loops. Single `requestAnimationFrame` batch.
- **Storage**: IndexedDB batched writes + journal + periodic compact; chunk crops JPEG ~3-5x smaller than PNG.
- **Startup**: Split WASM (reflow small, segmentation large lazy). Service-worker caches WASM after first load.

Cross-platform: pure npm + cargo. No Nix, no Docker. `npm ci && npm run build` on Linux/macOS/Windows. CI runs on all three.

Verify: `npm test` includes reflow bench; `npm run build` asserts bundle; WASM `wasm-opt` with `opt-level=3 + lto`.
