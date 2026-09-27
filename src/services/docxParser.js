/**
 * Client-side DOCX parsing.
 *
 * Primary path: read the OOXML parts directly (word/document.xml,
 * word/styles.xml, word/numbering.xml, word/settings.xml) which gives us real
 * page size, margins, columns, font sizes, alignment, bullet glyphs and table
 * grids.
 *
 * Fallback path: mammoth (convertToHtml + extractRawText) for DOCX variants we
 * cannot read directly.
 *
 * Output shape matches the PDF parser so the resume parser is format agnostic.
 */

import {
  readZipEntries,
  readZipText,
  readDocxStyles,
  readDocxNumbering,
  readDocxSettings,
  twipsToPt,
  halfPointsToPt,
  q,
  qa,
} from './zipReader.js';
import { normalizeText, collapseWhitespace } from '../utils/textUtils.js';
import { extractDocxError, emptyDocumentMessage } from '../utils/validation.js';

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 0));

const ALIGN_MAP = {
  left: 'left', start: 'left', right: 'right', end: 'right', center: 'center',
  centre: 'center', both: 'justify', justify: 'justify', distribute: 'justify',
};

const BULLET_GLYPHS = ['\u2022', '\u25CF', '\u25AA', '\u25E6', '\u2043', '\uF0B7', '\uF0A7', '\u25CB', '\u25C6', 'o', '\u2023'];

/** Gather direct run properties from a <w:r> element. */
const readRunProps = (r) => {
  const rPr = q(r, 'rPr');
  if (!rPr) return { text: '', bold: false, italic: false, sizePt: null, fontFamily: null, color: null };
  let text = '';
  for (const node of r.children) {
    if (node.localName === 't') text += node.textContent;
    else if (node.localName === 'tab') text += '\t';
    else if (node.localName === 'br') text += '\n';
    else if (node.localName === 'noBreakHyphen') text += '-';
    else if (node.localName === 'softHyphen') text += '';
  }
  const rFonts = q(rPr, 'rFonts');
  const sz = q(rPr, 'sz');
  return {
    text,
    bold: onOffLocal(q(rPr, 'b')) || onOffLocal(q(rPr, 'bCs')),
    italic: onOffLocal(q(rPr, 'i')),
    underline: Boolean(q(rPr, 'u')) && q(rPr, 'u').getAttribute('w:val') !== 'none',
    sizePt: sz ? halfPointsToPt(sz.getAttribute('w:val')) : null,
    fontFamily: rFonts ? rFonts.getAttribute('w:ascii') || rFonts.getAttribute('w:hAnsi') || rFonts.getAttribute('w:cs') : null,
    color: q(rPr, 'color') ? q(rPr, 'color').getAttribute('w:val') : null,
    caps: onOffLocal(q(rPr, 'caps')),
  };
};

function onOffLocal(el) {
  if (!el) return false;
  const v = el.getAttribute('w:val');
  return v === null || v === undefined || v === '1' || v === 'true' || v === 'on';
}

const resolveStyle = (styleId, styles) => {
  if (!styleId) return null;
  let current = styles[styleId];
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.sizePt || current.fontFamily || current.align || current.bold !== false) {
      return current;
    }
    current = current.basedOn ? styles[current.basedOn] : null;
  }
  return styles[styleId] || null;
};

