import type { SerializedDocument, DocumentElement } from '../core/types';
import { loadWasmBackend, type KsavExportElement } from '../engine/wasm/wasm-backend';

/**
 * Serialize a Scrivio document as a Ksav document file (`.ksav`) — the format
 * SYKhayyat/ksav reads: either plain Typst text, or a JSON wrapper
 * `{"format":"ksav-document","body":…,"assets":[…],"config":{…}}` when the
 * document carries images.
 *
 * The wrapper mirrors what Ksav's `parseDoc`/`serializeDoc` write: the body is
 * Typst source, and each handwritten chunk is referenced **by name**
 * (`#image("chunk-<id>.jpg", width: …)`); the image bytes travel alongside in
 * the `assets` array, because Typst has no base64 decoder and Ksav's engine
 * resolves asset names through its own file resolver. Direction and language
 * are carried in the `config` object (`dir`, `lang`), which Ksav's `DocConfig`
 * reads for page setup and the compile.
 *
 * The Typst **body** (header + element flow + text escaping) is built by the
 * Rust engine (`ksav_body_typst`); this module only assembles the thin JSON
 * wrapper and base64-encodes the chunk images, which are pure I/O.
 */
export async function exportToKsavTypst(doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>): Promise<string> {
  const wasm = await loadWasmBackend();
  if (!wasm) throw new Error('Rust/WASM engine not available to build the Ksav export');
  return exportToKsavTypstWith(wasm.ksav_body_typst.bind(wasm), doc, chunkBytes);
}

/**
 * The wrapper assembly, separated from the wasm load so tests can feed the real
 * Rust serializer directly (and so the browser keeps the same code path).
 *
 * `serializeBody` produces the Typst body string from a compact element list
 * + the writing direction; in production it is Rust's `ksav_body_typst`.
 */
export function exportToKsavTypstWith(
  serializeBody: (elements: KsavExportElement[], rtl: boolean) => string,
  doc: SerializedDocument,
  chunkBytes: Map<string, Uint8Array>,
): string {
  const rtl = doc.settings.direction === 'rtl';
  const elements = doc.elements.map((el) => toKsavElement(el, chunkBytes));
  const body = serializeBody(elements, rtl);

  // Assets the body references, plus a config that carries the writing
  // direction — the two things that make a bare-text file insufficient.
  const assets = collectAssets(doc, chunkBytes);
  const config = {
    dir: rtl ? 'rtl' : 'ltr',
    lang: rtl ? 'he' : 'en',
  };

  if (assets.length === 0) return body;
  return (
    JSON.stringify(
      {
        format: 'ksav-document',
        version: 1,
        title: doc.name,
        body,
        assets,
        config,
      },
      null,
      2,
    ) + '\n'
  );
}

/** Reduce a document element to the compact shape the Rust serializer needs. */
export function toKsavElement(el: DocumentElement, chunkBytes: Map<string, Uint8Array>): KsavExportElement {
  switch (el.kind) {
    case 'typed-word':
      return { kind: 'typed-word', text: el.text };
    case 'line-break':
      return { kind: 'line-break' };
    case 'paragraph-break':
      return { kind: 'paragraph-break' };
    case 'bullet':
      return { kind: 'bullet' };
    case 'footnote-ref':
      return { kind: 'footnote-ref', number: el.number };
    case 'chunk':
      return { kind: 'chunk', id: el.id, width: el.width, hasBytes: chunkBytes.has(el.id) };
  }
}

/** The `assets` array Ksav expects: `{name, kind, data}` with base64 bytes. */
export function collectAssets(doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>): Array<{ name: string; kind: string; data: string }> {
  const assets: Array<{ name: string; kind: string; data: string }> = [];
  for (const el of doc.elements) {
    if (el.kind !== 'chunk') continue;
    const bytes = chunkBytes.get(el.id);
    if (!bytes) continue;
    assets.push({ name: `chunk-${el.id}.jpg`, kind: 'image', data: bytesToBase64(bytes) });
  }
  return assets;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}