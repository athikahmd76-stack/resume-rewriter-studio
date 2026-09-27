/**
 * PDF exporter (browser-only).
 *
 * Approach: render the *same* React preview DOM to a canvas with html2canvas
 * and place each page onto an A4 jsPDF page at 1:1 CSS-pixel scale. That keeps
 * the exported PDF visually identical to what the user sees on screen.
 *
 * Fallback: if html2canvas cannot rasterise (rare, usually a tainted canvas or a
 * missing font), we open the browser print dialog for the preview element so
 * the user can "Save as PDF" - still 100% client-side.
 */


const A4_MM = { width: 210, height: 297 };

const loadScript = (src) => new Promise((resolve, reject) => {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    if (existing.dataset.loaded === 'true') resolve();
    else {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)));
    }
    return;
  }
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  el.crossOrigin = 'anonymous';
  el.onload = () => { el.dataset.loaded = 'true'; resolve(); };
  el.onerror = () => reject(new Error(`Failed to load ${src}`));
  document.head.appendChild(el);
});

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const RASTER_STYLE_ID = 'rsp-raster-style';

/**
 * Screen-only styling that must never reach the rasteriser.
 *
 * html2canvas paints `box-shadow` as part of an element's background layer, so a
 * soft shadow gets smeared across the whole page and the exported PDF comes out
 * as a uniform grey sheet. Filters, transitions and animated entrances distort
 * the capture the same way. Everything below is neutralised for the duration of
 * the capture and restored immediately afterwards.
 */
const beginRasterMode = (root) => {
  document.getElementById(RASTER_STYLE_ID)?.remove();
  const selector = root.id ? `#${CSS.escape(root.id)}` : '.export-root';
  const style = document.createElement('style');
  style.id = RASTER_STYLE_ID;
  style.textContent = `
    ${selector}, ${selector} * , ${selector} *::before, ${selector} *::after {
      box-shadow: none !important;
      text-shadow: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
  `;
  document.head.appendChild(style);
  return () => document.getElementById(RASTER_STYLE_ID)?.remove();
};

/**
 * Ink coverage of a captured page.
 *
 * A rendered resume page is mostly white with text on it. `ink` near zero means
 * nothing was captured; `white` far below 1 means something opaque was smeared
 * over the page (a box-shadow, a scrim, a filter). Both produce a "blank
 * resume" file, so both are treated as a failed capture.
 */
const coverage = (canvas) => {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let ink = 0;
  let white = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) ink += 1;
    else white += 1;
  }
  const total = data.length / 4;
  return { ink: ink / total, white: white / total };
};

/**
 * @param {HTMLElement} previewRoot  container holding `.rsp-page` elements
 * @param {object} options { fileName, scale, onProgress, quality }
 */
export const exportPdfFromElement = async (previewRoot, options = {}) => {
  const {
    fileName = 'resume-optimized.pdf',
    scale = 2,
    onProgress = () => {},
    orientation,
  } = options;

  if (!previewRoot) throw new Error('Nothing to export - generate the resume first.');
  const pages = Array.from(previewRoot.querySelectorAll('.rsp-page'));
  if (!pages.length) throw new Error('No rendered pages were found to export. Try regenerating the preview.');

  onProgress(8, 'Loading PDF engine');

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const endRasterMode = beginRasterMode(previewRoot);

  onProgress(20, 'Rasterising pages');

  try {
    const pageWidth = pages[0].offsetWidth || 794;
    const pageHeight = pages[0].offsetHeight || 1123;
    const landscape = orientation || (pageWidth > pageHeight ? 'landscape' : 'portrait');

    const pdf = new jsPDF({
      orientation: landscape,
      unit: 'mm',
      format: 'a4',
      compress: true,
      putOnlyUsedFonts: true,
    });

    for (let i = 0; i < pages.length; i += 1) {
      const canvas = await html2canvas(pages[i], {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 0,
        windowWidth: pageWidth,
        windowHeight: pageHeight,
      });

      // A capture that came back empty, or flattened under an opaque overlay,
      // is not a resume. Fail here so the caller falls back to a text PDF
      // instead of saving a blank sheet.
      if (canvas.width < 2 || canvas.height < 2) throw new Error('The page could not be rasterised (empty result).');
      const { ink, white } = coverage(canvas);
      if (ink < 0.001) throw new Error('The page rendered blank - nothing was captured.');
      if (white < 0.5) throw new Error(`The page rendered as a flat grey sheet (${Math.round(white * 100)}% white).`);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdfW = landscape === 'landscape' ? A4_MM.height : A4_MM.width;
      const pdfH = landscape === 'landscape' ? A4_MM.width : A4_MM.height;

      if (i > 0) pdf.addPage('a4', landscape);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
      onProgress(20 + Math.round(((i + 1) / pages.length) * 62), `Composing page ${i + 1} of ${pages.length}`);
      await nextFrame();
    }

    onProgress(90, 'Saving file');
    pdf.setProperties({
      title: fileName,
      creator: 'Resume Rewriter Studio (local, browser-only)',
      subject: 'Resume generated locally in the browser. No data was uploaded.',
    });
    pdf.save(fileName);
    onProgress(100, 'Done');

    return { fileName, pageCount: pages.length };
  } finally {
    endRasterMode();
  }
};

