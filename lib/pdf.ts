import { Buffer } from "node:buffer";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PdfSection = {
  heading: string;
  lines: string[];
};

type BuildPdfOptions = {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 56;
const BODY_FONT_SIZE = 11;
const BODY_LINE_HEIGHT = 16;
const TITLE_FONT_SIZE = 22;
const HEADING_FONT_SIZE = 14;
const SUBTITLE_FONT_SIZE = 11;
const MAX_TEXT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number) {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();

    if (!trimmed) {
      lines.push("");
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      currentLine = word;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

function createPage(pdfDoc: PDFDocument) {
  return pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
}

function drawWrappedLines(
  page: PDFPage,
  font: PDFFont,
  text: string,
  fontSize: number,
  x: number,
  y: number,
  maxWidth: number,
  color = rgb(0.13, 0.18, 0.24)
) {
  const lines = wrapText(text, font, fontSize, maxWidth);
  let cursor = y;

  for (const line of lines) {
    if (line) {
      page.drawText(line, {
        x,
        y: cursor,
        size: fontSize,
        font,
        color
      });
    }

    cursor -= BODY_LINE_HEIGHT;
  }

  return cursor;
}

export async function buildPdfDocument({ title, subtitle, sections }: BuildPdfOptions) {
  const pdfDoc = await PDFDocument.create();
  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let page = createPage(pdfDoc);
  let cursor = PAGE_HEIGHT - PAGE_MARGIN;

  page.drawText(title, {
    x: PAGE_MARGIN,
    y: cursor,
    size: TITLE_FONT_SIZE,
    font: titleFont,
    color: rgb(0.12, 0.17, 0.2)
  });
  cursor -= 30;

  if (subtitle) {
    cursor = drawWrappedLines(
      page,
      bodyFont,
      subtitle,
      SUBTITLE_FONT_SIZE,
      PAGE_MARGIN,
      cursor,
      MAX_TEXT_WIDTH,
      rgb(0.38, 0.45, 0.51)
    );
    cursor -= 6;
  }

  for (const section of sections) {
    const estimatedHeight = (section.lines.length + 2) * BODY_LINE_HEIGHT + 20;

    if (cursor - estimatedHeight < PAGE_MARGIN) {
      page = createPage(pdfDoc);
      cursor = PAGE_HEIGHT - PAGE_MARGIN;
    }

    page.drawText(section.heading, {
      x: PAGE_MARGIN,
      y: cursor,
      size: HEADING_FONT_SIZE,
      font: titleFont,
      color: rgb(0.16, 0.27, 0.23)
    });
    cursor -= 22;

    for (const rawLine of section.lines) {
      const line = rawLine.trim();

      if (!line) {
        cursor -= 6;
        continue;
      }

      const isBullet = line.startsWith("• ");
      const bulletText = isBullet ? line.slice(2) : line;
      const textX = isBullet ? PAGE_MARGIN + 14 : PAGE_MARGIN;
      const maxWidth = isBullet ? MAX_TEXT_WIDTH - 14 : MAX_TEXT_WIDTH;

      if (cursor - BODY_LINE_HEIGHT * 2 < PAGE_MARGIN) {
        page = createPage(pdfDoc);
        cursor = PAGE_HEIGHT - PAGE_MARGIN;
      }

      if (isBullet) {
        page.drawText("•", {
          x: PAGE_MARGIN,
          y: cursor,
          size: BODY_FONT_SIZE,
          font: bodyFont,
          color: rgb(0.13, 0.18, 0.24)
        });
      }

      cursor = drawWrappedLines(page, bodyFont, bulletText, BODY_FONT_SIZE, textX, cursor, maxWidth);
    }

    cursor -= 10;
  }

  return Buffer.from(await pdfDoc.save());
}
