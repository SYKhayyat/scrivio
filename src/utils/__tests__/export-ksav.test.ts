// @vitest-environment node
//
// The Ksav body is built by the Rust engine, so this test loads the real wasm
// module the way scripts/wasm-smoke.mjs does (passing the .wasm bytes directly;
// under Node the wasm-pack --target web glue cannot self-fetch its URL) and
// drives Rust's `ksav_body_typst` through the TS wrapper. This keeps the whole
// serializer Rust-driven while still unit-testing the JSON/asset wrapper glue.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportToKsavTypstWith } from '../export-ksav';
import type { KsavExportElement } from '../../engine/wasm/wasm-backend';
import type { SerializedDocument } from '../../core/types';

import { DEFAULT_CONFIG } from '../../core/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '../../wasm-pkg');
const glue = path.join(pkg, 'scrivio_wasm.js');
const binary = path.join(pkg, 'scrivio_wasm_bg.wasm');

let ksavBody: (elements: KsavExportElement[], rtl: boolean) => string;

beforeAll(async () => {
  const engine = await import(pathToFileURL(glue).href);
  await engine.default({ module_or_path: new Uint8Array(fs.readFileSync(binary)) });
  ksavBody = engine.ksav_body_typst;
});

const serialize = (doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>) =>
  exportToKsavTypstWith(ksavBody.bind(ksavBody), doc, chunkBytes);

const baseDoc: SerializedDocument = {
  id: 'doc-1',
  name: 'Test Doc',
  createdAt: 0,
  updatedAt: 0,
  settings: { ...DEFAULT_CONFIG.document, direction: 'rtl' },
  elements: [
    { kind: 'typed-word', id: 'w1', text: 'שלום', fontFamily: 'serif', fontSize: 3, bold: false, italic: false, underline: false, x: 0, y: 0, width: 10, height: 3 },
  ],
  footnotes: [],
};

describe('exportToKsavTypst (Rust body)', () => {
  it('wraps a document with images in the ksav-document JSON format', () => {
    const doc: SerializedDocument = {
      ...baseDoc,
      elements: [
        ...baseDoc.elements,
        { kind: 'chunk', id: 'c1', sourceImageId: 'scan.jpg', boundingBox: { x: 1, y: 2, w: 30, h: 10 }, x: 0, y: 0, width: 25.4, height: 8.5 },
      ],
    };
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const out = serialize(doc, new Map([['c1', bytes]]));

    const v = JSON.parse(out);
    expect(v.format).toBe('ksav-document');
    expect(v.version).toBe(1);
    expect(v.title).toBe('Test Doc');
    expect(v.config).toEqual({ dir: 'rtl', lang: 'he' });

    // The body references the image by name (Typst has no base64 decoder).
    expect(v.body).toContain('#image("chunk-c1.jpg", width: 25.4mm)');
    expect(v.body).toContain('#set text(lang: "he", dir: rtl');

    // The bytes travel in the assets array.
    expect(v.assets).toHaveLength(1);
    expect(v.assets[0].name).toBe('chunk-c1.jpg');
    expect(v.assets[0].kind).toBe('image');
    expect(atob(v.assets[0].data)).toBe(String.fromCharCode(...bytes));
  });

  it('ltr documents carry the english direction and language', () => {
    const doc: SerializedDocument = { ...baseDoc, settings: { ...DEFAULT_CONFIG.document, direction: 'ltr' } };
    const out = serialize(doc, new Map());
    // No chunks → plain Typst text, but the direction still lands in the body.
    expect(out.startsWith('{')).toBe(false);
    expect(out).toContain('#set text(lang: "en", dir: ltr');
  });

  it('stays plain Typst text when the document carries no images', () => {
    const out = serialize(baseDoc, new Map());
    expect(out.startsWith('{')).toBe(false);
    expect(out).toContain('#set text(lang: "he", dir: rtl');
    expect(out).toContain('שלום');
  });

  it('escapes Typst markup in typed text', () => {
    const doc: SerializedDocument = {
      ...baseDoc,
      elements: [
        { kind: 'typed-word', id: 'w2', text: '50% off #1', fontFamily: 'serif', fontSize: 3, bold: false, italic: false, underline: false, x: 0, y: 0, width: 10, height: 3 },
      ],
    };
    const out = serialize(doc, new Map());
    expect(out).toContain('50% off \\#1');
  });
});