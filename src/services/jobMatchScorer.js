/**
 * JobMatchScorer
 * ===============
 * A DETERMINISTIC "how well does this resume match this job" percentage.
 *
 * This is deliberately separate from the ATS score. The ATS score asks "how
 * machine-readable and well-formed is this document?". The job match asks "how
 * much of what this job wants can this resume actually evidence?".
 *
 * Five components, each 0-100, combined with fixed weights:
 *   1. Keyword coverage  - share of weighted JD + target keywords present
 *   2. Required skills   - must-have skills the posting lists, found or not
 *   3. Role alignment   - overlap between the target role and the held roles
 *   4. JD language      - the posting's own vocabulary appearing in the resume
 *   5. Evidence strength - quantified bullets, breadth and section completeness
 *
 * Everything below reads only from data that is already in memory. Nothing is
 * inferred about the candidate that the parsed resume does not state, and a
 * keyword that is absent is reported as a gap rather than assumed.
 */

import { resumeToText, experienceBullets } from './resumeModel.js';
import { clampPercent, similarity, countWords } from '../utils/textUtils.js';
import { textMentionsTerm, normalizeKeyword } from '../utils/keywordUtils.js';
import { hasMetric } from './resumeParser.js';

const WEIGHTS = {
  keywordCoverage: 0.34,
  requiredSkills: 0.24,
  roleAlignment: 0.16,
  jdLanguage: 0.14,
  evidenceStrength: 0.12,
};

const pct = (n, d) => (d > 0 ? clampPercent((n / d) * 100) : 0);

const collectBullets = (resume) => {
  const bullets = [];
  for (const e of resume?.experience || []) {
    for (const b of experienceBullets(e)) bullets.push(b);
  }
  for (const p of resume?.projects || []) {
    for (const b of p.bullets || []) bullets.push(b);
  }
  for (const a of resume?.achievements || []) bullets.push(a.text);
  return bullets.filter(Boolean);
};

/**
 * Weight a keyword pool so a high-priority or must-have term counts for more
 * than a passing mention. Unknown terms carry a neutral weight.
 */
const buildWeightedPool = (jd, match) => {
  const pool = new Map();
  const add = (term, weight) => {
    if (!term) return;
    const key = normalizeKeyword(term) || String(term).toLowerCase();
    if (!key || pool.has(key)) return;
    pool.set(key, { term, weight });
  };
  for (const k of jd?.highPriority || []) add(k.term, 3);
  for (const k of jd?.mediumPriority || []) add(k.term, 2);
  for (const t of jd?.requiredSkills || []) add(t, 3);
  for (const t of jd?.hardRequirements || []) add(t, 3);
  for (const k of match?.matched || []) {
    if (k.source === 'user' || k.source === 'target-role') add(k.term, 2);
  }
  for (const k of match?.missing || []) {
    if (k.source === 'user' || k.source === 'target-role') add(k.term, 2);
  }
  return [...pool.values()];
};

/**
 * @param {object} resume  resume to score (original OR optimized)
 * @param {object} jd      JD analysis result
 * @param {object} match   keyword match result
 * @param {object} [options] { layout }
 */
