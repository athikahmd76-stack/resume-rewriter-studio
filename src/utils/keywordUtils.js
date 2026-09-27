import { STOP_WORDS, NON_KEYWORD_TERMS, WEAK_VERBS } from '../data/stopWords.js';
import { SOFT_SKILL_TERMS, getSynonyms } from '../data/synonymDictionary.js';
import { collapseWhitespace, uniqueBy, softNormalize, pluralize, singularize } from './textUtils.js';

/** Normalise a keyword for comparison (lowercase, trimmed, whitespace collapsed). */
export const normalizeKeyword = (kw) => softNormalize(collapseWhitespace(kw));

/**
 * Build an n-gram (1..maxN) candidate list from a block of text.
 * Returns array of { term, count } sorted by frequency then length.
 */
export const extractNgrams = (text, { maxN = 4, minLength = 2, limit = 400 } = {}) => {
  const clean = collapseWhitespace(String(text || '')).toLowerCase();
  if (!clean) return [];
  const words = clean
    .replace(/[^a-z0-9+#/\-\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const counts = new Map();
  for (let n = 1; n <= maxN; n += 1) {
    for (let i = 0; i + n <= words.length; i += 1) {
      const gram = words.slice(i, i + n);
      // drop grams that start or end with a stop word
      if (STOP_WORDS.has(gram[0]) || STOP_WORDS.has(gram[n - 1])) continue;
      if (gram.some((w) => STOP_WORDS.has(w) && n > 1 && !(n === 2 && /^(cloud|power|project|customer|data|supply|process|quality|sales|service|people|product|inventory|demand)/.test(w)))) {
        continue;
      }
      if (gram[0].length < minLength) continue;
      const term = gram.join(' ');
      if (NON_KEYWORD_TERMS.has(term)) continue;
      counts.set(term, (counts.get(term) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length)
    .slice(0, limit);
};

/** Split a user keyword string on commas / newlines / semicolons / pipes. */
export const parseKeywordInput = (raw) => {
  const text = String(raw || '');
  return text
    .split(/[,;|\n\r\t]+/g)
    .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
    .filter((s) => s.length > 0);
};

/** Deduplicate keywords case-insensitively, preserving first-seen order. */
export const dedupeKeywords = (keywords) =>
  uniqueBy(
    (keywords || []).map((k) => collapseWhitespace(String(k || ''))).filter((k) => k.length > 0 && k.length <= 60),
    (k) => k.toLowerCase(),
  );

/**
 * Does `text` mention `term`?
 *  - exact case-insensitive match
 *  - word-boundary match tolerating internal whitespace ("s/4hana" vs "s 4hana")
 *  - plural/singular variation
 */
export const textMentionsTerm = (text, term) => {
  if (!text || !term) return false;
  const hay = softNormalize(text);
  const needle = normalizeKeyword(term);
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  // plural/singular tolerance
  const singular = singularize(needle);
  const plural = pluralize(needle);
  if (hay.includes(singular) || hay.includes(plural)) return true;
  // token-set match for multi word terms (order-insensitive)
  const needleTokens = needle.split(' ').filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  if (needleTokens.length > 1) {
    const hayTokens = new Set(hay.split(' '));
    if (needleTokens.every((t) => hayTokens.has(singularize(t)) || hayTokens.has(t))) return true;
  }
  return false;
};

/** Count mentions of a term in a text block. */
export const countTermMentions = (text, term) => {
  if (!text || !term) return 0;
  const hay = softNormalize(text);
  const needle = normalizeKeyword(term);
  if (!needle) return 0;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  if (count === 0) {
    const singular = singularize(needle);
    const plural = pluralize(needle);
    for (const variant of [singular, plural]) {
      if (variant === needle) continue;
      idx = hay.indexOf(variant);
      while (idx !== -1) {
        count += 1;
        idx = hay.indexOf(variant, idx + variant.length);
      }
    }
  }
  return count;
};

/**
 * Return the list of resume-side terms that mean the same thing as `term`.
 * Used to detect "potential synonyms" (e.g. resume says "purchasing",
 * JD says "procurement").
 */
export const findSynonymMatches = (resumeText, term) => {
  const found = [];
  for (const syn of getSynonyms(term)) {
    if (textMentionsTerm(resumeText, syn)) found.push(syn);
  }
  return found;
};

/** Expand a term into itself + its dictionary synonyms. */
export const expandTerm = (term) => {
  const base = normalizeKeyword(term);
  return uniqueBy([base, ...getSynonyms(term)].map(normalizeKeyword), (t) => t);
};

export const isSoftSkill = (term) => SOFT_SKILL_TERMS.has(normalizeKeyword(term));

export const isWeakVerb = (word) => WEAK_VERBS.has(String(word || '').toLowerCase());

/**
 * Score a candidate keyword for "is this worth surfacing".
 * Deterministic: frequency + length bonus + dictionary bonus.
 */
export const keywordWeight = ({ term, count = 1 }, { frequencyWeight = 1, lengthBonus = 1 } = {}) => {
  const t = normalizeKeyword(term);
  const words = t.split(' ').length;
  const base = count * frequencyWeight;
  const lengthScore = words === 1 ? lengthBonus * 0.6 : words === 2 ? lengthBonus : lengthBonus * 1.4;
  return base + lengthScore;
};

export default {
  normalizeKeyword,
  extractNgrams,
  parseKeywordInput,
  dedupeKeywords,
  textMentionsTerm,
  countTermMentions,
  findSynonymMatches,
  expandTerm,
  isSoftSkill,
  keywordWeight,
};
