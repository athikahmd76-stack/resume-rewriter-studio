/**
 * Report exporter (browser-only).
 *
 * The report PDF is composed with jsPDF's own text and vector API rather than a
 * canvas rasterisation of the DOM. That is deliberate:
 *
 *   - the text stays selectable and searchable, so the PDF itself is ATS-safe;
 *   - it cannot come out as a blank or grey sheet the way a rasterised page can;
 *   - it needs no off-screen export stage, so it works from any tab.
 *
 * HTML, Markdown and JSON are plain Blobs handed to the browser's own download
 * mechanism. Nothing is uploaded and no third-party download service is used.
 */

import { saveBlob, textBlob } from '../utils/download.js';
import { reportToHtml, reportToMarkdown, reportToText, reportToJson, REPORT_FORMATS } from './reportBuilder.js';

const MARGIN = 48;
const PAGE_W = 595.28; // A4 portrait, pt
const PAGE_H = 841.89;

const INK = [15, 23, 42];
const INK_2 = [51, 65, 85];
const MUTED = [100, 116, 139];
const LINE = [226, 232, 240];
const OK = [21, 128, 61];
const DANGER = [185, 28, 28];
const BRAND = [29, 78, 216];
const PANEL = [248, 250, 252];

const bandColor = (v) => (v >= 80 ? [22, 163, 74] : v >= 60 ? [101, 163, 13] : v >= 42 ? [217, 119, 6] : [220, 38, 38]);

/**
 * Build the report PDF with jsPDF's text/vector API.
 * @param {object} report buildReport() output
 * @param {object} [options] { fileName, onProgress }
 */
