/**
 * DOCX exporter (browser-only, using the `docx` library and a local Blob
 * download).
 *
 * Reproduces the previewed design as closely as DOCX allows:
 *   page size + margins, fonts, font sizes, colours, heading rules,
 *   section order, right-aligned dates, bullet glyphs, tables and columns
 *   (column layout is applied for the whole document when the source used one).
 *
 * No network access, no backend.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  TabStopPosition,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { saveBlob } from '../utils/download.js';
import { SECTION_META } from '../data/sectionDictionary.js';
import { pxToMm } from '../utils/formattingUtils.js';

const pt = (px) => Math.max(4, Math.round(((Number(px) || 0) * 72) / 96 * 2) / 2);
const twipsFromPx = (px) => Math.round(((Number(px) || 0) * 1440) / 96);

/** Single shared numbering definition so Word does not invent its own list ids. */
const BULLET_REF = 'resume-bullets';

const bulletGlyph = (style) => {
  switch (style) {
    case 'square': return '\u25AA';
    case 'dash': return '\u2013';
    case 'arrow': return '\u2192';
    case 'none': return null;
    default: return '\u2022';
  }
};

const numberingConfig = (theme) => {
  const glyph = bulletGlyph(theme.bulletStyle);
  if (!glyph) return { config: [] };
  return {
    config: [
      {
        reference: BULLET_REF,
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: glyph,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 260, hanging: 180 } } },
          },
        ],
      },
    ],
  };
};

const stripXml = (name) => String(name || '')
  .replace(/['"]/g, '')
  .replace(/[^\w\s,.-]/g, '')
  .replace(/\s*,\s*/g, ',')
  .split(',')
  .map((f) => f.trim())
  .filter(Boolean)
  .slice(0, 12);

const headingParagraph = ({ title, theme, level = 1 }) => new Paragraph({
  heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
  spacing: { before: Math.round(pt(theme.spacing.headingTop) * 2), after: Math.round(pt(theme.spacing.headingBottom) * 2) },
  border: theme.ruleUnderHeadings
    ? { bottom: { style: BorderStyle.SINGLE, size: 6, space: 2, color: theme.colors.rule.replace('#', '') } }
    : undefined,
  children: [new TextRun({
    text: theme.upperCaseHeadings ? String(title || '').toUpperCase() : String(title || ''),
    bold: true,
    size: Math.round(pt(theme.fontSizes.heading) * 2),
    color: theme.colors.heading.replace('#', ''),
    font: stripXml(theme.headingFontFamily),
    characterSpacing: theme.styleId === 'corporate' ? 12 : 6,
  })],
});

const bodyRun = (text, theme, opts = {}) => new TextRun({
  text: String(text || ''),
  size: Math.round(pt(opts.size || theme.fontSizes.body) * 2),
  font: stripXml(theme.fontFamily),
  color: (opts.color || theme.colors.text).replace('#', ''),
  bold: Boolean(opts.bold),
  italics: Boolean(opts.italic),
});

const bulletParagraph = (text, theme) => new Paragraph({
  numbering: bulletGlyph(theme.bulletStyle) ? { reference: BULLET_REF, level: 0 } : undefined,
  spacing: { after: Math.round(pt(Math.max(2, theme.spacing.blockGap * 0.5)) * 2), line: Math.round(240 * theme.spacing.lineHeight) },
  children: [bodyRun(text, theme)],
});

const plainParagraph = (text, theme, opts = {}) => new Paragraph({
  alignment: opts.align,
  spacing: { after: Math.round(pt(opts.after ?? theme.spacing.blockGap) * 2), line: Math.round(240 * theme.spacing.lineHeight) },
  children: Array.isArray(text) ? text : [bodyRun(text, theme, opts)],
});

/** Role / company / dates line, with the date right-aligned via a tab stop. */
const entryHeaderParagraph = ({ role, company, location, dates, theme, subtitle }) => {
  const contentWidth = twipsFromPx(theme.page.widthPx - theme.margins.left - theme.margins.right);
  const children = [];
  if (role) children.push(bodyRun(role, theme, { bold: true, size: theme.fontSizes.body * 1.02 }));
  if (company) {
    if (role) children.push(bodyRun('  \u00B7  ', theme, { size: theme.fontSizes.body * 1.02 }));
    children.push(bodyRun(company, theme, { bold: true, size: theme.fontSizes.body * 1.02, color: theme.colors.accent }));
  }
  if (subtitle) {
    if (role || company) children.push(bodyRun('  \u00B7  ', theme, { size: theme.fontSizes.body * 1.02 }));
    children.push(bodyRun(subtitle, theme, { size: theme.fontSizes.body * 1.02 }));
  }
  if (location) {
    if (role || company || subtitle) children.push(bodyRun('  ·  ', theme, { size: theme.fontSizes.body * 1.02 }));
    children.push(bodyRun(location, theme, { size: theme.fontSizes.small, color: theme.colors.text }));
  }

  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
    spacing: { before: Math.round(pt(theme.spacing.entryGap) * 2), after: Math.round(pt(2) * 2), line: Math.round(240 * theme.spacing.lineHeight) },
    keepNext: true,
    // Reading order matters for re-parsing: entry details first, date after the tab.
    children: dates ? [...children, bodyRun(`\t${dates}`, theme, { size: theme.fontSizes.small, color: theme.colors.text })] : children,
  });
};

