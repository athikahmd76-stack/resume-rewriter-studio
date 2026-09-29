import { STOP_WORDS, NON_KEYWORD_TERMS, WEAK_VERBS } from '../data/stopWords.js';
import { SOFT_SKILL_TERMS, getSynonyms, KNOWN_CERTIFICATION_HINTS } from '../data/synonymDictionary.js';
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
  for (const syn of getSynonymsDeep(term)) {
    if (textMentionsTerm(resumeText, syn)) found.push(syn);
  }
  const expansion = expandsTo(term);
  if (expansion && textMentionsTerm(resumeText, expansion)) found.push(expansion);
  return found;
};

/**
 * Synonyms of a term, including the ones registered against its head noun.
 *
 * The dictionary is keyed by single words, so a multi-word job-description term
 * like "statistical forecasting" had no entry at all and could never be
 * recognised. The head noun carries the competency in English noun phrases, so
 * "forecasting" is consulted for "statistical forecasting". Restricting the
 * expansion to the last word keeps this narrow: it cannot drag in the meaning of
 * a modifier, and a bare word still resolves to itself.
 */
export const getSynonymsDeep = (term) => {
  const base = normalizeKeyword(term);
  if (!base) return [];
  const out = [base];
  const push = (list) => {
    for (const s of list || []) {
      const n = normalizeKeyword(s);
      if (n && n !== base && !out.includes(n)) out.push(n);
    }
  };
  push(getSynonyms(base));
  const words = base.split(' ').filter(Boolean);
  const head = words[words.length - 1];
  if (words.length > 1 && head) push(getSynonyms(head));
  return out;
};

/**
 * Does the text demonstrate this term, either literally or through a
 * meaning-preserving synonym from the local dictionary?
 *
 * This is the honesty test used for scoring. A posting that asks for
 * "statistical forecasting" and a resume that says "demand planning" describe
 * the same competency, so counting that as a gap penalises the candidate for
 * their wording rather than their experience. It reports coverage only - it never
 * writes the term into the resume, and the rewriter still refuses to substitute
 * a phrase the substitution map does not explicitly allow.
 */
export const coversTerm = (text, term) => (
  textMentionsTerm(text, term) || findSynonymMatches(text, term).length > 0
);

/**
 * Shown wherever a component counts job keywords and the rewrite cannot move it.
 *
 * These components credit a keyword when the resume states it, or when the
 * posting words the same competency differently and the local synonym dictionary
 * recognises the two as equivalent, so a candidate is not docked for their
 * choice of words. It is a ceiling rather than a defect: the keywords left over
 * are the ones the resume genuinely does not evidence, and those stay in the
 * missing list instead of being written into the document.
 */
export const KEYWORD_EVIDENCE_REASON = 'This counts the job keywords your resume already states, plus keywords the posting words differently where they mean the same thing. Anything else the job asks for and your resume does not evidence is listed as missing and left out of the document, so this stops where your real experience stops.';

/**
 * Expand a term into itself + its dictionary synonyms.
 */
export const expandTerm = (term) => {
  const base = normalizeKeyword(term);
  return uniqueBy([base, ...getSynonyms(term)].map(normalizeKeyword), (t) => t);
};

/**
 * Certification acronyms and the full name each one actually stands for.
 *
 * "CSCP" is not a different qualification from "Certified Supply Chain
 * Professional" - it is the same letters. A posting that asks for the acronym
 * and a resume that spells it out were previously reported as a gap purely
 * because the reader has to know the abbreviation, and the rewrite could not
 * close it because the substitution map will not add a credential the document
 * does not already name.
 *
 * These pairs are deliberately exact expansions only. They are never treated as
 * synonyms for scoring the candidate's experience, and nothing here is ever
 * written into the document: the rewriter is still not allowed to add a
 * qualification, and the gap list still only shrinks where the resume genuinely
 * names the credential.
 */
const CREDENTIAL_QUALIFIERS = /\s+(certification|certified|qualification|certificate|accreditation|accredited|award|level|course|training)$/;

/** Strip a trailing credential qualifier: "cscp certification" -> "cscp". */
const stripCredentialQualifier = (term) => term.replace(CREDENTIAL_QUALIFIERS, '');

export const expandsTo = (term) => {
  const key = normalizeKeyword(term);
  if (!key) return null;
  for (const candidate of [key, stripCredentialQualifier(key)]) {
    if (!candidate) continue;
    for (const [acro, full] of KNOWN_CERTIFICATION_HINTS) {
      if (candidate === normalizeKeyword(acro)) return normalizeKeyword(full);
      if (candidate === normalizeKeyword(full)) return normalizeKeyword(acro);
    }
  }
  return null;
};

/** Does the text name this certification, by acronym or by its full title? */
export const textMentionsCertification = (text, term) => {
  if (textMentionsTerm(text, term)) return true;
  const other = expandsTo(term);
  return Boolean(other) && textMentionsTerm(text, other);
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
  expandsTo,
  textMentionsCertification,
  isSoftSkill,
  keywordWeight,
};