const tableToBlocks = (tbl, styles, numbering) => {
  const rows = [];
  for (const tr of qa(tbl, 'tr')) {
    const cells = [];
    for (const tc of qa(tr, 'tc')) {
      const paras = qa(tc, 'p').map((p) => paragraphToBlock(p, styles, numbering, true));
      cells.push({
        text: paras.map((b) => b.text).filter(Boolean).join(' | '),
        blocks: paras.filter((b) => b.text),
        width: Number(q(tc, 'tcW')?.getAttribute('w:w') || 0) || null,
        gridSpan: Number(q(tc, 'gridSpan')?.getAttribute('w:val') || 1),
        valign: q(tc, 'vAlign')?.getAttribute('w:val') || null,
        shading: q(tc, 'shd')?.getAttribute('w:fill') || null,
      });
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
};

function paragraphToBlock(p, styles, numbering, inCell = false) {
  const pPr = q(p, 'pPr');
  const styleId = pPr ? q(pPr, 'pStyle')?.getAttribute('w:val') : null;
  const style = resolveStyle(styleId, styles);
  const numPr = pPr ? q(pPr, 'numPr') : null;
  const numId = numPr ? q(numPr, 'numId')?.getAttribute('w:val') : null;
  const ilvl = numPr ? Number(q(numPr, 'ilvl')?.getAttribute('w:val') || 0) : 0;
  const levelDef = numId && numbering[numId] ? numbering[numId][ilvl] || numbering[numId][0] : null;

  const runs = [];
  let text = '';
  let boldChars = 0;
  let totalChars = 0;
  let italicChars = 0;
  let maxSize = null;
  const fonts = new Set();
  const colors = new Set();

  for (const r of qa(p, 'r')) {
    const props = readRunProps(r, styles);
    if (!props.text) continue;
    text += props.text;
    const len = props.text.replace(/\s/g, '').length;
    totalChars += len;
    if (props.bold) boldChars += len;
    if (props.italic) italicChars += len;
    if (props.sizePt) maxSize = maxSize === null ? props.sizePt : Math.max(maxSize, props.sizePt);
    if (props.fontFamily) fonts.add(props.fontFamily);
    if (props.color) colors.add(props.color);
    runs.push(props);
  }
  // hyperlinks contain their own runs; qa(p,'r') via getElementsByTagNameNS does not
  // cross into w:hyperlink children, so pull those explicitly.
  for (const link of qa(p, 'hyperlink')) {
    for (const r of qa(link, 'r')) {
      const props = readRunProps(r, styles);
      if (!props.text) continue;
      text += props.text;
      const len = props.text.replace(/\s/g, '').length;
      totalChars += len;
      if (props.bold) boldChars += len;
      if (props.sizePt) maxSize = maxSize === null ? props.sizePt : Math.max(maxSize, props.sizePt);
      if (props.fontFamily) fonts.add(props.fontFamily);
    }
  }

  const jc = pPr && q(pPr, 'jc') ? q(pPr, 'jc').getAttribute('w:val') : (style?.align || null);
  const ind = pPr && q(pPr, 'ind') ? q(pPr, 'ind') : null;
  const spacingBefore = pPr && q(pPr, 'spacing') ? Number(q(pPr, 'spacing').getAttribute('w:before') || 0) : 0;
  const spacingAfter = pPr && q(pPr, 'spacing') ? Number(q(pPr, 'spacing').getAttribute('w:after') || 0) : 0;
  const keepNext = pPr ? Boolean(q(pPr, 'keepNext')) : false;
  const pageBreakBefore = pPr ? Boolean(q(pPr, 'pageBreakBefore')) : false;

  const isBulletList = Boolean(levelDef) || style?.name?.toLowerCase().startsWith('list');
  let marker = null;
  if (levelDef) {
    marker = levelDef.numFmt === 'bullet' ? (levelDef.lvlText || '\u2022') : levelDef.lvlText || '';
  } else if (isBulletList) {
    marker = '\u2022';
  }

  const cleanText = collapseWhitespace(text);
  const headingLevel = style?.name?.match(/^heading\s*(\d)/i)?.[1] || null;

  return {
    type: marker && cleanText ? 'bullet' : (style && /^heading/i.test(style.name) ? 'heading' : 'paragraph'),
    text: cleanText,
    styleId: styleId || null,
    styleName: style?.name || null,
    headingLevel: headingLevel ? Number(headingLevel) : null,
    fontSize: maxSize || style?.sizePt || null,
    bold: totalChars > 0 ? boldChars / totalChars > 0.6 : Boolean(style?.bold),
    italic: totalChars > 0 ? italicChars / totalChars > 0.6 : Boolean(style?.italic),
    color: colors.size === 1 ? [...colors][0] : null,
    fontFamily: fonts.size === 1 ? [...fonts][0] : (style?.fontFamily || null),
    align: jc ? (ALIGN_MAP[jc] || 'left') : 'left',
    bullet: Boolean(marker && cleanText),
    marker: cleanText ? marker : null,
    level: ilvl,
    indent: ind ? Number(ind.getAttribute('w:left') || 0) : 0,
    hanging: ind ? Number(ind.getAttribute('w:hanging') || 0) : 0,
    spacingBeforePt: twipsToPt(spacingBefore),
    spacingAfterPt: twipsToPt(spacingAfter),
    keepNext,
    pageBreakBefore,
    inCell,
    runs: runs.map((r) => ({ text: r.text, bold: r.bold, italic: r.italic, sizePt: r.sizePt })),
  };
}

const pageSizeFromSectPr = (sectPr) => {
  if (!sectPr) return null;
  const pgSz = q(sectPr, 'pgSz');
  if (!pgSz) return null;
  const w = twipsToPt(Number(pgSz.getAttribute('w:w') || 0));
  const h = twipsToPt(Number(pgSz.getAttribute('w:h') || 0));
  const orient = pgSz.getAttribute('w:orient') || (w > h ? 'landscape' : 'portrait');
  if (!w || !h) return null;
  const name = (Math.abs(w - 595.28) < 12 && Math.abs(h - 841.89) < 12) || (Math.abs(w - 841.89) < 12 && Math.abs(h - 595.28) < 12)
    ? 'A4'
    : (Math.abs(w - 612) < 12 && Math.abs(h - 792) < 12) || (Math.abs(w - 792) < 12 && Math.abs(h - 612) < 12) ? 'Letter' : 'Custom';
  return { widthPt: w, heightPt: h, name, orientation: orient };
};

const marginsFromSectPr = (sectPr) => {
  if (!sectPr) return null;
  const pgMar = q(sectPr, 'pgMar');
  if (!pgMar) return null;
  return {
    top: twipsToPt(Number(pgMar.getAttribute('w:top') || 0)),
    right: twipsToPt(Number(pgMar.getAttribute('w:right') || 0)),
    bottom: twipsToPt(Number(pgMar.getAttribute('w:bottom') || 0)),
    left: twipsToPt(Number(pgMar.getAttribute('w:left') || 0)),
    header: twipsToPt(Number(pgMar.getAttribute('w:header') || 0)),
    footer: twipsToPt(Number(pgMar.getAttribute('w:footer') || 0)),
  };
};

const columnsFromSectPr = (sectPr) => {
  if (!sectPr) return 1;
  const cols = q(sectPr, 'cols');
  if (!cols) return 1;
  return Math.max(1, Number(cols.getAttribute('w:num') || 1));
};

const mammothFallback = async (file) => {
  const mammoth = await import('mammoth');
  const lib = mammoth.default || mammoth;
  const [htmlResult, textResult] = await Promise.all([
    lib.convertToHtml({ arrayBuffer: await file.arrayBuffer() }),
    lib.extractRawText({ arrayBuffer: await file.arrayBuffer() }),
  ]);
  const blocks = [];
  const doc = new DOMParser().parseFromString(htmlResult.value || '', 'text/html');
  const walk = (el) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'p' || /^h[1-6]$/.test(tag)) {
        const text = collapseWhitespace(node.textContent);
        if (text) {
          blocks.push({
            type: /^h[1-6]$/.test(tag) ? 'heading' : 'paragraph',
            text,
            fontSize: tag === 'p' ? null : Number(tag.slice(1)) + 1,
            bold: /^h[1-6]$/.test(tag) || Boolean(node.querySelector('b,strong')),
            italic: Boolean(node.querySelector('i,em')),
            align: 'left',
            bullet: false,
            marker: null,
            level: 0,
          });
        }
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of node.querySelectorAll('li')) {
          const text = collapseWhitespace(li.textContent);
          if (text) {
            blocks.push({
              type: 'bullet', text, fontSize: null, bold: false, italic: false,
              align: 'left', bullet: true, marker: tag === 'ol' ? '1.' : '\u2022', level: 0,
            });
          }
        }
      } else if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((td) => collapseWhitespace(td.textContent)));
        blocks.push({ type: 'table', rows, text: rows.map((r) => r.join(' | ')).join('\n') });
      } else {
        walk(node);
      }
    }
  };
  walk(doc.body);
  return { blocks, text: textResult?.value || htmlResult.value.replace(/<[^>]+>/g, ' ') };
};

