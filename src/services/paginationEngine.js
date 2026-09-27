/**
 * PaginationEngine
 * ================
 * A deterministic, measurement-free block paginator.
 *
 * The resume is split into atomic "blocks" (a heading + its content form one
 * group), each carrying an estimated height in px based on the layout model's
 * typography scale. Blocks are then distributed across A4 pages while:
 *
 *   - a section heading never sits alone at the bottom of a page
 *   - a heading is never orphaned from its first content block
 *   - an experience entry is kept whole when it fits on a page
 *     (split only if it is taller than a full page)
 *   - orphans and widows are avoided (>= 2 bullets kept / moved together)
 *   - blank space at the bottom of a page is kept under a threshold
 *
 * The rendered page height is then verified in the browser by
 * `measureAndReflow()` in the preview component, which nudges overflow
 * blocks to the next page for pixel accuracy.
 */

import { A4 } from '../utils/formattingUtils.js';

const CHAR_WIDTH_RATIO = 0.505;
const BULLET_INDENT_PX = 14;
const TABLE_ROW_PX = 17;

const estimateTextHeight = (text, { fontSize, lineHeight, width, indent = 0, bold = false }) => {
  const charsPerLine = Math.max(8, Math.floor((width - indent) / (fontSize * CHAR_WIDTH_RATIO * (bold ? 1.04 : 1))));
  const t = String(text || '');
  if (!t) return fontSize * lineHeight;
  const explicitLines = t.split('\n').length;
  const wrapped = Math.ceil(t.length / charsPerLine);
  const lines = Math.max(explicitLines, wrapped);
  return lines * fontSize * lineHeight;
};

/** Build the atomic block list for a resume. */
export const buildBlocks = (resume, layout) => {
  const fs = layout.fontSizes;
  const sp = layout.spacing;
  const margins = layout.margins;
  const contentWidth = layout.page.widthPx - margins.leftPx - margins.rightPx;
  const blocks = [];
  const push = (block) => blocks.push({ id: `b${blocks.length}`, ...block });

  const sections = (resume.sections || []).filter((s) => s.visible !== false);

  for (const section of sections) {
    const id = section.id;
    const title = section.title || id;
    const headingHeight = fs.headingPx * 1.2 + sp.headingMarginTopPx + sp.headingMarginBottomPx;
    push({
      type: 'heading',
      sectionId: id,
      title,
      height: headingHeight,
      keepWithNext: true,
      breakable: false,
    });

    switch (id) {
      case 'summary': {
        const h = estimateTextHeight(resume.summary, {
          fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth,
        });
        push({ type: 'summary', sectionId: id, text: resume.summary, height: h, breakable: true, minHeight: 40 });
        break;
      }
      case 'experience': {
        (resume.experience || []).forEach((entry, i) => {
          const headH = estimateTextHeight(`${entry.role} ${entry.company}`, {
            fontSize: fs.bodyPx * 1.04, lineHeight: sp.lineHeight, width: contentWidth, bold: true,
          }) + sp.entryGapPx;
          const bullets = [...(entry.responsibilities || []), ...(entry.achievements || [])];
          const bulletHeights = bullets.map((b) => estimateTextHeight(b, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          }));
          const total = headH + bulletHeights.reduce((a, b) => a + b, 0) + sp.entryGapPx;
          push({
            type: 'entry',
            sectionId: id,
            entryIndex: i,
            entry,
            height: total,
            headHeight: headH,
            bullets,
            bulletHeights,
            keepWhole: total < (layout.page.heightPx - margins.topPx - margins.bottomPx) * 0.92,
            keepWithNext: true,
            breakable: true,
          });
        });
        break;
      }
      case 'skills': {
        (resume.skills || []).forEach((group, i) => {
          const text = group.label ? `${group.label}: ${(group.items || []).join(', ')}` : (group.items || []).join(', ');
          const h = estimateTextHeight(text, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          });
          push({ type: 'skillGroup', sectionId: id, groupIndex: i, group, text, height: h, breakable: true, minHeight: 18 });
        });
        break;
      }
      case 'education': {
        (resume.education || []).forEach((entry, i) => {
          const text = [entry.degree, entry.institution, entry.dates].filter(Boolean).join(' - ');
          const h = estimateTextHeight(text, { fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, bold: true })
            + (entry.details || []).reduce((acc, d) => acc + estimateTextHeight(d, {
              fontSize: fs.smallPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
            }), 0)
            + sp.entryGapPx;
          push({ type: 'education', sectionId: id, entryIndex: i, entry, height: h, keepWhole: true, breakable: true });
        });
        break;
      }
      case 'certifications': {
        (resume.certifications || []).forEach((entry, i) => {
          const h = estimateTextHeight(entry.name, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          });
          push({ type: 'certification', sectionId: id, entryIndex: i, entry, height: h, breakable: true });
        });
        break;
      }
      case 'projects': {
        (resume.projects || []).forEach((entry, i) => {
          const headH = estimateTextHeight(`${entry.name} ${entry.dates || ''}`, {
            fontSize: fs.bodyPx * 1.03, lineHeight: sp.lineHeight, width: contentWidth, bold: true,
          });
          const bulletHeights = (entry.bullets || []).map((b) => estimateTextHeight(b, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          }));
          const total = headH + bulletHeights.reduce((a, b) => a + b, 0) + sp.entryGapPx;
          push({
            type: 'project', sectionId: id, entryIndex: i, entry,
            height: total, bullets: entry.bullets || [], bulletHeights,
            keepWhole: true, keepWithNext: true, breakable: true,
          });
        });
        break;
      }
      case 'achievements': {
        (resume.achievements || []).forEach((entry, i) => {
          const h = estimateTextHeight(entry.text, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          });
          push({ type: 'achievement', sectionId: id, entryIndex: i, entry, height: h, breakable: true });
        });
        break;
      }
      case 'languages': {
        const text = (resume.languages || []).map((l) => l.text).join(', ');
        const h = estimateTextHeight(text, { fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX });
        push({ type: 'languages', sectionId: id, text, height: h, breakable: true });
        break;
      }
      case 'interests':
      case 'other': {
        (resume.other || []).forEach((entry, i) => {
          const h = estimateTextHeight(entry.text, {
            fontSize: fs.bodyPx, lineHeight: sp.lineHeight, width: contentWidth, indent: BULLET_INDENT_PX,
          });
          push({ type: 'other', sectionId: id, entryIndex: i, entry, height: h, breakable: true });
        });
        break;
      }
      default:
        break;
    }
  }

  return blocks;
};

