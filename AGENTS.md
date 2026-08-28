# AGENTS

Cross-platform — Linux, macOS, Windows (no Nix required).

- Install: `npm install` (Node 20+), `rustup target add wasm32-unknown-unknown` (Rust 1.75+)
- Build: `npm run build`  (typecheck + vite production build)
- Dev: `npm run dev`      (http://localhost:5173)
- Test: `npm test`        (vitest, 18 tests)
- Typecheck: `npx tsc --noEmit`
- WASM: `cargo build --manifest-path crates/scrivio-wasm/Cargo.toml --target wasm32-unknown-unknown`
- WASM pkg: `wasm-pack build crates/scrivio-wasm --target web --out-dir src/wasm-pkg`
- E2E: `npx playwright test` (once added)
- Performance budgets: segmentation <1s (downscaled to 3MP), reflow <16ms/60fps, 5000 chunks <200MB (LOD+eviction)