/**
 * @param {File} file
 * @param {(pct:number,label:string)=>void} onProgress
 */
export const parseDocx = async (file, onProgress = () => {}) => {
  onProgress(10, 'Opening DOCX package');
  let entries = null;
  let docXml = null;
  try {
    entries = await readZipEntries(await file.arrayBuffer());
    docXml = await readZipText(entries, 'word/document.xml');
  } catch (err) {
    const friendly = extractDocxError(err);
    const error = new Error(friendly || `The DOCX could not be read. ${err?.message || ''}`.trim());
    error.code = friendly ? 'corrupt-docx' : 'docx-read-failed';
    throw error;
  }

  if (!docXml) {
    // Try mammoth before giving up.
    onProgress(20, 'Falling back to compatibility parser');
    const fb = await mammothFallback(file);
    if (!fb.text || fb.text.replace(/[^a-z0-9]/gi, '').length < 40) {
      const error = new Error(emptyDocumentMessage);
      error.code = 'empty-docx';
      throw error;
    }
    return { kind: 'docx', pageCount: 1, text: normalizeText(fb.text), blocks: fb.blocks, ...docxDefaults(), fallback: true };
  }

  onProgress(32, 'Reading styles and numbering');
  const [styles, numbering, settings] = await Promise.all([
    readDocxStyles(entries),
    readDocxNumbering(entries),
    readDocxSettings(entries),
  ]);
  await yieldToUi();

  onProgress(44, 'Reading document body');
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  if (doc.querySelector('parsererror')) {
    const error = new Error('The DOCX document body is malformed. Re-save it from Word or Google Docs and try again.');
    error.code = 'malformed-docx';
    throw error;
  }
  const root = doc.documentElement;
  // <w:document> wraps the content in <w:body>; walk the body, not the root.
  const body = q(root, 'body') || root;
  const blocks = [];
  const tables = [];

  const walk = (container) => {
    for (const node of Array.from(container.children)) {
      if (node.localName === 'p') {
        const block = paragraphToBlock(node, styles, numbering);
        if (block.text) blocks.push(block);
      } else if (node.localName === 'tbl') {
        const rows = tableToBlocks(node, styles, numbering);
        if (rows.length) {
          tables.push({ rows, rowCount: rows.length, colCount: Math.max(...rows.map((r) => r.length)) });
          blocks.push({
            type: 'table',
            rows,
            rowCount: rows.length,
            colCount: Math.max(...rows.map((r) => r.length)),
            text: rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n'),
            fontSize: null,
            bold: false,
            italic: false,
            align: 'left',
            bullet: false,
            marker: null,
            level: 0,
          });
        }
        // nested paragraphs inside cells should not be duplicated
        continue;
      } else if (node.localName === 'sdt') {
        const content = q(node, 'sdtContent');
        if (content) walk(content);
      }
    }
  };
  walk(body);
  await yieldToUi();

  const sectPr = qa(body, 'sectPr').slice(-1)[0] || null;
  const pageSize = pageSizeFromSectPr(sectPr) || { widthPt: 595.28, heightPt: 841.89, name: 'A4', orientation: 'portrait' };
  const margins = marginsFromSectPr(sectPr) || { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 };
  const columns = columnsFromSectPr(sectPr);
  const defaults = styles.__defaults || {};

  const sizes = blocks.map((b) => b.fontSize).filter((s) => typeof s === 'number' && s > 0);
  const fonts = blocks.map((b) => b.fontFamily).filter(Boolean);
  const bulletMarkers = blocks.map((b) => b.marker).filter(Boolean);

  const text = normalizeText(blocks.map((b) => (b.type === 'table' ? b.text : b.text)).join('\n'));

  if (text.replace(/[^a-z0-9]/gi, '').length < 40) {
    const error = new Error(emptyDocumentMessage);
    error.code = 'empty-docx';
    throw error;
  }

  onProgress(60, 'Building layout model');

  return {
    kind: 'docx',
    pageCount: null,
    text,
    blocks,
    tables,
    sections: sectPr ? 1 : 0,
    pageSize: pageSize.name,
    pageSizePt: { width: pageSize.widthPt, height: pageSize.heightPt },
    orientation: pageSize.orientation,
    columns,
    margins,
    defaultFontSize: sizes.length ? sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)] : defaults.sizePt || 10.5,
    fontFamily: fonts.length ? fonts[0] : defaults.fontFamily || null,
    fontSamples: sizes.map((size) => ({ font: fonts[0] || null, size, bold: false })),
    settings,
    bulletMarkers,
    knownBulletGlyph: bulletMarkers.find((m) => BULLET_GLYPHS.includes(m) || m === 'o') || '\u2022',
    fallback: false,
  };
};

const docxDefaults = () => ({
  pageCount: 1,
  pageSize: 'A4',
  pageSizePt: { width: 595.28, height: 841.89 },
  orientation: 'portrait',
  columns: 1,
  margins: { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 },
  defaultFontSize: 10.5,
  fontFamily: null,
  fontSamples: [],
  tables: [],
  bulletMarkers: [],
  knownBulletGlyph: '\u2022',
});

export { tableToBlocks, paragraphToBlock };
export default parseDocx;