export const exportReportPdf = async (report, options = {}) => {
  const { fileName = 'resume-analysis-report.pdf', onProgress = () => {} } = options;
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  onProgress(12, 'Loading PDF engine');

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const W = PAGE_W - MARGIN * 2;
  let y = MARGIN;
  let page = 1;

  const setFont = (style = 'normal', size = 10, color = INK) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  const line = (x1, yy1, x2, yy2, color = LINE, width = 0.7) => {
    pdf.setDrawColor(...color);
    pdf.setLineWidth(width);
    pdf.line(x1, yy1, x2, yy2);
  };
  const ensure = (needed) => {
    if (y + needed <= PAGE_H - MARGIN) return;
    pdf.addPage('a4', 'portrait');
    y = MARGIN;
    page += 1;
  };
  const heading = (label) => {
    ensure(40);
    y += 16;
    setFont('bold', 13.5, INK);
    pdf.text(String(label).toUpperCase(), MARGIN, y);
    y += 5;
    line(MARGIN, y, PAGE_W - MARGIN, y, INK, 1.1);
    y += 14;
  };
  const wrapped = (value, { size = 9.5, color = INK_2, indent = 0, lineHeight = 12.5, max = W } = {}) => {
    setFont('normal', size, color);
    const lines = pdf.splitTextToSize(String(value ?? ''), max - indent);
    for (const l of lines) {
      ensure(lineHeight);
      pdf.text(l, MARGIN + indent, y);
      y += lineHeight;
    }
  };
  const bullet = (value, { indent = 10, size = 9.5, color = INK_2, marker = '-' } = {}) => {
    setFont('normal', size, color);
    const lines = pdf.splitTextToSize(String(value ?? ''), W - indent - 8);
    lines.forEach((l, i) => {
      ensure(12.5);
      if (i === 0) {
        setFont('normal', size, MUTED);
        pdf.text(marker, MARGIN + indent - 8, y);
      }
      pdf.text(l, MARGIN + indent, y);
      y += 12.5;
    });
  };
  const panel = (h, fill = PANEL) => {
    ensure(h + 10);
    pdf.setFillColor(...fill);
    pdf.rect(MARGIN, y - 4, W, h, 'F');
  };

  /* ------------------------------------------------------------- header */
  setFont('bold', 20, INK);
  pdf.text(report.meta.app.toUpperCase(), MARGIN, y + 6);
  y += 20;
  setFont('normal', 9, MUTED);
  pdf.text('Resume analysis report - generated locally in the browser', MARGIN, y);
  y += 8;
  line(MARGIN, y, PAGE_W - MARGIN, y, INK, 1.4);
  y += 16;

  const metaRows = [
    ['Candidate', report.candidate.name],
    ['Target role', report.target.role],
    ['Source document', report.meta.sourceFileName],
    ['Style', report.meta.styleName + (report.meta.edited ? ' (manually edited)' : '')],
    ['Generated', report.meta.generatedAtLabel],
    ['Job description', report.meta.jdProvided ? 'Analysised locally' : 'Not provided'],
  ];
  metaRows.forEach(([k, v], i) => {
    const col = i % 2;
    const rowY = y + Math.floor(i / 2) * 26;
    if (col === 0) {
      setFont('normal', 7.5, MUTED);
      pdf.text(String(k).toUpperCase(), MARGIN, rowY);
    }
    setFont('bold', 10, INK);
    pdf.text(pdf.splitTextToSize(String(v), W / 2 - 16)[0], MARGIN + 92 + col * (W / 2), rowY);
  });
  y += Math.ceil(metaRows.length / 2) * 26 + 8;

  /* ------------------------------------------------------------ headline */
  if (report.headline) {
    ensure(46);
    panel(34, [239, 246, 255]);
    wrapped(report.headline, { size: 10, color: BRAND, indent: 12, lineHeight: 13, max: W - 24 });
    y += 10;
  }

  /* ------------------------------------------------------ scores section */
  const drawScoreBlock = (s) => {
    ensure(120);
    y += 6;
    setFont('bold', 12, INK);
    pdf.text(s.label.toUpperCase(), MARGIN, y);
    y += 6;
    line(MARGIN, y, PAGE_W - MARGIN, y, LINE, 0.8);
    y += 16;

    const cellW = W / 2 - 40;
    [['Before', s.before, MUTED], ['After', s.after, bandColor(s.after)]].forEach(([cap, val, color], i) => {
      const x = MARGIN + i * (cellW + 80);
      setFont('normal', 7.5, MUTED);
      pdf.text(String(cap).toUpperCase(), x, y);
      y += 2;
      setFont('bold', 24, color);
      pdf.text(`${val}%`, x, y + 18);
      const barW = cellW;
      const barY = y + 26;
      pdf.setFillColor(241, 245, 249);
      pdf.rect(x, barY, barW, 6, 'F');
      pdf.setFillColor(...bandColor(val));
      pdf.rect(x, barY, (barW * Math.max(0, Math.min(100, val))) / 100, 6, 'F');
      y = barY + 22;
    });

    setFont('bold', 11, s.delta >= 0 ? OK : DANGER);
    pdf.text(`${s.delta > 0 ? '+' : ''}${s.delta} points change`, MARGIN + W - 130, y - 4);
    y += 8;

    if (s.verdict) {
      ensure(34);
      wrapped(s.verdict, { size: 9, color: INK_2, indent: 8, lineHeight: 11.5, max: W - 16 });
      y += 8;
    }

    s.components.forEach((c) => {
      ensure(17);
      setFont('normal', 8.5, MUTED);
      pdf.text(c.label, MARGIN, y);
      setFont('bold', 8.5, INK);
      pdf.text(`${c.before}%`, MARGIN + W - 190, y, { align: 'right' });
      setFont('normal', 8.5, MUTED);
      pdf.text('->', MARGIN + W - 165, y, { align: 'right' });
      setFont('bold', 9, c.after >= c.before ? OK : DANGER);
      pdf.text(`${c.after}%`, MARGIN + W - 128, y, { align: 'right' });
      setFont('bold', 8.5, c.delta > 0 ? OK : c.delta < 0 ? DANGER : MUTED);
      pdf.text(`${c.delta > 0 ? '+' : ''}${c.delta}`, MARGIN - 0, y, { align: 'right' });
      y += 5;
      line(MARGIN, y, PAGE_W - MARGIN, y, [241, 245, 249], 0.5);
      y += 12;
    });
    y += 8;
  };

  heading('Scores - before and after');
  drawScoreBlock(report.scores.jobMatch);
  drawScoreBlock(report.scores.ats);

  ensure(34);
  setFont('italic', 8, MUTED);
  const disc = pdf.splitTextToSize(report.scores.ats.disclaimer, W);
  disc.forEach((l) => { ensure(10); pdf.text(l, MARGIN, y); y += 10; });
  y += 6;

  /* ---------------------------------------------------------- SWOT grid */
  heading('SWOT analysis');
  ensure(30);
  setFont('italic', 8, MUTED);
  pdf.splitTextToSize(report.swot.disclaimer, W).forEach((l) => { ensure(10); pdf.text(l, MARGIN, y); y += 10; });
  y += 10;

  const QUADS = [
    ['Strengths', report.swot.strengths, [22, 163, 74], [240, 253, 244]],
    ['Weaknesses', report.swot.weaknesses, [217, 119, 6], [255, 251, 235]],
    ['Opportunities', report.swot.opportunities, BRAND, [239, 246, 255]],
    ['Threats', report.swot.threats, [220, 38, 38], [254, 242, 242]],
  ];
  const colW = W / 2 - 8;
  // Each quadrant is drawn as its own stacked block so a long list simply
  // continues onto the next page instead of being clipped.
  QUADS.forEach(([label, items, accent, fill]) => {
    ensure(46);
    const boxTop = y;
    pdf.setFillColor(...fill);
    pdf.setDrawColor(...accent);
    pdf.setLineWidth(1.6);
    const boxH = Math.max(46, 16 + items.length * 34);
    pdf.rect(MARGIN, boxTop, colW, Math.min(boxH, 34), 'F');
    pdf.rect(MARGIN, boxTop, 3, Math.min(boxH, 34), 'F');
    setFont('bold', 9, accent);
    pdf.text(label.toUpperCase(), MARGIN + 10, boxTop + 15);
    setFont('normal', 8, MUTED);
    pdf.text(`${items.length}`, MARGIN + 10 + pdf.getTextWidth(label) + 6, boxTop + 15);
    y = boxTop + 26;

    if (!items.length) {
      setFont('italic', 8.5, MUTED);
      pdf.text('Nothing detected by the local rules.', MARGIN + 10, y);
      y += 14;
    } else {
      items.forEach((i) => {
        setFont('bold', 8.8, INK);
        pdf.splitTextToSize(i.title, colW - 20).forEach((l) => { ensure(11); pdf.text(l, MARGIN + 10, y); y += 11; });
        setFont('normal', 8, INK_2);
        pdf.splitTextToSize(i.detail, colW - 20).forEach((l) => { ensure(10); pdf.text(l, MARGIN + 10, y); y += 10; });
        y += 6;
      });
    }
    y += 12;
  });

  /* ---------------------------------------------------------- keywords */
  heading('Keyword analysis');
  ensure(28);
  setFont('normal', 9, INK_2);
  pdf.text(
    `Coverage ${report.keywords.coverage}% of ${report.keywords.targetsConsidered} targets considered. `
    + `Matched ${report.keywords.matched.length} | synonym aligned ${report.keywords.synonyms.length} | `
    + `missing ${report.keywords.missing.length} | repeated ${report.keywords.repeated.length}.`,
    MARGIN,
    y,
  );
  y += 16;

  if (report.keywords.missing.length) {
    ensure(20);
    setFont('bold', 8.5, DANGER);
    pdf.text('MISSING - NOT FOUND IN SOURCE RESUME (reported, never added)', MARGIN, y);
    y += 13;
    report.keywords.missing.forEach((k) => bullet(`${k.display} (${k.priority || 'n/a'})`, { color: DANGER }));
    y += 8;
  }
  if (report.keywords.matched.length) {
    ensure(20);
    setFont('bold', 8.5, OK);
    pdf.text('MATCHED', MARGIN, y);
    y += 13;
    const cols = 3;
    const colWidth = W / cols;
    const startY = y;
    report.keywords.matched.forEach((k, i) => {
      const c = i % cols;
      const row = Math.floor(i / cols);
      const yy = startY + row * 12;
      if (yy > PAGE_H - MARGIN) return;
      setFont('normal', 8.2, INK_2);
      pdf.text(pdf.splitTextToSize(k.display, colWidth - 8)[0], MARGIN + c * colWidth, yy);
    });
    y = startY + Math.ceil(report.keywords.matched.length / cols) * 12 + 8;
  }

  /* --------------------------------------------------- recommendations */
  if (report.recommendations.length) {
    heading('Recommendations');
    report.recommendations.forEach((r) => {
      ensure(26);
      setFont('bold', 9, INK);
      pdf.text(pdf.splitTextToSize(`[${r.level.toUpperCase()}] ${r.title}`, W)[0], MARGIN, y);
      y += 12;
      if (r.detail) { wrapped(r.detail, { size: 8.3, indent: 12, lineHeight: 10.5 }); }
      if (r.note) { setFont('italic', 8, MUTED); wrapped(r.note, { size: 8, indent: 12, lineHeight: 10.5, color: MUTED }); }
      y += 6;
    });
  }

  /* --------------------------------------------------------- fact guard */
  if (report.guard) {
    heading('Fact guard');
    ensure(30);
    panel(20, report.guard.passed ? [240, 253, 244] : [254, 242, 242]);
    setFont('bold', 9.5, report.guard.passed ? OK : DANGER);
    pdf.text(report.guard.passed ? 'PASSED - no unsupported content was introduced' : `${report.guard.blockedCount} item(s) blocked`, MARGIN + 8, y + 6);
    y += 18;
    if (report.guard.guarantee) wrapped(report.guard.guarantee, { size: 8.5, indent: 8, lineHeight: 11 });
    y += 8;
  }

  /* -------------------------------------------------------- honesty box */
  heading('Honesty and privacy');
  report.honesty.forEach((h) => bullet(h, { color: INK_2, marker: '>' }));

  y += 10;
  ensure(24);
  line(MARGIN, y, PAGE_W - MARGIN, y, LINE, 0.7);
  y += 12;
  setFont('normal', 7.5, MUTED);
  pdf.text(`${report.meta.app} - ${report.meta.schema} - ${page} page(s) - no resume data left this device.`, MARGIN, y);

  onProgress(90, 'Saving file');
  pdf.setProperties({
    title: `${report.meta.app} - ${report.candidate.name}`,
    subject: 'Resume analysis report generated locally in the browser. No data was uploaded.',
    creator: `${report.meta.app} (local, browser-only)`,
  });
  pdf.save(fileName);
  onProgress(100, 'Done');

  return { fileName, pageCount: pdf.getNumberOfPages() };
};

