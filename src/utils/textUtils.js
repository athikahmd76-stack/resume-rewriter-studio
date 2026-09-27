/** Small, dependency-free text helpers used across the local engine. */

const BULLET_CHARS = ['\u2022', '\u2023', '\u25AA', '\u25AB', '\u25CF', '\u25E6', '\u2043', '\u2219', '\u00B7', '\u2767', '\u279C', '-', '\u2013', '*', '\u2014'];

/** Normalise unicode + whitespace so downstream regexes behave predictably. */
export const normalizeText = (input) => {
  if (!input) return '';
  return String(input)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2018|\u2019|\u201B/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Collapse all whitespace into single spaces. */
export const collapseWhitespace = (input) => String(input || '').replace(/\s+/g, ' ').trim();

export const splitLines = (input) =>
  String(input || '')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''));

export const detectBulletPrefix = (line) => {
  const trimmed = line.replace(/^\s+/, '');
  if (!trimmed) return null;
  for (const ch of BULLET_CHARS) {
    if (trimmed.startsWith(ch)) {
      // a lone dash followed by space is a bullet; a dash inside a date range is not
      if ((ch === '-' || ch === '\u2013') && !/^[-–]\s/.test(trimmed)) continue;
      return { char: ch, rest: trimmed.slice(ch.length).replace(/^\s+/, '') };
    }
  }
  // numbered bullets: 1. 1) (1) i. a.  -> only when followed by a space
  const numbered = /^(\(?\d{1,2}[.)]|\(?[a-zA-Z][.)]|[ivxIVX]{1,4}[.)])\s+(.{2,})$/.exec(trimmed);
  if (numbered) {
    return { char: numbered[1], rest: numbered[2], numbered: true };
  }
  return null;
};

export const stripBulletPrefix = (line) => {
  const b = detectBulletPrefix(line);
  return b ? b.rest : String(line || '').trim();
};

export const isBulletLine = (line) => Boolean(detectBulletPrefix(line));

export const isBlankLine = (line) => String(line || '').trim().length === 0;

export const titleCase = (input) =>
  String(input || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());

export const sentenceCase = (input) => {
  const s = collapseWhitespace(input);
  if (!s) return '';
  const lower = s.charAt(0).toLowerCase() + s.slice(1);
  // keep acronyms and proper nouns intact: only lowercase if the second char is lowercase
  return /^[A-Z]{2,}/.test(s) ? s : lower;
};

export const capitalizeFirst = (input) => {
  const s = collapseWhitespace(input);
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const endWithPeriod = (input) => {
  const s = collapseWhitespace(input);
  if (!s) return '';
  return /[.!?:;]$/.test(s) ? s : `${s}.`;
};

/** Remove a trailing bullet glyph and leading whitespace. */
export const trimBulletGlyph = (input) => String(input || '').replace(/^[\s\u2022\u2023\u25AA\u2043\u2219\u00B7\-*]+/, '').trim();

export const splitByDelimiter = (input, delimiter = ',') =>
  String(input || '')
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);

export const uniqueBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

export const countWords = (input) => {
  const s = collapseWhitespace(input);
  return s ? s.split(' ').length : 0;
};

export const countOccurrences = (haystack, needle) => {
  if (!needle) return 0;
  const h = String(haystack || '').toLowerCase();
  const n = String(needle).toLowerCase();
  if (!n) return 0;
  let count = 0;
  let idx = h.indexOf(n);
  while (idx !== -1) {
    count += 1;
    idx = h.indexOf(n, idx + n.length);
  }
  return count;
};

export const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

export const formatBytes = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatPercent = (value, digits = 0) => `${(Number(value) || 0).toFixed(digits)}%`;

/** Levenshtein distance, capped for performance (bullets are short). */
export const levenshtein = (a, b) => {
  const s1 = String(a || '').toLowerCase();
  const s2 = String(b || '').toLowerCase();
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;
  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s1.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= s2.length; j += 1) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[s2.length];
};

export const similarity = (a, b) => {
  const s1 = String(a || '').toLowerCase().trim();
  const s2 = String(b || '').toLowerCase().trim();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const max = Math.max(s1.length, s2.length);
  return 1 - levenshtein(s1, s2) / max;
};

/** Split a sentence into words while keeping punctuation-attached tokens intact. */
export const tokenize = (input) => collapseWhitespace(input).split(' ').filter(Boolean);

export const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const wordBoundaryRegExp = (term) =>
  new RegExp(`(^|[^a-z0-9])${escapeRegExp(term).replace(/\s+/g, '\\s+')}([^a-z0-9]|$)`, 'i');

/** Strips a trailing possessive/plural mismatch when looking for a term. */
export const softNormalize = (input) =>
  String(input || '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const pluralize = (word) => {
  const w = String(word || '');
  if (!w) return w;
  if (/(s|x|z|ch|sh)$/i.test(w)) return `${w}es`;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  return `${w}s`;
};

export const singularize = (word) => {
  const w = String(word || '').toLowerCase();
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ses') || w.endsWith('xes') || w.endsWith('zes') || w.endsWith('ches') || w.endsWith('shes')) {
    return w.slice(0, -2);
  }
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

export default {
  normalizeText,
  collapseWhitespace,
  splitLines,
  detectBulletPrefix,
  stripBulletPrefix,
  isBulletLine,
  isBlankLine,
  titleCase,
  sentenceCase,
  capitalizeFirst,
  endWithPeriod,
  trimBulletGlyph,
  splitByDelimiter,
  uniqueBy,
  countWords,
  countOccurrences,
  clampPercent,
  formatBytes,
  formatPercent,
  levenshtein,
  similarity,
  tokenize,
  escapeRegExp,
  wordBoundaryRegExp,
  softNormalize,
  pluralize,
  singularize,
};
