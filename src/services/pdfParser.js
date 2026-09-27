/**
 * Client-side PDF parsing using pdfjs-dist.
 *
 * Produces a *layout-aware* document model:
 *   - raw text per page
 *   - text items with approximate x/y positions, font family, font size, bold flag
 *   - reconstructed lines and blocks (paragraphs, bullets)
 *   - detected page size / orientation
 *
 * Nothing is sent anywhere. Parsing runs in the main thread but yields
 * between pages so the UI can paint progress.
 */

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  normalizeText,
  collapseWhitespace,
  detectBulletPrefix,
  splitLines,
} from '../utils/textUtils.js';
import { extractPasswordError, scannedPdfMessage, MAX_PDF_PAGES } from '../utils/validation.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const A4_PT = { width: 595.28, height: 841.89 };
const LETTER_PT = { width: 612, height: 792 };

const pageSizeName = (w, h) => {
  const aw = Math.abs(w - A4_PT.width);
  const ah = Math.abs(h - A4_PT.height);
  const lw = Math.abs(w - LETTER_PT.width);
  const lh = Math.abs(h - LETTER_PT.height);
  const tolerance = 14;
  if (aw < tolerance && ah < tolerance) return 'A4';
  if (lw < tolerance && lh < tolerance) return 'Letter';
  if (Math.abs(w - A4_PT.height) < tolerance && Math.abs(h - A4_PT.width) < tolerance) return 'A4';
  if (Math.abs(w - LETTER_PT.height) < tolerance && Math.abs(h - LETTER_PT.width) < tolerance) return 'Letter';
  return 'Custom';
};

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Merge pdf text items into lines grouped by (roughly) vertical position. */
const itemsToLines = (items, lineTolerance = 2.2) => {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => {
    const dy = b.transform[5] - a.transform[5];
    if (Math.abs(dy) > 0.6) return dy;
    return a.transform[4] - b.transform[4];
  });

  const lines = [];
  let current = null;
  for (const item of sorted) {
    if (!item.str || !item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    const width = item.width || 0;
    const height = item.height || Math.abs(item.transform[3]) || 10;
    const fontSize = height || 10;
    const fontName = item.fontName || '';
    const isBold = /bold|black|heavy|semibold|-bd\b/i.test(fontName);
    const isItalic = /italic|oblique/i.test(fontName);

    if (!current || Math.abs(current.y - y) > lineTolerance) {
      current = { y, items: [], x0: x, x1: x + width, fontSize, fontName, isBold, isItalic };
      lines.push(current);
    }
    // The first item of a line has to be recorded too. Dropping it (which this
    // used to do) empties every line that PDF.js emits as a single item, i.e.
    // most PDFs, and the document then looks like it has no text at all.
    current.items.push({ str: item.str, x, width, fontSize, fontName, isBold, isItalic, height });
    current.x0 = Math.min(current.x0, x);
    current.x1 = Math.max(current.x1, x + width);
    current.fontSize = Math.max(current.fontSize, fontSize);
    current.isBold = current.isBold || isBold;
    current.isItalic = current.isItalic || isItalic;
    if (!current.fontName) current.fontName = fontName;
  }

  return lines.map((line, index) => {
    const parts = [...line.items].sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    for (const part of parts) {
      if (prevEnd !== null) {
        const gap = part.x - prevEnd;
        if (gap > line.fontSize * 0.28) {
          const needsSpace = !/\s$/.test(text) && !/^\s/.test(part.str);
          text += needsSpace ? '  ' : '';
        }
      }
      text += part.str;
      prevEnd = part.x + part.width;
    }
    return {
      index,
      text: collapseWhitespace(text),
      x: line.x0,
      right: line.x1,
      y: line.y,
      fontSize: Number(line.fontSize.toFixed(2)),
      fontName: line.fontName,
      bold: Boolean(line.isBold),
      italic: Boolean(line.isItalic),
    };
  }).filter((l) => l.text.length > 0);
};