/**
 * Download the report in a chosen format. Everything is produced in this tab.
 * @param {object} report buildReport() output
 * @param {string} format 'pdf' | 'html' | 'md' | 'json' | 'txt'
 * @param {object} [options] { fileName, onProgress }
 */
export const exportReport = async (report, format, options = {}) => {
  const meta = REPORT_FORMATS.find((f) => f.id === format);
  if (!meta) throw new Error(`Unknown report format: ${format}`);
  const base = (options.fileName || 'resume-analysis-report').replace(/\.(pdf|html|md|json|txt)$/i, '');
  const fileName = `${base}.${meta.ext}`;

  if (format === 'pdf') return exportReportPdf(report, { fileName, onProgress: options.onProgress });

  if (format === 'html') return saveBlob(textBlob(reportToHtml(report), meta.mime), fileName);
  if (format === 'md') return saveBlob(textBlob(reportToMarkdown(report), meta.mime), fileName);
  if (format === 'json') return saveBlob(textBlob(reportToJson(report), meta.mime), fileName);
  return saveBlob(textBlob(reportToText(report), meta.mime), `${base}.txt`);
};

/** Suggested file name for a report, derived from the source document name. */
export const reportFileName = (sourceName, format) => {
  const base = String(sourceName || 'resume').replace(/\.(pdf|docx)$/i, '');
  const ext = REPORT_FORMATS.find((f) => f.id === format)?.ext || 'pdf';
  return `${base}-analysis-report.${ext}`;
};

export { REPORT_FORMATS };
export default exportReport;
