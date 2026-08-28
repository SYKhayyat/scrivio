import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { DocumentElement, SerializedDocument } from '../core/types';

export async function exportToPdf(doc: SerializedDocument, chunkImages: Map<string, Uint8Array>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageWidthPt = (doc.settings.pageWidthMm / 25.4) * 72;
  const pageHeightPt = ((doc.settings.bodyHeightMm + doc.settings.footnoteHeightMm) / 25.4) * 72;
  const pages: ReturnType<typeof pdf.addPage>[] = [];
  let currentPage = pdf.addPage([pageWidthPt, pageHeightPt]);
  pages.push(currentPage);
  let pageOffsetY = 0;

  const bodyHeight = doc.settings.bodyHeightMm;
  const mmToPt = 72 / 25.4;

  for (const el of doc.elements) {
    if (el.y >= pageOffsetY + bodyHeight) {
      currentPage = pdf.addPage([pageWidthPt, pageHeightPt]);
      pages.push(currentPage);
      pageOffsetY += bodyHeight;
    }
    const xPt = el.x * mmToPt;
    const yPt = pageHeightPt - (el.y - pageOffsetY + el.height) * mmToPt;

    if (el.kind === 'chunk') {
      const bytes = chunkImages.get(el.id);
      if (bytes) {
        try {
          const img = await pdf.embedJpg(bytes);
          currentPage.drawImage(img, { x: xPt, y: yPt, width: el.width * mmToPt, height: el.height * mmToPt });
        } catch {
          currentPage.drawRectangle({ x: xPt, y: yPt, width: el.width * mmToPt, height: el.height * mmToPt, color: rgb(0.9, 0.9, 0.9) });
        }
      }
    } else if (el.kind === 'typed-word') {
      currentPage.drawText(el.text + ' ', {
        x: xPt,
        y: yPt,
        size: el.fontSize * mmToPt,
        font,
        color: rgb(0, 0, 0),
      });
    } else if (el.kind === 'footnote-ref') {
      currentPage.drawText(String(el.number), {
        x: xPt,
        y: yPt + 2 * mmToPt,
        size: 6,
        font,
        color: rgb(0.2, 0.2, 0.8),
      });
    } else if (el.kind === 'bullet') {
      currentPage.drawText('•', { x: xPt, y: yPt, size: 10, font });
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