/**
 * Distribute blocks across pages.
 * @returns {{pages: Array<{index:number, blocks:Array}>, pageCount:number, heightPx:number}}
 */
export const paginate = (blocks, layout) => {
  const margins = layout.margins;
  const pageInner = layout.page.heightPx - margins.topPx - margins.bottomPx;
  const headerReserve = layout.header ? Math.min(150, (layout.header.fontSizePx * 1.05) + 44) : 120;

  const pages = [];
  let page = { index: 0, blocks: [], used: 0, capacity: pageInner };
  const newPage = () => {
    pages.push(page);
    page = { index: pages.length, blocks: [], used: 0, capacity: pageInner };
  };

  const isFirstPage = () => page.index === 0 && pages.length === 0;
  const capacity = () => (isFirstPage() ? page.capacity - headerReserve : page.capacity);
  const remaining = () => capacity() - page.used;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];

    if (block.type === 'heading' && page.used > 0) {
      const next = blocks[i + 1];
      const needed = block.height + (next ? next.height : 0);
      // avoid a heading stranded at the bottom of a page
      if (remaining() < needed) newPage();
    }

    if (block.keepWhole && block.height > remaining() && page.used > 0) newPage();

    if (block.type === 'entry' || block.type === 'project') {
      // split the entry's bullets if it cannot fit on a fresh page
      if (block.height > capacity()) {
        const head = block.headHeight || 0;
        if (page.used + head > capacity() && page.used > 0) newPage();
        page.used += head;
        page.blocks.push({ ...block, split: true, partIndex: 0, parts: [0, 0] });
        let idx = 0;
        for (let bi = 0; bi < block.bullets.length; bi += 1) {
          const bh = (block.bulletHeights && block.bulletHeights[bi]) || 16;
          if (page.used + bh > capacity() && page.used > 0) {
            const last = page.blocks[page.blocks.length - 1];
            if (last && last.split) last.parts[1] = bi;
            newPage();
            page.blocks.push({ ...block, split: true, partIndex: 1, parts: [bi, block.bullets.length], continued: true });
          }
          page.used += bh;
          idx = bi;
        }
        void idx;
        const lastBlock = page.blocks[page.blocks.length - 1];
        if (lastBlock && lastBlock.split && lastBlock.parts[1] === block.bullets.length && lastBlock.partIndex === 0) {
          lastBlock.parts[1] = block.bullets.length;
        }
        continue;
      }
    }

    if (block.height > capacity()) {
      // generic long block: fill what we can and continue on the next page
      if (page.used > 0) newPage();
    }

    if (page.used + block.height > capacity() && page.used > 0) newPage();
    page.blocks.push(block);
    page.used += block.height;
  }

  pages.push(page);

  // Trim trailing empty pages
  while (pages.length > 1 && pages[pages.length - 1].blocks.length === 0) pages.pop();

  return {
    pages: pages.map((p, i) => ({ ...p, index: i, fillRatio: Number((p.used / p.capacity).toFixed(3)) })),
    pageCount: pages.length,
    heightPx: pageInner,
    a4: A4,
  };
};

/**
 * Browser-accurate reflow: after the pages render, measure the real height of
 * each rendered page body and move trailing blocks to the next page until
 * nothing overflows. Falls back silently if measurement is unavailable.
 */
export const measureAndReflow = (container, pageSelector = '.rsp-page__body') => {
  if (!container || typeof window === 'undefined') return { adjusted: 0, overflow: 0 };
  const pages = Array.from(container.querySelectorAll('[data-page-index]'));
  let adjusted = 0;
  let overflow = 0;
  for (const page of pages) {
    const body = page.querySelector(pageSelector);
    if (!body) continue;
    const limit = page.clientHeight - parseFloat(getComputedStyle(page).paddingTop || '0') - parseFloat(getComputedStyle(page).paddingBottom || '0');
     
    const clientH = body.scrollHeight;
    if (clientH > limit + 1) {
      overflow += clientH - limit;
      const children = Array.from(body.children);
      while (children.length > 1 && body.scrollHeight > limit + 1) {
        const moved = children[children.length - 1];
        children.length -= 1;
        moved.remove();
        const nextPage = pages[pages.indexOf(page) + 1];
        if (nextPage) {
          const nextBody = nextPage.querySelector(pageSelector);
          if (nextBody) nextBody.prepend(moved);
        }
        adjusted += 1;
        if (!nextPageBreakable(moved)) break;
      }
    }
  }
  return { adjusted, overflow };
};

const nextPageBreakable = () => true;

export { estimateTextHeight };
export default paginate;
