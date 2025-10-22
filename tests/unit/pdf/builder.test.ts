import { describe, expect, it } from "vitest";
import { inflateSync } from "zlib";

import { buildResearchPdf } from "@/lib/pdf/builder";
import {
  SAMPLE_GEMINI_RESULT,
  SAMPLE_OPENAI_RESULT,
  SAMPLE_PDF_PAYLOAD
} from "@/tests/fixtures/researchReport";

const BINARY_LINE_FEED = /\r?\n/;

function bufferFrom(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes);
}

function decodeLiteral(value: string): string {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r");
}

function decodeHex(value: string): string {
  return Buffer.from(value, "hex").toString("utf8");
}

function extractText(buffer: Buffer): string {
  const segments: string[] = [];
  const source = buffer.toString("binary");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;

  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(source)) !== null) {
    const raw = Buffer.from(match[1], "binary");
    let decompressed: Buffer;
    try {
      decompressed = inflateSync(raw);
    } catch {
      continue;
    }

    const content = decompressed.toString("utf8");
    const literalRegex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
    const hexRegex = /<([0-9A-Fa-f]+)>\s*Tj/g;

    let literalMatch: RegExpExecArray | null;
    while ((literalMatch = literalRegex.exec(content)) !== null) {
      segments.push(decodeLiteral(literalMatch[1]));
    }

    let hexMatch: RegExpExecArray | null;
    while ((hexMatch = hexRegex.exec(content)) !== null) {
      segments.push(decodeHex(hexMatch[1]));
    }
  }

  return segments.join("\n").split(BINARY_LINE_FEED).join("\n");
}

describe("buildResearchPdf", () => {
  it("produces a PDF document with provider sections and metadata", async () => {
    const pdfBytes = await buildResearchPdf(SAMPLE_PDF_PAYLOAD);
    const pdfBuffer = bufferFrom(pdfBytes);

    expect(pdfBuffer.toString("ascii", 0, 4)).toBe("%PDF");

    const content = extractText(pdfBuffer);
    expect(content).toContain("OpenAI Deep Research");
    expect(content).toContain("Google Gemini");
    expect(content).toContain("Multi-API Research Assistant");
    expect(content).toContain(SAMPLE_OPENAI_RESULT.summary.slice(0, 30));
    expect(content).toContain(SAMPLE_GEMINI_RESULT.summary.slice(0, 30));
  });

  it("handles missing provider results gracefully", async () => {
    const pdfBytes = await buildResearchPdf({
      ...SAMPLE_PDF_PAYLOAD,
      gemini: null
    });

    const pdfBuffer = bufferFrom(pdfBytes);
    expect(pdfBuffer.toString("ascii", 0, 4)).toBe("%PDF");

    const content = extractText(pdfBuffer);
    expect(content).toContain("No findings were recorded for this provider.");
    expect(content).toContain("OpenAI Deep Research");
  });

  it("renders markdown content with headings, lists, blockquotes, and code blocks", async () => {
    const markdownSummary = [
      "# Overview",
      "",
      "## Key Points",
      "- First **important** item",
      "- Second item with [link](https://example.com)",
      "",
      "> Inspirational quote from the research narrative.",
      "",
      "```",
      "const example = true;",
      "console.log(example);",
      "```"
    ].join("\n");

    const pdfBytes = await buildResearchPdf({
      ...SAMPLE_PDF_PAYLOAD,
      openAi: {
        ...SAMPLE_OPENAI_RESULT,
        summary: markdownSummary,
        insights: [],
        sources: []
      },
      gemini: null
    });

    const content = extractText(bufferFrom(pdfBytes));

    expect(content).toContain("Overview");
    expect(content).toContain("Key Points");
    expect(content).toContain("First important item");
    expect(content).toContain("Second item with link (https://example.com)");
    expect(content).toContain("Inspirational quote from the research narrative.");
    expect(content).toContain("const example = true;");
    expect(content).not.toContain("# Overview");
  });
});
