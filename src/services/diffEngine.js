/**
 * DiffEngine - word-level diffing used by the Comparison view.
 *
 * Produces inline spans: { type: 'equal' | 'added' | 'removed', text }
 * plus a summary of what changed at a structural level.
 */

import { collapseWhitespace, similarity, levenshtein } from '../utils/textUtils.js';
import { experienceBullets } from './resumeModel.js';
import { normalizeKeyword } from '../utils/keywordUtils.js';

const tokenizeForDiff = (text) => String(text || '').split(/(\s+)/).filter((t) => t !== '');

/** Classic LCS diff over tokens. Inputs here are short (a bullet). */
const diffTokens = (a, b) => {
  const A = tokenizeForDiff(a);
  const B = tokenizeForDiff(b);
  const n = A.length;
  const m = B.length;
  // guard against pathological sizes
  if (n * m > 400000) {
    return [
      { type: 'removed', text: a },
      { type: 'added', text: b },
    ];
  }
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
       
      if (A[i] === B[j]) lcs[i][j] = lcs[i + 1][j + 1] + 1;
      else lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const spans = [];
  const push = (type, text) => {
    const last = spans[spans.length - 1];
    if (last && last.type === type) last.text += text;
    else spans.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push('equal', A[i]); i += 1; j += 1; } else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push('removed', A[i]); i += 1; } else { push('added', B[j]); j += 1; }
  }
  while (i < n) { push('removed', A[i]); i += 1; }
  while (j < m) { push('added', B[j]); j += 1; }
  return spans;
};

export const diffText = (from, to) => diffTokens(collapseWhitespace(from), collapseWhitespace(to));

const diffStats = (spans) => {
  let added = 0;
  let removed = 0;
  let words = 0;
  for (const s of spans) {
    const n = s.text.split(/\s+/).filter(Boolean).length;
    words += n;
    if (s.type === 'added') added += n;
    if (s.type === 'removed') removed += n;
  }
  return { added, removed, words, changed: added > 0 || removed > 0 };
};

/**
 * Build a structural comparison between the original and the optimized resume.
 */
