# Scrivio Lite

Scrivio turns photos of handwritten notes into an editable document made from
image chunks. It never recognizes or transcribes handwriting: typed text and
the original handwriting images live together.

## Requirements

- Node.js 22 (the required version is recorded in `.nvmrc`)
- Docker, if using the container workflow

Scrivio is a static, in-memory web app. It has no backend, accounts, network
calls, persistent storage, or runtime configuration. `.env.example` is kept as
an explicit statement of that fact.

## Setup

```sh
npm ci
```

`package-lock.json` is committed and `npm ci` is the reproducible install
command. Do not use a global install.

## Run

```sh
npm run dev
```

Open the local URL printed by Vite. A production preview is available with:

```sh
npm run build
npm run preview
```

## Test

The single offline test command is:

```sh
npm test
```

It runs the Vitest node and jsdom projects and does not download browsers or
contact a service. Static checks are also available with `npm run typecheck`.
End-to-end tests are separate because they require a locally installed
Chromium:

```sh
npm run e2e:install
npm run e2e
```

## Docker

The Docker image uses Node 22, installs from the committed lockfile, and runs
the same offline test command as the judge:

```sh
docker build -t scrivio .
docker run --rm --network none scrivio
```

## Scope

Included: JPG/PNG photo import, batch progress, LTR and RTL direction,
geometry-only word segmentation, editable typed text and image chunks, lists,
typed footnotes, manual draw-a-box chunks, source-photo overlays, self-contained
HTML export, real PDF export, and a stress route for large documents.

Permanently out of scope: OCR or any handwriting recognition, transcription,
nikud/diacritics, persistent storage, accounts, fixed page-layout customization,
columns, mobile layout, and Arabic or other joining/complex scripts.

## Development contract

Tests are written before production code. No implementation is added unless a
test names its behavior. The accepted design and the complete test-first module
plan are in [`docs/DESIGN.md`](docs/DESIGN.md) and
[`docs/DETAILED-DESIGN.md`](docs/DETAILED-DESIGN.md).
