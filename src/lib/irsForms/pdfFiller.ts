/**
 * Fill IRS PDFs by drawing text at rect coordinates from .fields.json — not by setting
 * AcroForm /V values. Widget annotations are flattened after drawing so output is print-stable.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function parseCheckboxExport(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === '/yes' || v === 'yes' || v === 'x' || v === 'true' || v === '1';
}

export async function fillAndFlattenForm(
  pdfBytes: Uint8Array,
  definition: import('@/lib/irsForms/types').FormDefinition,
  values: import('@/lib/irsForms/types').FormFieldValues,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const [semanticKey, raw] of Object.entries(values)) {
    const field = definition.fields[semanticKey];
    if (!field || field.rect[1] === 0) continue;

    const page = pdfDoc.getPage(field.page - 1);
    const [x0, y0, x1, y1] = field.rect;
    const w = x1 - x0;
    const h = y1 - y0;

    if (field.type === 'checkbox') {
      if (parseCheckboxExport(raw)) {
        const size = Math.min(Math.max(h * 0.65, 7), 11);
        page.drawText('X', {
          x: x0 + w * 0.15,
          y: y0 + h * 0.1,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      }
      continue;
    }

    const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!text) continue;

    let fontSize = Math.min(Math.max(h * 0.72, 7), 11);
    /** Helvetica WinAnsi cannot encode newlines in single drawText calls */
    const display = text.replace(/\n/g, ', ');
    while (font.widthOfTextAtSize(display, fontSize) > w - 4 && fontSize > 6) {
      fontSize -= 0.5;
    }
    page.drawText(display, {
      x: x0 + 2,
      y: y0 + (h - fontSize) / 2 - 1,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  try {
    const form = pdfDoc.getForm();
    form.flatten();
  } catch {
    /* non-fillable or no form dictionary */
  }

  return pdfDoc.save({ useObjectStreams: false });
}

export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const bytes of parts) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copies = await merged.copyPages(src, src.getPageIndices());
    copies.forEach((p) => merged.addPage(p));
  }
  return merged.save({ useObjectStreams: false });
}
