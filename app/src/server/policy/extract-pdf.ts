import { extractText, getDocumentProxy } from "unpdf";

export interface ExtractedPdf {
  pages: string[];
  pageCount: number;
  emptyPages: number;
}

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfError";
  }
}

export const MAX_PDF_PAGES = 200;

/** Per-page text. No OCR: a scanned page simply comes back empty and is counted in `emptyPages`. */
export async function extractPdfPages(bytes: Uint8Array): Promise<ExtractedPdf> {
  let pdf;
  try {
    pdf = await getDocumentProxy(Uint8Array.from(bytes));
  } catch {
    throw new PdfError("This file could not be read as a PDF");
  }
  if (pdf.numPages > MAX_PDF_PAGES) throw new PdfError(`PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}`);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t) => t.trim());
  return { pages, pageCount: pages.length, emptyPages: pages.filter((p) => p === "").length };
}