export const compareResumes = (original, optimized) => {
  const sections = [];

  // --- personal ------------------------------------------------------------
  sections.push({
    id: 'personal',
    label: 'Header / Contact',
    rows: diffRows(
      [
        ['Name', original?.personal?.name, optimized?.personal?.name],
        ['Headline', original?.personal?.headline, optimized?.personal?.headline],
        ['Email', original?.personal?.email, optimized?.personal?.email],
        ['Phone', original?.personal?.phone, optimized?.personal?.phone],
        ['Location', original?.personal?.location, optimized?.personal?.location],
      ],
    ),
  });

  // --- summary -------------------------------------------------------------
  sections.push({
    id: 'summary',
    label: 'Professional Summary',
    rows: [{
      key: 'summary',
      label: 'Summary',
      from: original?.summary || '',
      to: optimized?.summary || '',
      spans: diffText(original?.summary || '', optimized?.summary || ''),
      stats: diffStats(diffText(original?.summary || '', optimized?.summary || '')),
      changed: normalizeKeyword(original?.summary || '') !== normalizeKeyword(optimized?.summary || ''),
      kind: 'block',
    }],
    note: optimized?.summaryGenerated ? 'This summary was drafted from facts already present in your resume. Review it before using.' : null,
  });

  // --- experience ----------------------------------------------------------
  const expRows = [];
  const origExp = original?.experience || [];
  const optExp = optimized?.experience || [];
  const maxExp = Math.max(origExp.length, optExp.length);
  for (let i = 0; i < maxExp; i += 1) {
    const o = origExp[i];
    const p = optExp[i];
    const headerChanges = diffRows([
      ['Role', o?.role, p?.role],
      ['Company', o?.company, p?.company],
      ['Location', o?.location, p?.location],
      ['Dates', o?.dates, p?.dates],
    ]);
    const oBullets = o ? experienceBullets(o) : [];
    const pBullets = p ? experienceBullets(p) : [];
    expRows.push({
      key: `exp-${o?.id || p?.id || i}`,
      label: p?.role || o?.role || `Experience ${i + 1}`,
      sublabel: p?.company || o?.company || '',
      headerChanges,
      bulletPairs: pairBullets(oBullets, pBullets),
      changed: JSON.stringify(headerChanges) !== JSON.stringify(diffRows([
        ['Role', o?.role, p?.role],
        ['Company', o?.company, p?.company],
        ['Location', o?.location, p?.location],
        ['Dates', o?.dates, p?.dates],
      ])) || oBullets.join('|') !== pBullets.join('|'),
      added: !o && Boolean(p),
      removed: Boolean(o) && !p,
    });
  }
  sections.push({ id: 'experience', label: 'Experience', entries: expRows, rows: [], changed: expRows.some((r) => r.changed) });

  // --- skills --------------------------------------------------------------
  sections.push({
    id: 'skills',
    label: 'Skills',
    rows: diffRows((original?.skills || []).map((g, i) => [
      g.label || `Group ${i + 1}`,
      (g.items || []).join(', '),
      (optimized?.skills?.[i]?.items || []).join(', '),
    ])),
  });

  // --- education -----------------------------------------------------------
  sections.push({
    id: 'education',
    label: 'Education',
    rows: diffRows((original?.education || []).map((e, i) => [
      e.institution || `Entry ${i + 1}`,
      [e.degree, e.dates, (e.details || []).join(' ')].filter(Boolean).join(' - '),
      [optimized?.education?.[i]?.degree, optimized?.education?.[i]?.dates, (optimized?.education?.[i]?.details || []).join(' ')].filter(Boolean).join(' - '),
    ])),
  });

  // --- projects ------------------------------------------------------------
  sections.push({
    id: 'projects',
    label: 'Projects',
    entries: (original?.projects || []).map((p, i) => ({
      key: p.id,
      label: p.name || `Project ${i + 1}`,
      sublabel: p.dates || '',
      bulletPairs: pairBullets(p.bullets || [], optimized?.projects?.[i]?.bullets || []),
      headerChanges: diffRows([
        ['Name', p.name, optimized?.projects?.[i]?.name],
        ['Dates', p.dates, optimized?.projects?.[i]?.dates],
      ]),
      changed: (p.bullets || []).join('|') !== (optimized?.projects?.[i]?.bullets || []).join('|'),
    })),
    rows: [],
  });

  // --- certifications ------------------------------------------------------
  sections.push({
    id: 'certifications',
    label: 'Certifications',
    rows: diffRows((original?.certifications || []).map((c, i) => [
      c.name || `Certification ${i + 1}`,
      c.parts?.join(' ') || c.name,
      (optimized?.certifications?.[i]?.parts || []).join(' ') || optimized?.certifications?.[i]?.name || '',
    ])),
  });

  // --- remaining sections --------------------------------------------------
  const rest = [
    ['achievements', 'Achievements', (a) => [a.text]],
    ['languages', 'Languages', (a) => [a.text]],
    ['other', 'Additional Information', (a) => [a.text]],
  ];
  for (const [id, label, get] of rest) {
    const orig = (original?.[id] || []);
    const opt = (optimized?.[id] || []);
    sections.push({
      id,
      label,
      rows: diffRows(orig.map((item, i) => [get(item)[0] || `${label} ${i + 1}`, get(item).join(' '), (get(opt[i] || {})[0] || '')])),
    });
  }

  const totals = { addedWords: 0, removedWords: 0, changedBlocks: 0 };
  for (const s of sections) {
    for (const r of s.rows || []) {
      if (r.stats) { totals.addedWords += r.stats.added; totals.removedWords += r.stats.removed; }
      if (r.changed) totals.changedBlocks += 1;
    }
    for (const e of s.entries || []) {
      for (const p of e.bulletPairs || []) {
        if (p.stats) { totals.addedWords += p.stats.added; totals.removedWords += p.stats.removed; }
        if (p.changed) totals.changedBlocks += 1;
      }
    }
  }

  return { sections, totals };
};

