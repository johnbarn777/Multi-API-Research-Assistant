import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ProviderResult } from "@/types/providers";

export type PdfPayload = {
  title: string;
  userEmail: string;
  createdAt: string;
  openAi: ProviderResult | null;
  gemini: ProviderResult | null;
};

export async function buildResearchPdf(payload: PdfPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage();
  const { height, width } = page.getSize();

  const writeLine = (text: string, y: number, size = 14) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });
  };

  writeLine("Multi-API Research Assistant Report", height - 50, 18);
  writeLine(`Title: ${payload.title}`, height - 80);
  writeLine(`Generated for: ${payload.userEmail}`, height - 100);
  writeLine(`Created at: ${payload.createdAt}`, height - 120);

  // TODO: Expand with multi-page layout that renders summaries and insights.
  writeLine("Section A: OpenAI Deep Research (placeholder content)", height - 160);
  writeLine("Section B: Gemini Research (placeholder content)", height - 200);

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}
