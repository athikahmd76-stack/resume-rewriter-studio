/**
 * ResumeLayoutAnalyzer
 *
 * Takes the output of pdfParser / docxParser and produces a layout model that
 * the renderer + exporters use to reproduce the *visual identity* of the
 * original document: page size, orientation, columns, typography scale, spacing
 * rhythm, bullet style, alignment, table structure and section order.
 *
 * IMPORTANT LIMITATION (surfaced in the UI):
 * Pixel-perfect reconstruction of arbitrary PDF/DOCX files is not possible in
 * a browser. We reproduce structure, hierarchy, typography scale, spacing
 * rhythm, bullets, columns and tables - the closest faithful representation.
 */

import { BUILTIN_STYLES, detectBulletStyle, pxToMm, A4 } from '../utils/formattingUtils.js';
import { SECTION_META, CANONICAL_SECTION_ORDER } from '../data/sectionDictionary.js';

const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const mode = (arr) => {
  const counts = new Map();
  for (const v of arr) {
    if (v === null || v === undefined || v === '') continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) { best = k; bestN = n; }
  }
  return best;
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/** Blur an RGB colour towards black (for accent rules) keeping it readable. */
const darken = (rgb, amount = 0.35) => rgbToHex({
  r: rgb.r * (1 - amount), g: rgb.g * (1 - amount), b: rgb.b * (1 - amount),
});

/** Does this look like a decorative colour, or just plain text/greyscale? */
const isDecorative = (hex) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  if (saturation < 0.18) return false;
  // ignore near-black / near-white
  if (max < 70 || min > 225) return false;
  return true;
};