const inlineContactRuns = (personal, theme) => {
  const parts = [
    personal.location, personal.phone, personal.email, personal.linkedin,
    personal.portfolio || personal.website,
  ].filter(Boolean);
  const extras = (personal.extras || []).map((e) => e.text).filter(Boolean);
  const all = [...parts, ...extras];
  const runs = [];
  all.forEach((part, i) => {
    const isUrl = /^(https?:|www\.|linkedin\.|github\.|[^\s@]+@[^\s@]+)/i.test(part);
    if (isUrl && !/^[^\s@]+@[^\s@]+$/.test(part)) {
      const url = part.startsWith('http') ? part : `https://${part}`;
      runs.push(new ExternalHyperlink({
        link: url,
        children: [new TextRun({
          text: `${i ? '   |   ' : ''}${part}`,
          size: Math.round(pt(theme.fontSizes.contact) * 2),
          font: stripXml(theme.fontFamily),
          color: theme.colors.accent.replace('#', ''),
          underline: {},
        })],
      }));
    } else {
      runs.push(new TextRun({
        text: `${i ? '   |   ' : ''}${part}`,
        size: Math.round(pt(theme.fontSizes.contact) * 2),
        font: stripXml(theme.fontFamily),
        color: theme.colors.text.replace('#', ''),
      }));
    }
  });
  return runs;
};

const tableToDocx = (table, theme) => {
  const rows = (table.rows || []).map((row) => new TableRow({
    children: row.map((cell) => new TableCell({
      width: { size: Math.round(100 / Math.max(1, row.length)), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [new Paragraph({
        spacing: { after: 0, line: Math.round(240 * theme.spacing.lineHeight) },
        children: [bodyRun(String(cell ?? ''), theme)],
      })],
    })),
  }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: theme.colors.rule.replace('#', '') },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows,
  });
};

/**
 * @param {object} resume  optimized (or edited) resume model
 * @param {object} theme   output of buildTheme
 * @param {object} options { fileName, includePageNumbers, includeTables }
 */
