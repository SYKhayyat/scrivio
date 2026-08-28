# AGENTS

- Build: `nix shell nixpkgs#nodejs_24 --command bash -c 'npm run build'`
- Dev: `nix shell nixpkgs#nodejs_24 --command bash -c 'npm run dev'`
- Test: `nix shell nixpkgs#nodejs_24 --command bash -c 'npm test'`
- Typecheck: `nix shell nixpkgs#nodejs_24 --command bash -c 'npx tsc --noEmit'`
- WASM: `cargo build --manifest-path crates/scrivio-wasm/Cargo.toml --target wasm32-unknown-unknown` (requires wasm-pack for pkg)