const FONT_STACKS = [
  { match: /calibri|carlito/i, stack: "'Calibri', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { match: /arial|helvetica|liberation ?sans|nimbus ?sans/i, stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  { match: /times|georgia|garamond|cambria|book ?antiqua|minion|liberation ?serif|nimbus ?roman/i, stack: "Georgia, 'Times New Roman', 'Iowan Old Style', serif" },
  { match: /gill|franklin|avenir|proxima|montserrat|lato|open ?sans|roboto|inter|source ?sans/i, stack: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif" },
  { match: /garamond|palatino|century ?schoolbook/i, stack: "Garamond, 'Palatino Linotype', Palatino, serif" },
];

const resolveFontStack = (name) => {
  if (!name) return null;
  for (const { match, stack } of FONT_STACKS) {
    if (match.test(name)) return { source: name, stack };
  }
  return { source: name, stack: `'${name.replace(/'/g, '')}', 'Segoe UI', Arial, sans-serif` };
};

const ptToPx = (pt) => (Number(pt) * 96) / 72;
const pxToPt = (px) => (Number(px) * 72) / 96;

/**
 * @param {object} parsed  output of parsePdf / parseDocx
 * @param {Array} sectionOrder  ordered list of section ids detected in the resume
 */
export const analyzeLayout = (parsed, sectionOrder = []) => {
  const isPdf = parsed.kind === 'pdf';

  // ---- page geometry ------------------------------------------------------
  const pageSize = parsed.pageSize || 'A4';
  const pageSizePt = isPdf
    ? { width: parsed.pages?.[0]?.width ?? 595.28, height: parsed.pages?.[0]?.height ?? 841.89 }
    : parsed.pageSizePt || { width: 595.28, height: 841.89 };
  const orientation = parsed.orientation || (pageSizePt.width > pageSizePt.height ? 'landscape' : 'portrait');

  // ---- margins (normalise everything to px for CSS) ----------------------
  const rawMargins = parsed.margins || {};
  const toPx = (v, fallbackPt) => (typeof v === 'number' && v > 0 ? (isPdf ? v : ptToPx(v)) : ptToPx(fallbackPt));
  const margins = {
    top: toPx(rawMargins.top, 54),
    right: toPx(rawMargins.right, 54),
    bottom: toPx(rawMargins.bottom, 54),
    left: toPx(rawMargins.left, 54),
  };
  // guard against absurd auto-detected margins
  for (const key of ['top', 'right', 'bottom', 'left']) {
    if (!Number.isFinite(margins[key]) || margins[key] <= 4) margins[key] = 54;
    margins[key] = Math.min(margins[key], 120);
  }

  // ---- typography scale ---------------------------------------------------
  const bodySizes = [];
  for (const b of parsed.blocks || []) {
    if (b.type === 'bullet' || b.type === 'paragraph' || b.type === 'heading') {
      if (typeof b.fontSize === 'number' && b.fontSize > 4 && b.fontSize < 40) bodySizes.push(isPdf ? b.fontSize : ptToPx(b.fontSize));
    }
  }
  if (!bodySizes.length && Array.isArray(parsed.fontSamples)) {
    for (const f of parsed.fontSamples) {
      if (typeof f.size === 'number' && f.size > 4 && f.size < 40) bodySizes.push(isPdf ? f.size : ptToPx(f.size));
    }
  }
  if (!bodySizes.length) {
    for (const p of parsed.pages || []) for (const s of p.fontSizes || []) bodySizes.push(s);
  }

  const baseFontSize = bodySizes.length ? median(bodySizes) : 10.5 * (96 / 72);
  const headingSizes = bodySizes.filter((s) => s > baseFontSize * 1.12);
  const nameSizes = bodySizes.filter((s) => s > baseFontSize * 1.45);
  const headingFontSize = headingSizes.length ? median(headingSizes) : baseFontSize * 1.14;
  const nameFontSize = nameSizes.length ? Math.max(...nameSizes.slice(0, 3)) : baseFontSize * 2.1;

  // ---- fonts --------------------------------------------------------------
  const rawFonts = (parsed.blocks || []).map((b) => b.fontFamily).filter(Boolean);
  if (!rawFonts.length && parsed.fontFamily) rawFonts.push(parsed.fontFamily);
  if (!rawFonts.length && Array.isArray(parsed.fontSamples) && parsed.fontSamples[0]?.font) {
    rawFonts.push(parsed.fontSamples[0].font);
  }
  const font = resolveFontStack(mode(rawFonts));
  const isSerif = font ? /serif|times|georgia|garamond|garamond|cambria|book/i.test(font.stack) : false;

  // ---- colours ------------------------------------------------------------
  const rawColors = (parsed.blocks || [])
    .map((b) => b.color)
    .filter((c) => c && c !== 'auto' && c !== '000000');
  const decorative = rawColors.map((c) => (c.length === 6 ? `#${c}` : c)).filter(isDecorative);
  const accentHex = decorative.length >= 2 ? mode(decorative) : decorative[0] || null;
  const accentRgb = accentHex ? hexToRgb(accentHex) : null;

  // ---- spacing rhythm -----------------------------------------------------
  const lineHeights = [];
  if (isPdf && parsed.pages?.[0]?.lines?.length > 3) {
    const ys = parsed.pages[0].lines.map((l) => l.y).sort((a, b) => b - a);
    for (let i = 1; i < ys.length; i += 1) {
      const d = ys[i - 1] - ys[i];
      if (d > 1 && d < 80) lineHeights.push(d);
    }
  }
  const medianLine = lineHeights.length ? median(lineHeights) : baseFontSize * 1.42;
  const lineHeight = Math.min(1.75, Math.max(1.2, medianLine / baseFontSize));

  const gapsAfter = [];
  if (isPdf && parsed.pages?.[0]?.blocks?.length > 3) {
    const sorted = [...parsed.pages[0].blocks].sort((a, b) => b.y - a.y);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i - 1].bottomY - sorted[i].y - baseFontSize;
      if (gap > -2 && gap < 120) gapsAfter.push(gap);
    }
  }
  const blockGap = gapsAfter.length ? median(gapsAfter.filter((g) => g > 1)) : baseFontSize * 0.75;
  const sectionGap = gapsAfter.length ? Math.max(median(gapsAfter), baseFontSize * 0.95) : baseFontSize * 1.25;
  const entryGap = Math.max(baseFontSize * 0.5, Math.min(blockGap, baseFontSize * 0.9));

  // ---- alignment / bullets / columns / tables ------------------------------
  const alignMode = mode((parsed.blocks || []).map((b) => b.align).filter(Boolean)) || 'left';
  const bulletStyle = detectBulletStyle(parsed.rawText || parsed.text || (parsed.blocks || []).map((b) => b.text).join('\n'));
  const hasKnownGlyph = isPdf ? null : (parsed.knownBulletGlyph || null);
  const tables = (parsed.tables || (isPdf ? derivePdfTables(parsed) : [])).filter((t) => t && (t.rowCount || (t.rows || []).length));

  const columns = Math.max(1, parsed.columns || 1);

  // ---- section order (from the original document) -------------------------
  const order = (sectionOrder && sectionOrder.length ? sectionOrder : CANONICAL_SECTION_ORDER)
    .filter((id) => SECTION_META[id]);

  const layout = {
    pageSize,
    pageSizePt,
    orientation,
    columns,
    page: {
      widthPx: Math.round(pageSizePt.width),
      heightPx: Math.round(pageSizePt.height),
      widthMm: pxToMm(pageSizePt.width).toFixed(1),
      heightMm: pxToMm(pageSizePt.height).toFixed(1),
      ratio: pageSizePt.height / pageSizePt.width,
    },
    header: {
      fontSizePx: Math.round(nameFontSize),
      fontWeight: 700,
      align: alignMode,
      ruleBelow: isPdf ? false : true,
    },
    sections: order.map((id, i) => ({
      id,
      title: SECTION_META[id].defaultTitle,
      order: i,
      detectedOrder: i,
    })),
    fontFamily: font?.stack || BUILTIN_STYLES.minimal.fontFamily,
    fontSource: font?.source || null,
    isSerif,
    fontSizes: {
      namePx: Math.round(nameFontSize),
      contactPx: Math.max(9, Math.round(baseFontSize * 0.94)),
      headingPx: Math.round(headingFontSize),
      bodyPx: Number(baseFontSize.toFixed(2)),
      smallPx: Number((baseFontSize * 0.9).toFixed(2)),
    },
    spacing: {
      lineHeight: Number(lineHeight.toFixed(2)),
      blockGapPx: Math.round(Math.max(3, blockGap)),
      sectionGapPx: Math.round(Math.max(8, sectionGap)),
      entryGapPx: Math.round(Math.max(4, entryGap)),
      headingMarginTopPx: Math.round(Math.max(6, sectionGap * 0.72)),
      headingMarginBottomPx: Math.round(Math.max(3, baseFontSize * 0.34)),
    },
    margins: {
      topPx: Math.round(margins.top),
      rightPx: Math.round(margins.right),
      bottomPx: Math.round(margins.bottom),
      leftPx: Math.round(margins.left),
      topMm: Number(pxToMm(margins.top).toFixed(1)),
      rightMm: Number(pxToMm(margins.right).toFixed(1)),
      bottomMm: Number(pxToMm(margins.bottom).toFixed(1)),
      leftMm: Number(pxToMm(margins.left).toFixed(1)),
    },
    colors: {
      text: '#111827',
      heading: accentRgb ? rgbToHex({ r: accentRgb.r * 0.8, g: accentRgb.g * 0.8, b: accentRgb.b * 0.8 }) : '#111827',
      accent: accentHex || (isSerif ? '#1c1917' : '#0f3d5e'),
      accentMuted: accentRgb ? darken(accentRgb, 0.55) : '#9ca3af',
      rule: accentRgb ? rgbToHex({ r: (accentRgb.r + 255) / 2, g: (accentRgb.g + 255) / 2, b: (accentRgb.b + 255) / 2 }) : '#d1d5db',
      hasAccent: Boolean(accentRgb),
    },
    bulletStyle: hasKnownGlyph && hasKnownGlyph !== 'o' ? glyphToStyle(hasKnownGlyph) : bulletStyle,
    alignment: alignMode,
    tables: tables.map((t) => ({
      rowCount: t.rowCount || (t.rows || []).length,
      colCount: t.colCount || Math.max(0, ...(t.rows || []).map((r) => r.length)),
      rows: (t.rows || []).slice(0, 40).map((r) => r.map((c) => (typeof c === 'string' ? c : c.text))),
    })),
    fidelity: {
      source: isPdf ? 'pdf-text-layer' : 'ooxml',
      exact: false,
      note: isPdf
        ? 'Rebuilt from the PDF text layer: real positions, sizes and columns are preserved, but the original font files and vector rules are approximated with web-safe equivalents.'
        : 'Rebuilt from the DOCX XML: page size, margins, columns, sizes, bullets and tables are preserved; the original theme fonts are mapped to web-safe equivalents.',
    },
  };

  return layout;
};