const diffRows = (pairs) => pairs
  .filter(([, from, to]) => from !== to)
  .map(([label, from, to]) => {
    const spans = diffText(from || '', to || '');
    return {
      key: label,
      label,
      from: from || '',
      to: to || '',
      spans,
      stats: diffStats(spans),
      changed: (from || '') !== (to || ''),
      kind: 'row',
    };
  });

/**
 * Pair original bullets with rewritten bullets.
 * Uses similarity + ordering so a reordered bullet still lines up visually.
 */
const pairBullets = (fromList, toList) => {
  const pairs = [];
  const usedFrom = new Set();
  const usedTo = new Set();

  for (let ti = 0; ti < toList.length; ti += 1) {
    const to = toList[ti];
    let bestIndex = -1;
    let bestScore = 0;
    for (let fi = 0; fi < fromList.length; fi += 1) {
      if (usedFrom.has(fi)) continue;
      const from = fromList[fi];
      const same = normalizeKeyword(from) === normalizeKeyword(to);
      const score = same ? 1 : similarity(from, to);
      if (score > bestScore) { bestScore = score; bestIndex = fi; }
    }
    if (bestIndex !== -1 && bestScore > 0.34) {
      usedFrom.add(bestIndex);
      usedTo.add(ti);
      const from = fromList[bestIndex];
      const spans = diffText(from, to);
      pairs.push({
        key: `b${ti}`,
        from,
        to,
        spans,
        stats: diffStats(spans),
        changed: from !== to,
        kind: from === to ? 'unchanged' : 'rewritten',
        similarity: Number(bestScore.toFixed(2)),
      });
    } else {
      const spans = [{ type: 'added', text: to }];
      pairs.push({ key: `b${ti}`, from: '', to, spans, stats: { added: to.split(/\s+/).length, removed: 0, words: to.split(/\s+/).length, changed: true }, changed: true, kind: 'added' });
    }
  }

  for (let fi = 0; fi < fromList.length; fi += 1) {
    if (usedFrom.has(fi)) continue;
    const from = fromList[fi];
    pairs.push({
      key: `r${fi}`,
      from,
      to: '',
      spans: [{ type: 'removed', text: from }],
      stats: { added: 0, removed: from.split(/\s+/).length, words: from.split(/\s+/).length, changed: true },
      changed: true,
      kind: 'removed',
    });
  }

  const order = (p) => (p.kind === 'added' ? 1e6 : 0);
  return pairs.map((p, i) => ({ ...p, _i: i })).sort((a, b) => order(a) - order(b) || a._i - b._i).map(({ _i, ...rest }) => rest);
};

/** Character-level diff for short strings (used for the headline / names). */
export const diffChars = (a, b) => {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (s1 === s2) return [{ type: 'equal', text: s1 }];
  const n = s1.length;
  const m = s2.length;
  if (n * m > 250000) return [{ type: 'removed', text: s1 }, { type: 'added', text: s2 }];
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = s1[i] === s2[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const spans = [];
  const push = (type, text) => {
    const last = spans[spans.length - 1];
    if (last && last.type === type) last.text += text;
    else spans.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (s1[i] === s2[j]) { push('equal', s1[i]); i += 1; j += 1; } else if (lcs[i + 1][j] >= lcs[i][j + 1]) { push('removed', s1[i]); i += 1; } else { push('added', s2[j]); j += 1; }
  }
  while (i < n) { push('removed', s1[i]); i += 1; }
  while (j < m) { push('added', s2[j]); j += 1; }
  return spans;
};

export { diffTokens, diffStats, levenshtein };
export default compareResumes;
