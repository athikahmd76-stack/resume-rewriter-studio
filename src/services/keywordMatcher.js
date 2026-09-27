/**
 * KeywordMatcher
 *
 * Compares three sources:
 *   1. the source resume (facts)
 *   2. the job description (targets)
 *   3. the user's explicit target keywords (intents)
 *
 * Produces matched / missing / synonym / repeated / unsupported buckets.
 *
 * FACT-SAFETY CONTRACT
 * --------------------
 *  - `missing` terms are reported as "MISSING - NOT FOUND IN SOURCE RESUME"
 *    and are NEVER injected into the optimized resume.
 *  - `unsupported` = JD terms that have no evidence anywhere in the source
 *    resume, including via a safe synonym. Also never injected.
 *  - A JD keyword may only appear in the optimized resume if the source resume
 *    already supports it literally or through a meaning-preserving synonym.
 */

import {
  textMentionsTerm,
  countTermMentions,
  findSynonymMatches,
  normalizeKeyword,
  dedupeKeywords,
} from '../utils/keywordUtils.js';
import { getSynonyms, SOFT_SKILL_TERMS } from '../data/synonymDictionary.js';
import { resumeToText, experienceBullets } from './resumeModel.js';
import { collapseWhitespace } from '../utils/textUtils.js';

export const STATUS = {
  MATCHED: 'MATCHED',
  SYNONYM: 'SYNONYM',
  MISSING: 'MISSING',
};

/**
 * Is it safe to write `jdTerm` into the resume given the candidate already
 * wrote `resumeTerm`?
 *
 * We only allow it when:
 *  - they are the same term, or
 *  - they are in the local synonym dictionary AND the substitution is
 *    meaning-preserving in the direction we allow (see SYNONYM_SUBSTITUTION).
 *
 * The substitution map is deliberately conservative: it only maps a *generic
 * source phrasing* to the *JD's* preferred phrasing for the same competency.
 */
const SYNONYM_SUBSTITUTION = {
  // source phrasing -> allowed JD phrasings
  purchasing: ['procurement', 'vendor management', 'supplier management'],
  sourcing: ['procurement', 'vendor management'],
  buying: ['procurement'],
  stock: ['inventory', 'inventory management'],
  'stock management': ['inventory', 'inventory management'],
  'inventory management': ['inventory'],
  warehousing: ['logistics', 'warehouse management', 'fulfilment', 'fulfillment'],
  dispatch: ['distribution', 'logistics'],
  transportation: ['logistics', 'distribution'],
  'demand forecasting': ['demand planning', 'forecasting'],
  forecasting: ['demand planning', 'demand forecasting'],
  'statistical forecasting': ['forecasting', 'demand forecasting', 'demand planning'],
  'materials planning': ['material planning', 'supply planning'],
  mrp: ['materials planning', 'material planning'],
  'lean manufacturing': ['lean', 'continuous improvement'],
  kaizen: ['continuous improvement', 'process improvement'],
  'process improvement': ['continuous improvement'],
  'dashboard': ['dashboards', 'reporting', 'business intelligence'],
  dashboards: ['reporting', 'business intelligence'],
  'bi reporting': ['business intelligence', 'reporting'],
  'microsoft power bi': ['power bi'],
  'bi': ['business intelligence', 'reporting'],
  'sql queries': ['sql'],
  't-sql': ['sql'],
  'erp systems': ['erp'],
  'materials management': ['sap mm'],
  'order processing': ['order management'],
  'order fulfilment': ['order management', 'order fulfillment'],
  'order fulfillment': ['order management', 'order fulfilment'],
  'vendor management': ['supplier management', 'procurement'],
  'supplier management': ['vendor management', 'procurement'],
  'store management': ['store operations', 'retail operations'],
  'retail operations': ['store operations'],
  'value stream mapping': ['process mapping', 'continuous improvement'],
  'root cause analysis': ['problem solving', 'troubleshooting'],
  'team leadership': ['leadership'],
  'customer engagement': ['stakeholder management', 'stakeholder engagement'],
  'client management': ['stakeholder management'],
  'written communication': ['communication'],
  teamwork: ['team work', 'collaboration'],
  'cross functional collaboration': ['collaboration', 'team work'],
  reporting: ['business intelligence', 'dashboards'],
  reconciliation: ['account reconciliation', 'financial reconciliation'],
  'budget planning': ['budgeting'],
  'financial planning': ['budgeting'],
  'cost reduction': ['cost control', 'cost saving', 'cost savings'],
  'savings realisation': ['cost saving', 'cost reduction'],
  'automation': ['process automation', 'workflow automation'],
  'data analytics': ['data analysis'],
  'pivot tables': ['excel'],
  'vlookup': ['excel'],
  'data visualisation': ['data visualization'],
  'spreadsheets': ['excel'],
};