export const buildDocxDocument = (resume, theme, options = {}) => {
  const {
    fileName = 'resume-optimized.docx',
    includePageNumbers = true,
    includeTables = true,
  } = options;

  const children = [];
  const p = resume.personal || {};

  // ---- header ----
  if (p.name) {
    children.push(new Paragraph({
      alignment: theme.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 60, line: 240 },
      children: [new TextRun({
        text: p.name,
        bold: true,
        size: Math.round(pt(theme.fontSizes.name) * 2),
        color: theme.colors.heading.replace('#', ''),
        font: stripXml(theme.headingFontFamily),
        characterSpacing: Math.round(theme.letterSpacing * 10),
      })],
    }));
  }
  if (p.headline) {
    children.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({
        text: p.headline,
        bold: true,
        size: Math.round(pt(theme.fontSizes.heading) * 2),
        color: theme.colors.accent.replace('#', ''),
        font: stripXml(theme.headingFontFamily),
      })],
    }));
  }
  const contactRuns = inlineContactRuns(p, theme);
  if (contactRuns.length) {
    children.push(new Paragraph({
      alignment: theme.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 120, line: Math.round(240 * theme.spacing.lineHeight) },
      children: contactRuns,
    }));
  }
  if (theme.ruleUnderHeader) {
    children.push(new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, space: 1, color: theme.colors.accent.replace('#', '') } },
      spacing: { after: 80 },
      children: [],
    }));
  }

  // ---- sections ----
  const sections = (resume.sections || []).filter((s) => s.visible !== false);
  for (const section of sections) {
    const id = section.id;
    const title = section.title || SECTION_META[id]?.defaultTitle || id;
    if (id === 'contact') continue;

    switch (id) {
      case 'summary': {
        if (!resume.summary) break;
        children.push(headingParagraph({ title, theme }));
        children.push(plainParagraph(resume.summary, theme));
        break;
      }
      case 'experience': {
        if (!resume.experience?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const entry of resume.experience) {
          children.push(entryHeaderParagraph({
            role: entry.role, company: entry.company, location: entry.location, dates: entry.dates, theme,
          }));
          for (const b of [...(entry.responsibilities || []), ...(entry.achievements || [])]) {
            children.push(bulletParagraph(b, theme));
          }
        }
        break;
      }
      case 'skills': {
        if (!resume.skills?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const group of resume.skills) {
          const runs = [];
          if (group.label) runs.push(bodyRun(`${group.label}: `, theme, { bold: true }));
          runs.push(bodyRun((group.items || []).join(', '), theme));
          children.push(new Paragraph({
            numbering: bulletGlyph(theme.bulletStyle) ? { reference: BULLET_REF, level: 0 } : undefined,
            spacing: { after: Math.round(pt(2) * 2), line: Math.round(240 * theme.spacing.lineHeight) },
            children: runs,
          }));
        }
        break;
      }
      case 'education': {
        if (!resume.education?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const ed of resume.education) {
          children.push(entryHeaderParagraph({
            role: ed.degree, company: ed.institution, location: ed.location, dates: ed.dates, theme,
          }));
          for (const d of ed.details || []) children.push(bulletParagraph(d, theme));
        }
        break;
      }
      case 'certifications': {
        if (!resume.certifications?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const c of resume.certifications) {
          // The year is part of the source fact, so it must survive the export.
          const label = c.year ? `${c.name}, ${c.year}` : c.name;
          children.push(bulletParagraph(label, theme));
        }
        break;
      }
      case 'projects': {
        if (!resume.projects?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const pr of resume.projects) {
          children.push(entryHeaderParagraph({
            role: pr.name, company: pr.role, dates: pr.dates, subtitle: pr.detail, theme,
          }));
          for (const b of pr.bullets || []) children.push(bulletParagraph(b, theme));
        }
        break;
      }
      case 'achievements': {
        if (!resume.achievements?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const a of resume.achievements) children.push(bulletParagraph(a.text, theme));
        break;
      }
      case 'languages': {
        if (!resume.languages?.length) break;
        children.push(headingParagraph({ title, theme }));
        children.push(plainParagraph(
          resume.languages.map((l) => (l.level ? `${l.text} (${l.level})` : l.text)).join(', '),
          theme,
        ));
        break;
      }
      case 'interests':
      case 'other': {
        if (!resume.other?.length) break;
        children.push(headingParagraph({ title, theme }));
        for (const o of resume.other) children.push(bulletParagraph(o.text, theme));
        break;
      }
      default:
        break;
    }

    // tables that belonged to a section (from the original layout)
    if (includeTables && (theme.preserveLayout || options.forceTables)) {
      const tables = (options.tables || []).filter((t) => t.sectionId === id || !t.sectionId);
      for (const table of tables) {
        children.push(tableToDocx(table, theme));
        children.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      }
    }
  }

  const contentWidth = twipsFromPx(theme.page.widthPx - theme.margins.left - theme.margins.right);
  const doc = new Document({
    creator: 'Resume Rewriter Studio (local, browser-only)',
    title: `${p.name || 'Resume'} - Resume`,
    description: 'Generated locally in the browser. No data was uploaded.',
    styles: {
      default: {
        document: {
          run: { font: stripXml(theme.fontFamily), size: Math.round(pt(theme.fontSizes.body) * 2), color: theme.colors.text.replace('#', '') },
          paragraph: { spacing: { line: Math.round(240 * theme.spacing.lineHeight) } },
        },
      },
    },
    numbering: numberingConfig(theme),
    sections: [{
      properties: {
        page: {
          size: {
            width: twipsFromPx(theme.page.widthPx),
            height: twipsFromPx(theme.page.heightPx),
            orientation: theme.page.widthPx > theme.page.heightPx ? 'landscape' : undefined,
          },
          margin: {
            top: twipsFromPx(theme.margins.top),
            right: twipsFromPx(theme.margins.right),
            bottom: twipsFromPx(theme.margins.bottom),
            left: twipsFromPx(theme.margins.left),
            header: 360,
            footer: 360,
          },
          column: theme.columns > 1
            ? { count: theme.columns, space: 320, separate: false }
            : undefined,
        },
      },
      headers: includePageNumbers
        ? {
          default: new Header({
            children: [new Paragraph({
              tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
              children: [
                new TextRun({
                  text: `${p.name || 'Resume'}\t`,
                  size: Math.round(pt(theme.fontSizes.small * 0.9) * 2),
                  color: theme.colors.text.replace('#', ''),
                  font: stripXml(theme.fontFamily),
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: Math.round(pt(theme.fontSizes.small * 0.9) * 2),
                  color: theme.colors.text.replace('#', ''),
                }),
              ],
            })],
          }),
        }
        : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `Page `,
              size: Math.round(pt(theme.fontSizes.small * 0.9) * 2),
              color: theme.colors.text.replace('#', ''),
            }), new TextRun({ children: [PageNumber.CURRENT], size: Math.round(pt(theme.fontSizes.small * 0.9) * 2), color: theme.colors.text.replace('#', '') }),
            new TextRun({ text: ` of `, size: Math.round(pt(theme.fontSizes.small * 0.9) * 2), color: theme.colors.text.replace('#', '') }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: Math.round(pt(theme.fontSizes.small * 0.9) * 2), color: theme.colors.text.replace('#', '') })],
          })],
        }),
      },
      children,
    }],
  });

  return { doc, fileName, pageWidthMm: pxToMm(theme.page.widthPx), pageHeightMm: pxToMm(theme.page.heightPx) };
};

/** Generate and trigger a browser download. */
export const exportDocx = async (resume, theme, options = {}) => {
  const { doc, fileName } = buildDocxDocument(resume, theme, options);
  const blob = await Packer.toBlob(doc);
  saveBlob(blob, fileName);
  return { fileName, size: blob.size };
};

export { pt, twipsFromPx, stripXml };
export default exportDocx;