const glyphToStyle = (glyph) => {
  if (glyph === '\u25CF') return 'disc';
  if (glyph === '\u25AA' || glyph === '\u25E6' || glyph === '\u25C6') return 'square';
  if (glyph === '\u2013' || glyph === '-') return 'dash';
  if (glyph === '\u2192') return 'arrow';
  return 'dot';
};

/** Reconstruct approximate tables from PDF text (2+ aligned short columns). */
const derivePdfTables = (parsed) => {
  const tables = [];
  for (const page of parsed.pages || []) {
    const lines = page.lines || [];
    const body = median(lines.map((l) => l.fontSize)) || 10;
    const candidates = lines.filter((l) => l.fontSize < body * 1.15);
    if (candidates.length < 4) continue;
    const groups = [];
    let current = [];
    for (const line of candidates) {
      if (!current.length || Math.abs(current[0].y - line.y) < 4) current.push(line);
      else { groups.push(current); current = [line]; }
    }
    if (current.length) groups.push(current);
    for (const g of groups) {
      if (g.length < 3) continue;
      const text = g.map((l) => l.text).join('  ').trim();
      if (!/\|/.test(text) && !/\s{3,}/.test(text)) continue;
      const rows = g.map((l) => l.text.split(/\s{2,}|\s\|\s?/).map((c) => c.trim()).filter(Boolean));
      if (rows.some((r) => r.length >= 2)) {
        tables.push({ rows, rowCount: rows.length, colCount: Math.max(...rows.map((r) => r.length)) });
      }
    }
  }
  return tables;
};

export { ptToPx, pxToPt };
export default analyzeLayout;
