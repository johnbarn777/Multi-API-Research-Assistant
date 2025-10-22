import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { cleanInline, parseMarkdown } from "@/lib/pdf/markdown";
import type { ProviderResult } from "@/types/research";

export type PdfPayload = {
  title: string;
  userEmail: string;
  createdAt: string;
  openAi: ProviderResult | null;
  gemini: ProviderResult | null;
};

export async function buildResearchPdf(payload: PdfPayload): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  const pages: PDFPage[] = [];
  const margin = 56;
  const borderInset = Math.max(24, margin - 12);

  let currentPage: PDFPage;
  let cursorY = 0;
  let contentWidth = 0;

  const setCurrentPage = (page: PDFPage) => {
    currentPage = page;
    const { height, width } = currentPage.getSize();
    cursorY = height - margin;
    contentWidth = width - margin * 2;
  };

  const addPage = () => {
    const page = pdfDoc.addPage();
    pages.push(page);
    setCurrentPage(page);
    drawPageBorder(page);
    return page;
  };

  const drawPageBorder = (page: PDFPage) => {
    const { width, height } = page.getSize();
    page.drawRectangle({
      x: borderInset,
      y: borderInset,
      width: width - borderInset * 2,
      height: height - borderInset * 2,
      borderColor: rgb(0.75, 0.78, 0.85),
      borderWidth: 1.2
    });
  };

  const addLinkAnnotation = ({
    page,
    x,
    y,
    width,
    height,
    url
  }: {
    page: PDFPage;
    x: number;
    y: number;
    width: number;
    height: number;
    url: string;
  }) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      return;
    }

    const bottom = Math.max(borderInset, y);
    const top = Math.max(bottom + 2, y + height);

    const annotation = pdfDoc.context.obj({
      Type: PDFName.of("Annot"),
      Subtype: PDFName.of("Link"),
      Rect: pdfDoc.context.obj([x, bottom, x + width, top]),
      Border: pdfDoc.context.obj([0, 0, 0]),
      A: pdfDoc.context.obj({
        Type: PDFName.of("Action"),
        S: PDFName.of("URI"),
        URI: pdfDoc.context.obj(trimmedUrl)
      })
    });

    const annotationRef = pdfDoc.context.register(annotation);
    page.node.addAnnot(annotationRef);
  };

  const lineHeightFor = (size: number) => size * 1.35;

  const ensureSpace = (lineHeight: number) => {
    if (cursorY - lineHeight < margin) {
      addPage();
    }
  };

  const wrapText = (
    text: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
    { preserveWhitespace = false }: { preserveWhitespace?: boolean } = {}
  ): string[] => {
    const sanitized = text.replace(/\r\n/g, "\n").split("\n");
    const lines: string[] = [];
    const effectiveWidth = Math.max(maxWidth, size * 4);

    const breakToken = (token: string): string[] => {
      if (!token) {
        return [token];
      }

      if (font.widthOfTextAtSize(token, size) <= effectiveWidth) {
        return [token];
      }

      const segments: string[] = [];
      let buffer = "";

      for (const char of token) {
        const tentative = buffer + char;
        if (font.widthOfTextAtSize(tentative, size) <= effectiveWidth) {
          buffer = tentative;
          continue;
        }

        if (buffer.length > 0) {
          segments.push(buffer);
          buffer = char;
          continue;
        }

        segments.push(char);
        buffer = "";
      }

      if (buffer.length > 0) {
        segments.push(buffer);
      }

      return segments;
    };

    const wrapParagraph = (segment: string) => {
      const trimmed = segment.trim();
      if (!trimmed) {
        lines.push("");
        return;
      }

      const tokens = trimmed.split(/\s+/);
      let currentLine = "";

      tokens.forEach((token) => {
        const tokenSegments = breakToken(token);
        tokenSegments.forEach((piece, index) => {
          const needsSpace = currentLine.length > 0 && index === 0;
          const tentative =
            currentLine.length === 0
              ? piece
              : needsSpace
                ? `${currentLine} ${piece}`
                : `${currentLine}${piece}`;

          if (font.widthOfTextAtSize(tentative, size) <= effectiveWidth) {
            currentLine = tentative;
            return;
          }

          if (currentLine.length > 0) {
            lines.push(currentLine);
          }

          currentLine = piece;
        });
      });

      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
    };

    const wrapPreformatted = (segment: string) => {
      const normalized = segment.replace(/\t/g, "    ");
      if (normalized.length === 0) {
        lines.push("");
        return;
      }

      let currentLine = "";

      for (const char of normalized) {
        const tentative = currentLine + char;
        if (font.widthOfTextAtSize(tentative, size) <= effectiveWidth) {
          currentLine = tentative;
          continue;
        }

        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = char === " " ? "" : char;
      }

      if (currentLine.length > 0) {
        lines.push(currentLine);
      } else if (lines.length === 0) {
        lines.push("");
      }
    };

    sanitized.forEach((segment, index) => {
      const beforeLength = lines.length;
      if (preserveWhitespace) {
        wrapPreformatted(segment);
      } else {
        wrapParagraph(segment);
      }

      if (index < sanitized.length - 1) {
        const lastLine = lines[lines.length - 1] ?? "";
        if (lines.length === beforeLength || lastLine !== "") {
          lines.push("");
        }
      }
    });

    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    return lines;
  };

  const writeLines = ({
    text,
    font = regularFont,
    size = 12,
    color = rgb(0.1, 0.1, 0.1),
    indent = 0,
    spacing = lineHeightFor(size),
    preserveWhitespace = false,
    link
  }: {
    text: string;
    font?: PDFFont;
    size?: number;
    color?: ReturnType<typeof rgb>;
    indent?: number;
    spacing?: number;
    preserveWhitespace?: boolean;
    link?: string;
  }) => {
    const availableWidth = Math.max(contentWidth - indent, contentWidth * 0.5);
    const lines = wrapText(text, font, size, availableWidth, { preserveWhitespace });

    for (const line of lines) {
      if (line === "") {
        cursorY -= spacing * 0.5;
        continue;
      }

      ensureSpace(spacing);
      const drawX = margin + indent;
      const drawY = cursorY;
      currentPage.drawText(line, {
        x: drawX,
        y: drawY,
        size,
        font,
        color
      });

      if (link) {
        const lineWidth = font.widthOfTextAtSize(line, size);
        const annotationHeight = size * 1.2;
        addLinkAnnotation({
          page: currentPage,
          x: drawX,
          y: drawY - size * 0.25,
          width: Math.max(lineWidth, 4),
          height: annotationHeight,
          url: link
        });
      }

      cursorY -= spacing;
    }
  };

  const writeHeading = (text: string, level: 1 | 2 | 3) => {
    const size = level === 1 ? 20 : level === 2 ? 16 : 13;
    const spacing = lineHeightFor(size);
    ensureSpace(spacing * 1.5);
    cursorY -= spacing * 0.3;
    writeLines({
      text,
      font: boldFont,
      size
    });
    cursorY -= spacing * 0.4;
  };

  const writeList = (items: string[], ordered = false) => {
    if (!items.length) {
      return;
    }

    items.forEach((item, index) => {
      const sanitized = cleanInline(item);
      if (!sanitized) {
        return;
      }
      const prefix = ordered ? `${index + 1}. ` : "• ";
      writeLines({
        text: `${prefix}${sanitized}`,
        indent: 14
      });
    });
  };

  const clampHeadingLevel = (level: number): 1 | 2 | 3 => {
    if (level <= 1) {
      return 1;
    }
    if (level === 2) {
      return 2;
    }
    return 3;
  };

  const renderMarkdownContent = (markdown: string): boolean => {
    const blocks = parseMarkdown(markdown);
    if (blocks.length === 0) {
      return false;
    }

    for (const block of blocks) {
      switch (block.type) {
        case "heading": {
          writeHeading(block.text, clampHeadingLevel(block.level));
          break;
        }
        case "paragraph": {
          writeLines({ text: block.text });
          cursorY -= lineHeightFor(12) * 0.3;
          break;
        }
        case "list": {
          writeList(block.items, block.ordered);
          cursorY -= lineHeightFor(12) * 0.3;
          break;
        }
        case "blockquote": {
          writeLines({
            text: block.text,
            font: italicFont,
            size: 12,
            color: rgb(0.2, 0.2, 0.2),
            indent: 18
          });
          cursorY -= lineHeightFor(12) * 0.3;
          break;
        }
        case "code": {
          writeLines({
            text: block.text,
            font: monoFont,
            size: 11,
            indent: 18,
            spacing: lineHeightFor(11),
            preserveWhitespace: true
          });
          cursorY -= lineHeightFor(11) * 0.3;
          break;
        }
        default:
          break;
      }
    }

    return true;
  };

  // --- Cover page ---
  const coverPage = addPage();
  const { height: coverHeight } = coverPage.getSize();

  writeLines({
    text: `Research Title: ${payload.title}`,
    font: boldFont,
    size: 16
  });
  writeLines({
    text: `Prepared for: ${payload.userEmail}`,
    size: 12
  });
  writeLines({
    text: `Created at: ${payload.createdAt}`,
    size: 12
  });

  const drawCentered = (text: string, y: number, size: number, font: PDFFont) => {
    const { width } = coverPage.getSize();
    const textWidth = font.widthOfTextAtSize(text, size);
    coverPage.drawText(text, {
      x: Math.max(margin, (width - textWidth) / 2),
      y,
      size,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });
  };

  const heroTitleY = coverHeight - 140;
  const heroSubtitleY = heroTitleY - 34;

  drawCentered("Multi-API Research Assistant", heroTitleY, 26, boldFont);
  drawCentered("Comparative Research Report", heroSubtitleY, 20, regularFont);

  const summaryStart = Math.min(cursorY - lineHeightFor(12), heroSubtitleY - 48);
  cursorY = Math.max(summaryStart, margin);

  writeLines({
    text: "This report compares findings generated by OpenAI Deep Research and Google Gemini using the finalized research prompt."
  });

  // Start a fresh page for provider content.
  addPage();

  const renderProviderSection = (label: string, result: ProviderResult | null) => {
    writeHeading(label, 1);

    if (!result) {
      writeLines({
        text: "No findings were recorded for this provider. The provider may have failed or has not run yet."
      });
      cursorY -= lineHeightFor(12);
      return;
    }

    writeHeading("Executive Summary", 2);
    if (result.summary) {
      const rendered = renderMarkdownContent(result.summary);
      if (!rendered) {
        writeLines({ text: cleanInline(result.summary) });
      }
    } else {
      writeLines({ text: "No summary was provided for this run." });
    }
    cursorY -= lineHeightFor(12) * 0.5;

    writeHeading("Findings", 2);

    const hasInsights = Array.isArray(result.insights) && result.insights.length > 0;
    writeHeading("Key Insights", 3);
    if (hasInsights) {
      writeList(result.insights);
    } else {
      writeLines({ text: "No key insights were supplied." });
    }
    cursorY -= lineHeightFor(12) * 0.4;

    const normalizedSources =
      result.sources
        ?.map((source) => {
          const title = cleanInline(source.title ?? "") ?? "";
          const url = (source.url ?? "").trim();
          return {
            title: title.trim(),
            url
          };
        })
        .filter((source) => source.title.length > 0 || source.url.length > 0) ?? [];

    writeHeading("Primary Sources", 3);
    if (normalizedSources.length > 0) {
      normalizedSources.forEach((source, index) => {
        const labelText = source.title.length > 0 ? source.title : source.url;
        writeLines({
          text: `${index + 1}. ${labelText || "Source"}`,
          font: boldFont,
          size: 12
        });
        if (source.url) {
          writeLines({
            text: source.url,
            size: 11,
            color: rgb(0, 0.27, 0.53),
            indent: 12,
            link: source.url
          });
        }
        cursorY -= lineHeightFor(11) * 0.35;
      });
    } else {
      writeLines({
        text: "No source links accompanied this run."
      });
    }
    cursorY -= lineHeightFor(12) * 0.4;

    if (result.meta) {
      const metaLines: string[] = [];
      if (result.meta.model) {
        metaLines.push(`Model: ${result.meta.model}`);
      }
      if (result.meta.tokens !== undefined) {
        metaLines.push(`Tokens: ${result.meta.tokens}`);
      }
      if (result.meta.startedAt) {
        metaLines.push(`Started: ${result.meta.startedAt}`);
      }
      if (result.meta.completedAt) {
        metaLines.push(`Completed: ${result.meta.completedAt}`);
      }

      if (metaLines.length > 0) {
        writeHeading("Metadata", 3);
        metaLines.forEach((line) => {
          writeLines({ text: line });
        });
      }
    }

    cursorY -= lineHeightFor(12) * 0.75;
  };

  renderProviderSection("OpenAI Deep Research", payload.openAi);
  addPage();
  renderProviderSection("Google Gemini", payload.gemini);

  const footerBase = `Generated ${payload.createdAt} • Multi-API Research Assistant`;

  pages.forEach((page, index) => {
    const footerSize = 10;
    const { width } = page.getSize();
    const footerText = `${footerBase} • Page ${index + 1} of ${pages.length}`;
    const textWidth = regularFont.widthOfTextAtSize(footerText, footerSize);

    page.drawText(footerText, {
      x: Math.max(margin, (width - textWidth) / 2),
      y: margin / 2,
      size: footerSize,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4)
    });
  });

  return pdfDoc.save();
}
