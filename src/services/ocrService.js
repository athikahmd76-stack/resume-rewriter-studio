/**
 * Optional, fully local OCR for scanned PDFs.
 *
 * Design constraints:
 *   - No CDN, no external fetch, no telemetry. Tesseract assets are expected to
 *     be served from the app's own `public/tesseract/` folder.
 *   - If those assets are missing we say so plainly instead of silently
 *     reaching out to the internet.
 *   - The output is shaped like the PDF parser output so the rest of the
 *     pipeline is unchanged.
 *
 * To enable OCR, place these files in `public/tesseract/`:
 *   tesseract.js-core (wasm), tesseract-worker.js, eng.traineddata.gz
 */

import { normalizeText, splitLines } from '../utils/textUtils.js';
import { MAX_PDF_PAGES } from '../utils/validation.js';

const ASSET_DIR = 'tesseract';
const requiredAssets = ['worker.min.js', 'eng.traineddata.gz'];

export const ocrAssetsMissingMessage =
  'OCR needs its language data in this app\'s own files. Add tesseract.js worker, core wasm and eng.traineddata.gz to '
  + 'public/tesseract/ (see README), then reload. Nothing is downloaded from the internet by this app.';

/** Check (same-origin, static) whether the bundled OCR assets are present. */
export const checkOcrAssets = async () => {
  if (typeof fetch !== 'function') return { ok: false, missing: requiredAssets };
  const missing = [];
  for (const asset of requiredAssets) {
    try {
      const res = await fetch(`${ASSET_DIR}/${asset}`, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) missing.push(asset);
    } catch {
      missing.push(asset);
    }
  }
  return { ok: missing.length === 0, missing };
};

const flattenWords = (blocks) => {
  const out = [];
  const visit = (node) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (node.words) node.words.forEach((w) => out.push(w));
    (node.paragraphs || []).forEach(visit);
    (node.lines || []).forEach(visit);
    (node.blocks || []).forEach(visit);
  };
  visit(blocks);
  return out;
};

/** Turn OCR words into line objects shaped like the PDF parser's lines. */
const wordsToLines = (words, pageNumber, pageWidth, pageHeight, scale) => {
  const grouped = new Map();
  for (const w of words) {
    const text = String(w.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const bbox = w.bbox || {};
    const x0 = Number(bbox.x0 ?? 0) / scale;
    const x1 = Number(bbox.x1 ?? 0) / scale;
    const top = Number(bbox.y0 ?? 0) / scale;
    const bottom = Number(bbox.y1 ?? 0) / scale;
    const key = Math.round(top / 6); // ~6px tolerance band
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ text, x: x0, right: x1, top, bottom });
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) => {
      items.sort((a, b) => a.x - b.x);
      const x = Math.round(Math.min(...items.map((i) => i.x)) * 10) / 10;
      const right = Math.round(Math.max(...items.map((i) => i.right)) * 10) / 10;
      const top = Math.min(...items.map((i) => i.top));
      const bottom = Math.max(...items.map((i) => i.bottom));
      return {
        text: items.map((i) => i.text).join(' '),
        x,
        right,
        // the PDF parser measures `y` upwards from the page bottom
        y: Math.round((pageHeight - bottom) * 10) / 10,
        width: Math.round((right - x) * 10) / 10,
        fontSize: Math.max(6, Math.round((bottom - top))),
        fontName: 'OCR',
        bold: false,
        italic: false,
        bullet: false,
        marker: '',
        page: pageNumber,
      };
    });
};

const linesToBlocks = (lines) => lines.map((line) => ({
  type: 'paragraph',
  text: line.text,
  fontSize: line.fontSize,
  minFontSize: line.fontSize,
  bold: line.bold,
  italic: false,
  bullet: line.bullet,
  marker: line.marker,
  x: line.x,
  y: line.y,
  right: line.right,
  width: line.width,
  page: line.page,
  lineCount: 1,
}));

/**
 * Run local OCR over a scanned PDF.
 * @param {File} file
 * @param {(pct:number,label:string)=>void} onProgress
 * @returns parsed-document shaped object (same as parsePdf output)
 */
export const ocrPdf = async (file, onProgress = () => {}) => {
  const assets = await checkOcrAssets();
  if (!assets.ok) {
    const error = new Error(ocrAssetsMissingMessage);
    error.code = 'ocr-assets-missing';
    error.missing = assets.missing;
    throw error;
  }

  onProgress(2, 'Loading OCR engine');
  const [{ createWorker }, pdfjs] = await Promise.all([
    import('tesseract.js'),
    import('pdfjs-dist'),
  ]);

  const worker = await createWorker('eng', 1, {
    workerPath: `${ASSET_DIR}/worker.min.js`,
    corePath: `${ASSET_DIR}/`,
    langPath: ASSET_DIR,
    gzip: true,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(10 + Math.round(m.progress * 80), 'Recognising text');
    },
  });

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pagesToRead = Math.min(doc.numPages, MAX_PDF_PAGES);
  const scale = 2;
  const pages = [];

  try {
    for (let p = 1; p <= pagesToRead; p += 1) {
      onProgress(10 + Math.round((p / pagesToRead) * 80), `OCR page ${p} of ${pagesToRead}`);
       
      const page = await doc.getPage(p);
       
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
       
      await page.render({ canvasContext: ctx, viewport }).promise;

       
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const words = flattenWords(data.blocks);
      const pageWidth = Math.round(viewport.width / scale);
      const pageHeight = Math.round(viewport.height / scale);
      const lines = words.length
        ? wordsToLines(words, p, pageWidth, pageHeight, scale)
        : splitLines(normalizeText(data.text || '')).map((text) => ({
          text, x: 0, right: 0, y: 0, width: 0, fontSize: 11, fontName: 'OCR', bold: false, italic: false, bullet: false, marker: '', page: p,
        }));

      pages.push({
        pageNumber: p,
        width: pageWidth,
        height: pageHeight,
        rotation: viewport.rotation,
        rawText: lines.map((l) => l.text).join('\n'),
        lines,
        blocks: linesToBlocks(lines),
        columns: 1,
        hasText: lines.length > 0,
        hasImages: true,
        ocr: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        fontSizes: lines.map((l) => l.fontSize),
        fonts: ['OCR'],
      });

      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await worker.terminate();
    await doc.destroy();
  }

  const fullText = pages.map((p) => p.rawText).join('\n\n');
  const cleanText = normalizeText(fullText);
  const meaningful = cleanText.replace(/[^a-z0-9]/gi, '').length;

  if (meaningful < 40) {
    const error = new Error(
      'OCR finished but very little text was recognised. The scan is probably too low resolution - try a 300 DPI PDF or a DOCX.',
    );
    error.code = 'ocr-empty';
    error.needsOcr = false;
    throw error;
  }

  return {
    kind: 'pdf',
    ocr: true,
    pageCount: doc.numPages,
    analysedPages: pagesToRead,
    text: cleanText,
    rawText: fullText,
    pages,
    fontSamples: [],
    pageSize: 'A4',
    orientation: 'portrait',
    columns: 1,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    lineCount: pages.reduce((a, p) => a + p.lines.length, 0),
    blockCount: pages.reduce((a, p) => a + p.blocks.length, 0),
    lineHeights: null,
    empty: false,
  };
};

export default ocrPdf;