export const scoreJobMatch = (resume, jd, match, options = {}) => {
  const layout = options.layout || null;
  const text = resumeToText(resume);
  const lowerText = text.toLowerCase();

  // --- 1. weighted keyword coverage ----------------------------------------
  const pool = buildWeightedPool(jd, match);
  const hits = pool.filter((p) => textMentionsTerm(lowerText, p.term));
  const hitKeys = new Set(hits.map((p) => normalizeKeyword(p.term) || p.term.toLowerCase()));
  const totalWeight = pool.reduce((a, p) => a + p.weight, 0);
  const hitWeight = hits.reduce((a, p) => a + p.weight, 0);
  const keywordCoverage = totalWeight ? clampPercent((hitWeight / totalWeight) * 100) : (pool.length ? 0 : 50);

  // --- 2. required skills ---------------------------------------------------
  const required = (jd?.requiredSkills?.length ? jd.requiredSkills : (jd?.hardRequirements || [])).slice(0, 30);
  const skillContext = `${(resume?.skills || []).flatMap((s) => (s.items ? [s.label, ...s.items] : [s])).join(' ')} ${lowerText}`;
  const requiredHits = required.filter((s) => textMentionsTerm(skillContext, s));
  const requiredSkills = required.length ? pct(requiredHits.length, required.length) : 60;

  // --- 3. role alignment ----------------------------------------------------
  const targetTitle = jd?.targetRole || jd?.title || '';
  const heldRoles = (resume?.experience || []).map((e) => e.role).filter(Boolean);
  let roleAlignment = 50;
  if (targetTitle) {
    const t = normalizeKeyword(targetTitle);
    const best = Math.max(0, ...heldRoles.map((role) => {
      const r = normalizeKeyword(role);
      if (!r) return 0;
      if (r === t) return 100;
      if (textMentionsTerm(r, t) || textMentionsTerm(t, r)) return 86;
      return similarity(r, t) * 72;
    }));
    roleAlignment = heldRoles.length ? clampPercent(best) : 25;
  } else if (heldRoles.length) {
    roleAlignment = 60;
  }

  // --- 4. JD language -------------------------------------------------------
  const jdTerms = (jd?.domainTerms?.length ? jd.domainTerms : (jd?.technologies || [])).slice(0, 30);
  const jdLongWords = (jd?.responsibilities || [])
    .flatMap((r) => String(r).toLowerCase().split(/[^a-z0-9+#/.-]+/))
    .filter((w) => w.length > 5);
  const jdTermHits = jdTerms.filter((t) => textMentionsTerm(lowerText, t));
  const jdWordHits = jdLongWords.filter((w) => lowerText.includes(w));
  const jdLanguage = jdTerms.length
    ? clampPercent((jdTermHits.length / jdTerms.length) * 70 + (jdLongWords.length ? (jdWordHits.length / jdLongWords.length) * 30 : 30))
    : (jdLongWords.length ? clampPercent((jdWordHits.length / jdLongWords.length) * 100) : 55);

  // --- 5. evidence strength -------------------------------------------------
  const bullets = collectBullets(resume);
  const quantified = bullets.filter((b) => hasMetric(b)).length;
  const quantRatio = bullets.length ? quantified / bullets.length : 0;
  const sectionIds = new Set((resume?.sections || []).map((s) => s.id));
  const CORE_SECTIONS = ['summary', 'experience', 'skills', 'education'];
  const sectionRatio = CORE_SECTIONS.filter((s) => sectionIds.has(s)).length / CORE_SECTIONS.length;
  const skillCount = (resume?.skills || []).reduce((a, g) => a + (g.items?.length || 0), 0);
  const breadth = clampPercent(Math.min(100, (skillCount / 14) * 100));
  const avgWords = bullets.length ? bullets.reduce((a, b) => a + countWords(b), 0) / bullets.length : 0;
  const lengthFit = bullets.length ? clampPercent(100 - Math.min(100, Math.abs(avgWords - 18) * 5)) : 40;
  const evidenceStrength = clampPercent(quantRatio * 40 + sectionRatio * 30 + breadth * 15 + lengthFit * 15);

  const components = [
    { id: 'keywordCoverage', label: 'Keyword Coverage', value: keywordCoverage, weight: WEIGHTS.keywordCoverage, hint: 'Weighted share of the keywords this job asks for that your resume actually contains.' },
    { id: 'requiredSkills', label: 'Required Skills', value: requiredSkills, weight: WEIGHTS.requiredSkills, hint: 'Must-have skills listed in the posting, found in your resume.' },
    {
      id: 'roleAlignment',
      label: 'Role Alignment',
      value: roleAlignment,
      weight: WEIGHTS.roleAlignment,
      hint: 'How closely your held job titles match the role you are applying for.',
      movable: false,
      lockedReason: 'Measured against the job titles you actually held. Raising it would mean claiming a title you did not hold, so it moves only when your real titles match the posting.',
    },
    { id: 'jdLanguage', label: 'Job Description Language', value: jdLanguage, weight: WEIGHTS.jdLanguage, hint: "The posting's own terminology appearing in your resume." },
    { id: 'evidenceStrength', label: 'Evidence Strength', value: evidenceStrength, weight: WEIGHTS.evidenceStrength, hint: 'Quantified achievements, section completeness and skills breadth.' },
  ];

  const overall = clampPercent(components.reduce((acc, c) => acc + c.value * c.weight, 0));

  // --- gaps the report calls out explicitly ---------------------------------
  const missingTerms = (match?.missing || [])
    .filter((m) => m.priority === 'HIGH' || m.source === 'user' || m.priority === 'MEDIUM')
    .filter((m) => {
      const key = normalizeKeyword(m.term) || String(m.term).toLowerCase();
      return !hitKeys.has(key);
    })
    .map((m) => ({ term: m.term, display: m.display, priority: m.priority || 'MEDIUM' }));

  const absentRequired = required.filter((s) => !requiredHits.includes(s));
  const unsupported = (match?.unsupported || []).filter((m) => m.category === 'technology' || m.category === 'domain-skill');

  return {
    overall,
    components,
    band: bandFor(overall),
    verdict: verdictFor(overall),
    disclaimer:
      'Local heuristic estimate computed from the job description and your own resume. It is not a recruiter decision, an offer likelihood, or a real applicant tracking system result.',
    facts: {
      targetsConsidered: pool.length,
      targetsMatched: hits.length,
      requiredConsidered: required.length,
      requiredMatched: requiredHits.length,
      quantifiedBullets: quantified,
      totalBullets: bullets.length,
      skillCount,
      sectionsPresent: sectionIds.size,
      jdProvided: Boolean(jd?.provided),
      layoutRisk: layout ? layout.columns > 1 || Boolean(layout.tables?.length) : false,
    },
    gaps: {
      missing: missingTerms.slice(0, 20),
      absentRequired: absentRequired.slice(0, 20),
      unsupportedCount: unsupported.length,
    },
    matchedTerms: hits.map((p) => p.term).slice(0, 40),
  };
};

const bandFor = (score) => {
  if (score >= 85) return { id: 'excellent', label: 'Excellent match', color: '#16a34a' };
  if (score >= 70) return { id: 'strong', label: 'Strong match', color: '#65a30d' };
  if (score >= 55) return { id: 'partial', label: 'Partial match', color: '#d97706' };
  if (score >= 40) return { id: 'weak', label: 'Weak match', color: '#ea580c' };
  return { id: 'low', label: 'Low match', color: '#dc2626' };
};

const verdictFor = (score) => {
  if (score >= 85) return 'This resume evidences most of what the job asks for. Apply with confidence.';
  if (score >= 70) return 'Most requirements are evidenced. Close the remaining gaps before applying.';
  if (score >= 55) return 'A solid base with real gaps. Address the missing keywords honestly before applying.';
  if (score >= 40) return 'A significant part of the job description is not evidenced yet. This needs work first.';
  return 'Little of the job description is currently evidenced. Rework the resume before applying.';
};

/** Score both resumes so the UI and the report can show a before/after pair. */
export const jobMatchComparison = (originalResume, optimizedResume, jd, match, layout) => ({
  original: scoreJobMatch(originalResume, jd, match, { layout }),
  optimized: scoreJobMatch(optimizedResume, jd, match, { layout }),
});

export default scoreJobMatch;