/** Open the browser print dialog scoped to the preview element. */
export const printElement = (previewRoot) => {
  if (!previewRoot) throw new Error('Nothing to print - generate the resume first.');
  const pages = Array.from(previewRoot.querySelectorAll('.rsp-page'));
  if (!pages.length) throw new Error('No rendered pages were found to print.');

  const styleId = 'rsp-print-style';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  const rootSelector = `#${previewRoot.id || 'rsp-print-root'}`;
  style.textContent = `
    @page { size: A4; margin: 0; }
    @media print {
      html, body { background: #fff !important; }
      body * { visibility: hidden !important; }
      ${rootSelector}, ${rootSelector} * { visibility: visible !important; }
      /* Bring the off-screen export stage back onto the page before printing. */
      .export-stage {
        position: static !important;
        inset: auto !important;
        left: auto !important;
        top: auto !important;
        width: auto !important;
        z-index: auto !important;
      }
      ${rootSelector} {
        position: absolute !important;
        inset: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        background: #fff !important;
      }
      .rsp-page {
        box-shadow: none !important;
        margin: 0 !important;
        page-break-after: always;
        break-after: page;
        width: ${pages[0].offsetWidth}px !important;
        min-height: ${pages[0].offsetHeight}px !important;
      }
      .rsp-page:last-child { page-break-after: auto; break-after: auto; }
    }
  `;
  document.head.appendChild(style);

  if (!previewRoot.id) previewRoot.id = 'rsp-print-root';

  const cleanup = () => {
    document.getElementById(styleId)?.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  // Let the layout settle before invoking print
  requestAnimationFrame(() => {
    window.print();
    setTimeout(cleanup, 1500);
  });

  return { pageCount: pages.length };
};

/**
 * Text-based PDF fallback: builds a simple, selectable-text, ATS-friendly PDF
 * from the resume model using jsPDF only. Used when canvas rasterisation is not
 * possible on the current browser.
 */
export const exportTextPdf = async (resume, theme, options = {}) => {
  const { fileName = 'resume-optimized.pdf' } = options;
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const L = (theme?.margins?.left ?? 54) * 0.75;
  const R = pageW - (theme?.margins?.right ?? 54) * 0.75;
  let y = (theme?.margins?.top ?? 54) * 0.75;

  const fontFamily = /serif|times|georgia/i.test(theme?.fontFamily || '') ? 'times' : 'helvetica';
  const bodySize = Math.max(7, (theme?.fontSizes?.body ?? 10) * 0.75);
  const setFont = (style, size, color) => {
    pdf.setFont(fontFamily, style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
  };
  const rgb = (hex, fallback = [17, 24, 39]) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const headingColor = rgb(theme?.colors?.heading, [17, 24, 39]);
  const textColor = rgb(theme?.colors?.text, [17, 24, 39]);

  const ensure = (needed) => {
    if (y + needed > pageH - 54) {
      pdf.addPage();
      y = 54;
    }
  };
  const write = (text, { size = bodySize, style = 'normal', color = textColor, indent = 0, gap = 3, x = L } = {}) => {
    setFont(style, size, color);
    const width = R - x - indent;
    const lines = pdf.splitTextToSize(String(text ?? ''), width);
    const lh = size * 1.35;
    for (const line of lines) {
      ensure(lh);
      pdf.text(line, x + indent, y);
      y += lh;
    }
    y += gap;
  };

  const p = resume.personal || {};
  if (p.name) {
    setFont('bold', (theme?.fontSizes?.name ?? 22) * 0.75, headingColor);
    const lines = pdf.splitTextToSize(p.name, R - L);
    for (const line of lines) { ensure(26); pdf.text(line, L, y); y += (theme.fontSizes.name * 0.75) * 1.15; }
    y += 4;
  }
  const contact = [p.location, p.phone, p.email, p.linkedin, p.portfolio].filter(Boolean).join('  |  ');
  if (contact) write(contact, { size: (theme?.fontSizes?.contact ?? 9) * 0.75, color: textColor });

  const heading = (title) => {
    ensure(20);
    y += 6;
    setFont('bold', (theme?.fontSizes?.heading ?? 11) * 0.75, headingColor);
    pdf.text(String(title).toUpperCase(), L, y);
    y += 3;
    if (theme?.ruleUnderHeadings) {
      pdf.setDrawColor(...rgb(theme.colors.rule, [209, 213, 219]));
      pdf.setLineWidth(0.6);
      pdf.line(L, y, R, y);
    }
    y += 6;
  };

  for (const section of (resume.sections || []).filter((s) => s.visible !== false)) {
    if (section.id === 'summary' && resume.summary) { heading(section.title || 'Summary'); write(resume.summary); }
    if (section.id === 'experience' && resume.experience?.length) {
      heading(section.title || 'Experience');
      for (const e of resume.experience) {
        setFont('bold', bodySize, textColor);
        const head = [e.role, e.company].filter(Boolean).join('  \u00B7  ');
        pdf.text(head, L, y);
        if (e.dates) {
          const dw = pdf.getTextWidth(e.dates);
          pdf.setFont('normal', bodySize * 0.88);
          pdf.text(e.dates, R - dw, y);
        }
        y += bodySize * 1.35;
        for (const b of [...(e.responsibilities || []), ...(e.achievements || [])]) {
          write(`\u2022  ${b}`, { indent: 10, gap: 2 });
        }
        y += 4;
      }
    }
    if (section.id === 'skills' && resume.skills?.length) {
      heading(section.title || 'Skills');
      for (const g of resume.skills) {
        write(`${g.label ? `${g.label}: ` : ''}${(g.items || []).join(', ')}`, { indent: 10, gap: 2 });
      }
    }
    if (section.id === 'education' && resume.education?.length) {
      heading(section.title || 'Education');
      for (const ed of resume.education) {
        setFont('bold', bodySize, textColor);
        pdf.text([ed.degree, ed.institution].filter(Boolean).join('  \u00B7  '), L, y);
        if (ed.dates) { const dw = pdf.getTextWidth(ed.dates); pdf.setFont('normal', bodySize * 0.88); pdf.text(ed.dates, R - dw, y); }
        y += bodySize * 1.35;
        for (const d of ed.details || []) write(`\u2022  ${d}`, { indent: 10, gap: 2 });
        y += 3;
      }
    }
    if (section.id === 'certifications' && resume.certifications?.length) {
      heading(section.title || 'Certifications');
      for (const c of resume.certifications) write(`\u2022  ${c.name}`, { indent: 10, gap: 2 });
    }
    if (section.id === 'projects' && resume.projects?.length) {
      heading(section.title || 'Projects');
      for (const pr of resume.projects) {
        setFont('bold', bodySize, textColor);
        pdf.text(pr.name || '', L, y);
        y += bodySize * 1.35;
        for (const b of pr.bullets || []) write(`\u2022  ${b}`, { indent: 10, gap: 2 });
        y += 3;
      }
    }
    if (section.id === 'achievements' && resume.achievements?.length) {
      heading(section.title || 'Achievements');
      for (const a of resume.achievements) write(`\u2022  ${a.text}`, { indent: 10, gap: 2 });
    }
    if (section.id === 'languages' && resume.languages?.length) {
      heading(section.title || 'Languages');
      write(resume.languages.map((l) => l.text).join(', '));
    }
    if ((section.id === 'other' || section.id === 'interests') && resume.other?.length) {
      heading(section.title || 'Additional Information');
      for (const o of resume.other) write(`\u2022  ${o.text}`, { indent: 10, gap: 2 });
    }
  }

  pdf.setProperties({ title: fileName, creator: 'Resume Rewriter Studio (local, browser-only)' });
  pdf.save(fileName);
  return { fileName, pageCount: pdf.getNumberOfPages(), textBased: true };
};

/** Try the visual export first, then the text export, then print. */
export const exportPdf = async (previewRoot, resume, theme, options = {}) => {
  try {
    return await exportPdfFromElement(previewRoot, options);
  } catch (visualError) {
    console.warn('Visual PDF export failed, falling back to a text-based PDF.', visualError);
    try {
      return await exportTextPdf(resume, theme, options);
    } catch (textError) {
      const error = new Error(`PDF export failed: ${visualError.message || visualError}. Use "Print / Save PDF" instead.`);
      error.code = 'pdf-export-failed';
      error.cause = textError;
      throw error;
    }
  }
};

export { loadScript, A4_MM };
export default exportPdf;
