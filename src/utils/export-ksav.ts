import type { SerializedDocument } from '../core/types';

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
 */
export function exportToKsavTypst(doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>): string {
  const rtl = doc.settings.direction === 'rtl';
  const body = buildBody(doc, chunkBytes);

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

/** The Typst source: a direction/language header, then the document flow. */
function buildBody(doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>): string {
  const rtl = doc.settings.direction === 'rtl';
  const out: string[] = [];
  out.push(`#set text(lang: ${rtl ? '"he"' : '"en"'}, dir: ${rtl ? 'rtl' : 'ltr'}, size: 11pt)\n`);

  for (const el of doc.elements) {
    switch (el.kind) {
      case 'typed-word':
        out.push(escapeTypstText(el.text) + ' ');
        break;
      case 'line-break':
        out.push('\\\n');
        break;
      case 'paragraph-break':
        out.push('\n\n');
        break;
      case 'bullet':
        out.push('• ');
        break;
      case 'footnote-ref':
        out.push('[' + el.number + ']');
        break;
      case 'chunk': {
        const bytes = chunkBytes.get(el.id);
        if (bytes) {
          const name = `chunk-${el.id}.jpg`;
          out.push(`#image("${name}", width: ${fmt(el.width)}mm) `);
        }
        break;
      }
    }
  }

  return out.join('');
}

/** The `assets` array Ksav expects: `{name, kind, data}` with base64 bytes. */
function collectAssets(doc: SerializedDocument, chunkBytes: Map<string, Uint8Array>): Array<{ name: string; kind: string; data: string }> {
  const assets: Array<{ name: string; kind: string; data: string }> = [];
  for (const el of doc.elements) {
    if (el.kind !== 'chunk') continue;
    const bytes = chunkBytes.get(el.id);
    if (!bytes) continue;
    assets.push({ name: `chunk-${el.id}.jpg`, kind: 'image', data: bytesToBase64(bytes) });
  }
  return assets;
}

function fmt(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : String(v);
}

/** Escape Typst markup special characters for inline text. */
function escapeTypstText(text: string): string {
  return text.replace(/([#$\\*_`-])/g, '\\$1');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
