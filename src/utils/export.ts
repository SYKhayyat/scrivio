import { PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import type { SerializedDocument } from '../core/types';
import { loadWasmBackend } from '../engine/wasm/wasm-backend';

export async function exportToPdf(doc: SerializedDocument, chunkImages: Map<string, Uint8Array>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageWidthPt = (doc.settings.pageWidthMm / 25.4) * 72;
  const pageHeightPt = ((doc.settings.bodyHeightMm + doc.settings.footnoteHeightMm) / 25.4) * 72;
  const bodyHeight = doc.settings.bodyHeightMm;
  const mmToPt = 72 / 25.4;

  // Which element lands on which page is computed in Rust (pdf_page_layout);
  // the TS loop below only converts mm→pt and issues the pdf-lib draw calls.
  // The inline fallback (identical math) runs only when the wasm module is
  // unavailable (jsdom unit tests).
  const backend = await loadWasmBackend();
  const layout = backend
    ? Array.from(backend.pdf_page_layout(new Float64Array(doc.elements.map((e) => e.y)), bodyHeight))
    : null;

  const pages: PDFPage[] = [];
  if (layout) {
    let pageCount = 1;
    for (let i = 0; i < doc.elements.length; i++) pageCount = Math.max(pageCount, layout[i * 2] + 1);
    for (let i = 0; i < pageCount; i++) pages.push(pdf.addPage([pageWidthPt, pageHeightPt]));
  } else {
    pages.push(pdf.addPage([pageWidthPt, pageHeightPt]));
  }

  let pageOffsetY = 0;
  for (let i = 0; i < doc.elements.length; i++) {
    const el = doc.elements[i];
    let page: PDFPage;
    let yLocal: number;
    if (layout) {
      page = pages[layout[i * 2]]!;
      yLocal = layout[i * 2 + 1];
    } else {
      page = pages[pages.length - 1]!;
      if (el.y >= pageOffsetY + bodyHeight) {
        page = pdf.addPage([pageWidthPt, pageHeightPt]);
        pages.push(page);
        pageOffsetY += bodyHeight;
      }
      yLocal = el.y - pageOffsetY;
    }
    const xPt = el.x * mmToPt;
    const yPt = pageHeightPt - (yLocal + el.height) * mmToPt;

    if (el.kind === 'chunk') {
      const bytes = chunkImages.get(el.id);
      if (bytes) {
        try {
          const img = await pdf.embedJpg(bytes);
          page.drawImage(img, { x: xPt, y: yPt, width: el.width * mmToPt, height: el.height * mmToPt });
        } catch {
          page.drawRectangle({ x: xPt, y: yPt, width: el.width * mmToPt, height: el.height * mmToPt, color: rgb(0.9, 0.9, 0.9) });
        }
      }
    } else if (el.kind === 'typed-word') {
      page.drawText(el.text + ' ', {
        x: xPt,
        y: yPt,
        size: el.fontSize * mmToPt,
        font,
        color: rgb(0, 0, 0),
      });
    } else if (el.kind === 'footnote-ref') {
      page.drawText(String(el.number), {
        x: xPt,
        y: yPt + 2 * mmToPt,
        size: 6,
        font,
        color: rgb(0.2, 0.2, 0.8),
      });
    } else if (el.kind === 'bullet') {
      page.drawText('•', { x: xPt, y: yPt, size: 10, font });
    }
  }

  for (let i = 0; i < pages.length - 1; i++) {
    const p = pages[i];
    p.drawLine({
      start: { x: 10, y: (doc.settings.bodyHeightMm * mmToPt) },
      end: { x: pageWidthPt - 10, y: doc.settings.bodyHeightMm * mmToPt },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
  }

  return pdf.save();
}

export function exportToJson(doc: SerializedDocument): string {
  return JSON.stringify(doc, null, 2);
}