/** Group lines into blocks using horizontal gaps, indentation and column bands. */
const linesToBlocks = (lines) => {
  if (!lines.length) return [];
  const blocks = [];
  let current = null;
  const push = () => {
    if (current && current.lines.length) blocks.push(current);
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = blocks.length ? blocks[blocks.length - 1].lines[blocks[blocks.length - 1].lines.length - 1] : null;
    const isBullet = Boolean(detectBulletPrefix(line.text));
    const startsBlock = isBullet || !prev
      || (line.x - prev.x > line.fontSize * 2.6)
      || (prev.y - line.y > line.fontSize * 2.1)
      || (!isBullet && prev.bullet && prev.bullet);
    if (startsBlock) {
      push();
      current = { lines: [], bullet: isBullet };
    }
    current.lines.push(line);
  }
  push();

  return blocks.map((block, i) => {
    const text = block.lines.map((l) => l.text).join(' ').replace(/\s{2,}/g, ' ').trim();
    const bulletInfo = detectBulletPrefix(block.lines[0].text);
    // The marker comes off the first line only. Dropping that whole line (which
    // this used to do) emptied every single-line bullet, which is the normal
    // case for a resume.
    const bulletText = bulletInfo
      ? [bulletInfo.rest, ...block.lines.slice(1).map((l) => l.text)].join(' ').replace(/\s{2,}/g, ' ').trim()
      : text;
    return {
      id: `p${i}`,
      type: bulletInfo ? 'bullet' : 'paragraph',
      text: bulletText,
      raw: block.lines.map((l) => l.text).join('\n'),
      x: Math.min(...block.lines.map((l) => l.x)),
      right: Math.max(...block.lines.map((l) => l.right)),
      y: block.lines[0].y,
      bottomY: block.lines[block.lines.length - 1].y,
      fontSize: Math.max(...block.lines.map((l) => l.fontSize)),
      minFontSize: Math.min(...block.lines.map((l) => l.fontSize)),
      bold: block.lines.every((l) => l.bold),
      bullet: Boolean(bulletInfo),
      marker: bulletInfo ? bulletInfo.char : null,
      lineCount: block.lines.length,
    };
  });
};

const detectColumns = (blocks) => {
  if (blocks.length < 6) return 1;
  const wide = blocks.filter((b) => b.right - b.x > 140);
  if (wide.length < 6) return 1;
  const medianWidth = [...wide].map((b) => b.right - b.x).sort((a, b) => a - b)[Math.floor(wide.length / 2)];
  const narrow = blocks.filter((b) => b.right - b.x < medianWidth * 0.72);
  if (narrow.length >= 4 && narrow.length / blocks.length > 0.25) {
    // Confirm the narrow blocks sit in two distinct x bands
    const xs = narrow.map((b) => b.x).sort((a, b) => a - b);
    const split = Math.floor(xs.length / 2);
    const leftBand = xs[split];
    const rightBand = xs[xs.length - 1];
    if (rightBand - leftBand > 90) return 2;
  }
  return 1;
};

/**
 * @param {File|ArrayBuffer|Uint8Array} input
 * @param {(pct:number, label:string)=>void} onProgress
 */