const substitutionAllowed = (resumeTerm, jdTerm) => {
  const src = normalizeKeyword(resumeTerm);
  const target = normalizeKeyword(jdTerm);
  if (!src || !target) return false;
  if (src === target) return true;
  const allowed = SYNONYM_SUBSTITUTION[src];
  if (allowed && allowed.some((a) => normalizeKeyword(a) === target)) return true;
  // dictionary direction: JD term lists the source term as a synonym
  const syns = getSynonyms(target);
  if (syns.some((s) => normalizeKeyword(s) === src)) return true;
  return false;
};

/** Build the set of literal resume terms (n-grams) for fast evidence checks. */
const buildEvidenceIndex = (resumeText) => {
  const grams = new Set();
  const text = collapseWhitespace(resumeText).toLowerCase();
  for (const part of text.split(/[^a-z0-9+#/.&-]+/)) {
    if (part.length > 1) grams.add(part);
  }
  return grams;
};

/**
 * @param {object} resume   structured resume model
 * @param {object} jd       output of analyzeJobDescription
 * @param {string[]} userKeywords
 */
export const matchKeywords = (resume, jd, userKeywords = []) => {
  const resumeText = resumeToText(resume);
  const lowerResumeText = resumeText.toLowerCase();
  const evidence = buildEvidenceIndex(resumeText);

  const summaryLower = String(resume?.summary || '').toLowerCase();
  const skillsLower = (resume?.skills || []).flatMap((s) => (s.items ? [s.label, ...s.items] : [s])).join(' ').toLowerCase();
  const experienceEntries = resume?.experience || [];
  const experienceText = experienceEntries.map((e) => [e.role, e.company, ...experienceBullets(e)].filter(Boolean).join(' ')).join(' \n ').toLowerCase();

  const targetPool = [];
  const seen = new Set();
  const push = (keyword, source, priority) => {
    const term = normalizeKeyword(keyword);
    if (!term || seen.has(term)) return;
    seen.add(term);
    targetPool.push({ term: term.toLowerCase(), display: collapseWhitespace(keyword), source, priority });
  };

  for (const k of jd?.highPriority || []) push(k.term, 'jd', 'HIGH');
  for (const k of jd?.mediumPriority || []) push(k.term, 'jd', 'MEDIUM');
  for (const k of jd?.lowPriority || []) push(k.term, 'jd', 'LOW');
  for (const k of dedupeKeywords(userKeywords)) push(k, 'user', 'HIGH');
  if (jd?.targetRole) push(jd.targetRole, 'target-role', 'HIGH');

  const matched = [];
  const missing = [];
  const synonyms = [];
  const repeated = [];
  const unsupported = [];
  const alreadyPresent = [];

  for (const item of targetPool) {
    const term = item.term;
    const literalCount = countTermMentions(lowerResumeText, term);
    const syns = findSynonymMatches(resumeText, term);
    const isSupported = literalCount > 0 || syns.length > 0;
    const location = {
      summary: textMentionsTerm(summaryLower, term) || syns.some((s) => textMentionsTerm(summaryLower, s)),
      skills: textMentionsTerm(skillsLower, term) || syns.some((s) => textMentionsTerm(skillsLower, s)),
      experience: textMentionsTerm(experienceText, term) || syns.some((s) => textMentionsTerm(experienceText, s)),
    };

    if (literalCount > 0) {
      matched.push({
        ...item,
        status: STATUS.MATCHED,
        mentions: literalCount,
        locations: location,
        canInsert: true,
        reason: 'Present verbatim in the source resume',
      });
      if (literalCount >= 3) {
        repeated.push({ term: item.display, mentions: literalCount, level: literalCount >= 6 ? 'high' : 'moderate' });
      }
      alreadyPresent.push(item.display);
    } else if (isSupported) {
      const synonym = syns[0];
      synonyms.push({
        ...item,
        status: STATUS.SYNONYM,
        resumeTerm: synonym,
        synonyms: syns,
        locations: location,
        canInsert: substitutionAllowed(synonym, term),
        reason: `Source resume says "${synonym}" - a meaning-preserving synonym of "${item.display}"`,
      });
      matched.push({
        ...item,
        status: STATUS.SYNONYM,
        mentions: countTermMentions(lowerResumeText, synonym),
        resumeTerm: synonym,
        locations: location,
        canInsert: substitutionAllowed(synonym, term),
        reason: `Supported via synonym "${synonym}"`,
      });
    } else {
      const entry = {
        ...item,
        status: STATUS.MISSING,
        label: 'MISSING - NOT FOUND IN SOURCE RESUME',
        reason: `The job description asks for "${item.display}" but the source resume does not mention it. It has not been added.`,
        canInsert: false,
        locations: { summary: false, skills: false, experience: false },
      };
      missing.push(entry);
      unsupported.push({ ...entry, category: jd ? (jd.keywords.find((k) => k.term === term)?.category || 'other') : 'other' });
    }
  }

  // Repeated-keyword audit on the source resume itself
  const resumeAudit = auditResumeRepetition(resume);

  const summary = {
    targetsConsidered: targetPool.length,
    matched: matched.length,
    literal: matched.filter((m) => m.status === STATUS.MATCHED).length,
    viaSynonym: matched.filter((m) => m.status === STATUS.SYNONYM).length,
    missing: missing.length,
    coverage: targetPool.length ? Math.round((matched.length / targetPool.length) * 100) : 0,
    insertable: matched.filter((m) => m.canInsert).length,
  };

  return {
    resumeText,
    matched,
    missing,
    synonyms,
    repeated,
    unsupported,
    alreadyPresent,
    resumeAudit,
    summary,
    evidence,
  };
};

/** Detect over-used phrases in the source resume (keyword stuffing risk). */
const auditResumeRepetition = (resume) => {
  const flags = [];
  const sections = [];
  const pushSection = (id, text) => {
    if (text && collapseWhitespace(text)) sections.push({ id, text: collapseWhitespace(text) });
  };
  pushSection('summary', resume?.summary);
  for (const e of resume?.experience || []) pushSection(`experience:${e.company || e.role || 'role'}`, experienceBullets(e).join(' '));
  for (const pr of resume?.projects || []) pushSection('projects', (pr.bullets || []).join(' '));

  for (const section of sections) {
    const words = section.text.toLowerCase().split(/[^a-z0-9+#/.-]+/).filter((w) => w.length > 3);
    const counts = new Map();
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
    for (const [word, n] of counts) {
      if (n >= 4) flags.push({ section: section.id, term: word, mentions: n, severity: n >= 6 ? 'high' : 'moderate' });
    }
  }
  // exact duplicate bullets across the resume
  const seenBullets = new Map();
  const duplicates = [];
  for (const e of resume?.experience || []) {
    for (const b of experienceBullets(e)) {
      const key = normalizeKeyword(b);
      if (!key) continue;
      if (seenBullets.has(key)) duplicates.push({ text: b, first: seenBullets.get(key) });
      else seenBullets.set(key, e.company || e.role || 'role');
    }
  }
  return { overused: flags.slice(0, 25), duplicateBullets: duplicates };
};

/** Can the rewriter legally use this matched keyword? */
export const canUseKeyword = (match) => Boolean(match && match.canInsert);

export { substitutionAllowed, SYNONYM_SUBSTITUTION };
export default matchKeywords;