export const parsePdf = async (input, onProgress = () => {}) => {
  const data = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());

  onProgress(6, 'Loading PDF');
  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data,
      useSystemFonts: false,
      disableFontFace: true,
      isEvalSupported: false,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const friendly = extractPasswordError(err);
    const message = friendly || `The PDF could not be opened by the browser PDF engine. ${err?.message ? `Details: ${err.message}` : ''}`.trim();
    const error = new Error(message);
    error.code = friendly ? 'password' : 'parse-failed';
    throw error;
  }

  if (!doc.numPages) {
    const error = new Error('This PDF contains no pages. It may be an empty file or still being written.');
    error.code = 'empty-pdf';
    throw error;
  }
  if (doc.numPages > MAX_PDF_PAGES) {
    // keep going but record the truncation for the UI
    console.warn(`PDF has ${doc.numPages} pages; only the first ${MAX_PDF_PAGES} were analysed.`);
  }

  const pagesToRead = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages = [];
  let fontSamples = [];

  for (let p = 1; p <= pagesToRead; p += 1) {
    onProgress(6 + Math.round((p / pagesToRead) * 72), `Reading page ${p} of ${doc.numPages}`);
     
    const page = await doc.getPage(p);
     
    const viewport = page.getViewport({ scale: 1 });
     
    const content = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
     
    const styles = (await page.getOperatorList()).fnArray;
    void styles;

    const items = content.items.filter((i) => typeof i.str === 'string');
    const lines = itemsToLines(items);
    const blocks = linesToBlocks(lines);
    const hasImages = items.length === 0;

    const viewportH = viewport.height;
    const bodyTop = lines.length ? Math.max(...lines.map((l) => l.y)) : viewportH;
    const bodyBottom = lines.length ? Math.min(...lines.map((l) => l.y)) : 0;
    const leftEdge = lines.length ? Math.min(...lines.map((l) => l.x)) : 0;
    const rightEdge = lines.length ? Math.max(...lines.map((l) => l.right)) : viewport.width;

    pages.push({
      pageNumber: p,
      width: viewport.width,
      height: viewport.height,
      rotation: viewport.rotation,
      rawText: lines.map((l) => l.text).join('\n'),
      lines,
      blocks,
      columns: detectColumns(blocks),
      hasText: items.length > 0,
      hasImages,
      margins: {
        top: Number((viewportH - bodyTop).toFixed(1)),
        bottom: Number(bodyBottom.toFixed(1)),
        left: Number(leftEdge.toFixed(1)),
        right: Number((viewport.width - rightEdge).toFixed(1)),
      },
      fontSizes: lines.map((l) => l.fontSize),
      fonts: [...new Set(lines.map((l) => l.fontName).filter(Boolean))],
    });

    fontSamples = fontSamples.concat(lines.map((l) => ({ font: l.fontName, size: l.fontSize, bold: l.bold })));
     
    await yieldToUi();
  }

  const fullText = pages.map((p) => p.rawText).join('\n\n');
  const cleanText = normalizeText(fullText);
  const meaningfulChars = cleanText.replace(/[^a-z0-9]/gi, '').length;
  const hasSelectableText = meaningfulChars >= 40;

  await doc.destroy();

  if (!hasSelectableText) {
    const error = new Error(scannedPdfMessage);
    error.code = 'scanned-pdf';
    error.needsOcr = true;
    throw error;
  }

  const first = pages[0];
  const sizeName = pageSizeName(first.width, first.height);
  const orientation = first.width >= first.height ? 'landscape' : 'portrait';

  return {
    kind: 'pdf',
    pageCount: doc.numPages,
    analysedPages: pagesToRead,
    text: cleanText,
    rawText: fullText,
    pages,
    fontSamples,
    pageSize: sizeName,
    orientation,
    columns: Math.max(...pages.map((p) => p.columns)),
    margins: {
      top: Math.min(...pages.map((p) => p.margins.top)),
      right: Math.min(...pages.map((p) => p.margins.right)),
      bottom: Math.min(...pages.map((p) => p.margins.bottom)),
      left: Math.min(...pages.map((p) => p.margins.left)),
    },
    lineCount: pages.reduce((acc, p) => acc + p.lines.length, 0),
    blockCount: pages.reduce((acc, p) => acc + p.blocks.length, 0),
    lineHeights: null,
    empty: false,
  };
};

/**
 * Convert a parsed PDF doc into the same document shape every other stage
 * consumes. The layout and resume parsers read a flat `blocks` list, so the
 * per-page blocks have to be flattened here and the page-level measurements
 * (columns, fonts, page size) carried over.
 */
export const pdfToDocument = (parsed) => {
  const blocks = [];
  parsed.pages.forEach((page) => {
    page.blocks.forEach((b) => {
      blocks.push({
        type: b.type,
        text: b.text,
        fontSize: b.fontSize,
        minFontSize: b.minFontSize,
        bold: b.bold,
        italic: b.italic,
        bullet: b.bullet,
        marker: b.marker,
        align: 'left',
        page: page.pageNumber,
        x: b.x,
        y: b.y,
        level: 0,
      });
    });
  });
  return {
    ...parsed,
    blocks,
    lineCount: parsed.lineCount ?? parsed.pages.reduce((acc, p) => acc + p.lines.length, 0),
    blockCount: blocks.length,
  };
};

/** Split a raw JD/text blob into non-empty normalised lines (used by the JD analyser). */
export const textToLines = (text) => splitLines(normalizeText(text)).filter((l) => l.trim().length > 0);

export { detectBulletPrefix };
export default parsePdf;
