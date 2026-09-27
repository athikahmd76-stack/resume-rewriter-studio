/**
 * ATSScorer
 * =========
 * A DETERMINISTIC, heuristic scoring engine.
 *
 * It does NOT simulate any real Applicant Tracking System and the UI labels
 * every number it produces as a "Local heuristic estimate".
 *
 * Ten components, each 0-100, combined with fixed weights:
 *   1. Keyword coverage        - share of JD/user keywords present in the resume
 *   2. JD relevance            - how much of the resume maps onto JD sections
 *   3. Skill alignment         - matched skills vs total required skills
 *   4. Job-title alignment     - role-title overlap with the target role/JD title
 *   5. Action verbs            - share of bullets starting with a strong verb
 *   6. Readability             - bullet length, sentence length, jargon density
 *   7. Section structure       - standard ATS headings present and ordered
 *   8. Duplicate content       - 100 minus over-repetition / duplicate penalties
 *   9. Missing keywords        - penalty for high-priority gaps
 *  10. Unsupported keywords    - penalty for skills claimed that the JD/source cannot support
 */

import { STRONG_VERB_SET, ACHIEVEMENT_VERBS, LEADERSHIP_VERBS, ANALYTICAL_VERBS } from '../data/actionVerbs.js';
import { resumeToText, experienceBullets } from './resumeModel.js';
import { countWords, clampPercent, similarity } from '../utils/textUtils.js';
import { textMentionsTerm, normalizeKeyword } from '../utils/keywordUtils.js';
import { hasMetric } from './resumeParser.js';
import { CANONICAL_SECTION_ORDER } from '../data/sectionDictionary.js';

const WEIGHTS = {
  keywordCoverage: 0.2,
  jdRelevance: 0.1,
  skillAlignment: 0.14,
  titleAlignment: 0.08,
  actionVerbs: 0.11,
  readability: 0.09,
  sectionStructure: 0.11,
  duplicateContent: 0.08,
  missingKeywords: 0.05,
  unsupportedKeywords: 0.04,
};

const pct = (n, d) => (d > 0 ? clampPercent((n / d) * 100) : 0);

const bulletStartsWithVerb = (text) => {
  const first = (String(text || '').split(/\s+/)[0] || '').replace(/[^A-Za-z-]/g, '');
  if (!first) return false;
  const lower = first.toLowerCase();
  if (STRONG_VERB_SET.has(lower)) return true;
  if (ACHIEVEMENT_VERBS.has(lower)) return true;
  if (LEADERSHIP_VERBS.has(lower) || ANALYTICAL_VERBS.has(lower)) return true;
  if (/^[a-z]+ed$/i.test(first)) return true;
  if (/^[a-z]+s$/i.test(first) && first.length > 5) return true;
  return false;
};

const collectBullets = (resume) => {
  const bullets = [];
  for (const e of resume?.experience || []) {
    for (const b of experienceBullets(e)) bullets.push({ text: b, kind: 'experience' });
  }
  for (const p of resume?.projects || []) {
    for (const b of p.bullets || []) bullets.push({ text: b, kind: 'project' });
  }
  for (const a of resume?.achievements || []) bullets.push({ text: a.text, kind: 'achievement' });
  return bullets;
};

/**
 * @param {object} resume   resume to score (original OR optimized)
 * @param {object} jd       JD analysis
 * @param {object} match    keyword match result
 * @param {object} [options] { layout }
 */
export const scoreAts = (resume, jd, match, options = {}) => {
  const text = resumeToText(resume);
  const lowerText = text.toLowerCase();
  const bullets = collectBullets(resume);

  // --- 1. keyword coverage -------------------------------------------------
  const high = jd?.highPriority || [];
  const medium = jd?.mediumPriority || [];
  const targets = [
    ...high.map((k) => ({ term: k.term, weight: 3 })),
    ...medium.map((k) => ({ term: k.term, weight: 2 })),
  ];
  const seenTarget = new Set();
  const uniqueTargets = targets.filter((t) => {
    if (!t.term || seenTarget.has(t.term)) return false;
    seenTarget.add(t.term);
    return true;
  });
  const matchedTargets = uniqueTargets.filter((t) => textMentionsTerm(lowerText, t.term));
  const userTargets = (match ? [...match.matched, ...match.missing] : []).filter((m) => m.source === 'user' || m.source === 'target-role');
  const userMatched = userTargets.filter((m) => textMentionsTerm(lowerText, m.term));
  const keywordCoverage = uniqueTargets.length
    ? clampPercent(
      (matchedTargets.reduce((acc, t) => acc + t.weight, 0) / uniqueTargets.reduce((acc, t) => acc + t.weight, 0)) * 0.8
      + (userTargets.length ? (userMatched.length / userTargets.length) * 100 * 0.2 : 20),
    )
    : (userTargets.length ? pct(userMatched.length, userTargets.length) : 55);

  // --- 2. JD relevance -----------------------------------------------------
  const jdTerms = (jd?.domainTerms?.length ? jd.domainTerms : (jd?.technologies || [])).slice(0, 30);
  const jdHit = jdTerms.filter((t) => textMentionsTerm(lowerText, t));
  const jdResponsibilityWords = (jd?.responsibilities || [])
    .flatMap((r) => String(r).toLowerCase().split(/[^a-z0-9+#/.-]+/))
    .filter((w) => w.length > 5);
  const jdWordHits = jdResponsibilityWords.filter((w) => lowerText.includes(w));
  const jdRelevance = jdTerms.length
    ? clampPercent((jdHit.length / jdTerms.length) * 70 + (jdResponsibilityWords.length ? (jdWordHits.length / jdResponsibilityWords.length) * 30 : 30))
    : 60;

  // --- 3. skill alignment --------------------------------------------------
  const resumeSkillText = (resume?.skills || []).flatMap((s) => (s.items ? [s.label, ...s.items] : [s])).join(' ');
  const requiredSkills = (jd?.requiredSkills?.length ? jd.requiredSkills : (jd?.technologies || [])).slice(0, 25);
  const skillHits = requiredSkills.filter((s) => textMentionsTerm(`${resumeSkillText} ${lowerText}`, s));
  const skillAlignment = requiredSkills.length ? pct(skillHits.length, requiredSkills.length) : 60;
  const skillCount = (resume?.skills || []).reduce((acc, g) => acc + (g.items?.length || 0), 0);

  // --- 4. job-title alignment ---------------------------------------------
  const targetTitle = jd?.targetRole || jd?.title || '';
  const currentTitles = (resume?.experience || []).map((e) => e.role).filter(Boolean);
  let titleAlignment = 50;
  if (targetTitle) {
    const t = normalizeKeyword(targetTitle);
    const best = Math.max(0, ...currentTitles.map((role) => {
      const r = normalizeKeyword(role);
      if (!r) return 0;
      if (r === t) return 100;
      if (textMentionsTerm(r, t) || textMentionsTerm(t, r)) return 88;
      return similarity(r, t) * 70;
    }));
    titleAlignment = currentTitles.length ? clampPercent(best) : 30;
  }

  // --- 5. action verbs -----------------------------------------------------
  const verbHits = bullets.filter((b) => bulletStartsWithVerb(b.text)).length;
  const actionVerbs = bullets.length ? pct(verbHits, bullets.length) : 50;

  // --- 6. readability ------------------------------------------------------
  const lengths = bullets.map((b) => countWords(b.text));
  const ideal = lengths.filter((n) => n >= 8 && n <= 28).length;
  const tooLong = lengths.filter((n) => n > 34).length;
  const tooShort = lengths.filter((n) => n > 0 && n < 5).length;
  const passive = bullets.filter((b) => /\b(responsible for|worked on|helped|assisted|was responsible|participated in)\b/i.test(b.text)).length;
  const readability = bullets.length
    ? clampPercent(
      (ideal / bullets.length) * 60
      + (1 - Math.min(1, tooLong / bullets.length)) * 20
      + (1 - Math.min(1, tooShort / bullets.length)) * 10
      + (1 - Math.min(1, passive / bullets.length)) * 10,
    )
    : 60;

  // --- 7. section structure ------------------------------------------------
  const present = new Set((resume?.sections || []).map((s) => s.id));
  const requiredSections = ['summary', 'experience', 'skills', 'education'];
  const presentCount = requiredSections.filter((s) => present.has(s)).length;
  const orderBonus = canonicalOrderScore(resume?.sections || []);
  const lengthPenalty = bullets.length > 45 ? 8 : bullets.length > 30 ? 4 : 0;
  const sectionStructure = clampPercent(pct(presentCount, requiredSections.length) * 0.65 + orderBonus * 0.35 - lengthPenalty);

  // --- 8. duplicate content -----------------------------------------------
  const dupes = match?.resumeAudit?.duplicateBullets?.length || 0;
  const overused = (match?.resumeAudit?.overused || []).filter((o) => o.mentions >= 5).length;
  const duplicateContent = clampPercent(100 - dupes * 12 - overused * 4);

  // --- 9. missing keywords -------------------------------------------------
  const missingHigh = (match?.missing || []).filter((m) => m.priority === 'HIGH' || m.source === 'user');
  const missingKeywords = missingHigh.length
    ? clampPercent(100 - Math.min(100, missingHigh.length * 12))
    : 92;

  // --- 10. unsupported keywords --------------------------------------------
  const unsupported = (match?.unsupported || []).filter((m) => m.category === 'technology' || m.category === 'domain-skill');
  const claimedUnsupported = unsupported.filter((m) => textMentionsTerm(lowerText, m.term));
  const unsupportedKeywords = clampPercent(100 - claimedUnsupported.length * 25 - (unsupported.length ? 4 : 0));

  const components = [
    { id: 'keywordCoverage', label: 'Keyword Match', value: keywordCoverage, weight: WEIGHTS.keywordCoverage, hint: 'Share of job-description and target keywords present in the resume.' },
    { id: 'jdRelevance', label: 'JD Alignment', value: jdRelevance, weight: WEIGHTS.jdRelevance, hint: 'How much of the resume language maps onto the job description.' },
    { id: 'skillAlignment', label: 'Skill Match', value: skillAlignment, weight: WEIGHTS.skillAlignment, hint: 'Required skills found versus required skills requested.' },
    { id: 'titleAlignment', label: 'Experience Relevance', value: titleAlignment, weight: WEIGHTS.titleAlignment, hint: 'Job-title overlap between the target role and the held roles.' },
    { id: 'actionVerbs', label: 'Action Verbs', value: actionVerbs, weight: WEIGHTS.actionVerbs, hint: 'Bullets that open with a strong, results-oriented verb.' },
    { id: 'readability', label: 'Readability', value: readability, weight: WEIGHTS.readability, hint: 'Bullet length, sentence length and removal of passive phrasing.' },
    { id: 'sectionStructure', label: 'Formatting Compatibility', value: sectionStructure, weight: WEIGHTS.sectionStructure, hint: 'Standard ATS headings, ordering and document length.' },
    { id: 'duplicateContent', label: 'Duplicate Content', value: duplicateContent, weight: WEIGHTS.duplicateContent, hint: 'Penalty for repeated bullets and over-used phrases.' },
    { id: 'missingKeywords', label: 'Missing Keywords', value: missingKeywords, weight: WEIGHTS.missingKeywords, hint: 'Penalty for high-priority job keywords absent from the resume.' },
    { id: 'unsupportedKeywords', label: 'Unsupported Keywords', value: unsupportedKeywords, weight: WEIGHTS.unsupportedKeywords, hint: 'Penalty for claiming skills the source resume cannot support.' },
  ];

  const overall = clampPercent(components.reduce((acc, c) => acc + c.value * c.weight, 0));

  // --- recommendations (deterministic rules) -------------------------------
  const recommendations = buildRecommendations({ resume, jd, match, bullets, components, skillCount, layout: options.layout });

  return {
    overall,
    components,
    band: bandFor(overall),
    disclaimer: 'Local heuristic estimate generated by deterministic local rules. This is not a real ATS simulation and no applicant tracking system was contacted.',
    recommendations,
    metrics: {
      bulletCount: bullets.length,
      skillCount,
      sectionCount: (resume?.sections || []).length,
      avgBulletWords: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
      metricBullets: bullets.filter((b) => hasMetric(b.text)).length,
      wordCount: countWords(text),
    },
  };
};

const canonicalOrderScore = (sections) => {
  const ids = sections.map((s) => s.id);
  const positions = ids.map((id) => CANONICAL_SECTION_ORDER.indexOf(id)).filter((i) => i !== -1);
  if (positions.length < 2) return 60;
  let inversions = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i] < positions[i - 1]) inversions += 1;
  }
  return clampPercent(100 - (inversions / Math.max(1, positions.length - 1)) * 100);
};

const bandFor = (score) => {
  if (score >= 85) return { id: 'strong', label: 'Strong', color: '#16a34a' };
  if (score >= 70) return { id: 'good', label: 'Good', color: '#65a30d' };
  if (score >= 55) return { id: 'fair', label: 'Fair', color: '#d97706' };
  return { id: 'weak', label: 'Needs work', color: '#dc2626' };
};

const buildRecommendations = ({ resume, jd, match, bullets, components, skillCount, layout }) => {
  const recs = [];
  const missingHigh = (match?.missing || []).filter((m) => m.priority === 'HIGH' || m.source === 'user');
  if (missingHigh.length) {
    recs.push({
      id: 'missing-keywords',
      level: 'info',
      title: `${missingHigh.length} keyword${missingHigh.length > 1 ? 's' : ''} in the job description ${missingHigh.length > 1 ? 'are' : 'is'} not in your resume`,
      detail: missingHigh.slice(0, 12).map((m) => m.display).join(', '),
      note: 'These were NOT added. If you genuinely have this experience, add it yourself in the editor.',
    });
  }
  const unsupported = (match?.unsupported || []).filter((m) => m.category === 'technology');
  if (unsupported.length) {
    recs.push({
      id: 'unsupported-tech',
      level: 'warning',
      title: `Do not claim ${unsupported.slice(0, 5).map((m) => m.display).join(', ')} unless you have the experience`,
      detail: 'The engine blocked these because the source resume does not support them.',
      note: 'Interviewers and background checks do verify tooling claims.',
    });
  }
  const nonVerb = bullets.filter((b) => !bulletStartsWithVerb(b.text));
  if (nonVerb.length > Math.max(1, bullets.length * 0.2)) {
    recs.push({
      id: 'weak-verbs',
      level: 'warning',
      title: `${nonVerb.length} bullet${nonVerb.length > 1 ? 's do' : ' does'} not start with a strong verb`,
      detail: nonVerb.slice(0, 4).map((b) => `"${b.text.slice(0, 60)}..."`).join(' / '),
      note: 'Start each bullet with a past-tense action verb (Managed, Delivered, Optimized).',
    });
  }
  const noMetric = bullets.filter((b) => !hasMetric(b.text));
  if (noMetric.length > bullets.length * 0.6 && bullets.length >= 3) {
    recs.push({
      id: 'no-metrics',
      level: 'info',
      title: 'Consider adding measurable achievements if available',
      detail: `${noMetric.length} of ${bullets.length} bullets contain no measurable outcome.`,
      note: 'The engine never invents numbers. Add real figures you can defend in an interview.',
    });
  }
  const long = bullets.filter((b) => countWords(b.text) > 34);
  if (long.length) {
    recs.push({
      id: 'long-bullets',
      level: 'info',
      title: `${long.length} bullet${long.length > 1 ? 's are' : ' is'} longer than 34 words`,
      detail: 'Long bullets are harder to scan and often skipped by screeners.',
      note: 'Aim for 12-26 words per bullet.',
    });
  }
  const dupes = match?.resumeAudit?.duplicateBullets || [];
  if (dupes.length) {
    recs.push({
      id: 'duplicates',
      level: 'warning',
      title: `${dupes.length} duplicated bullet${dupes.length > 1 ? 's' : ''} detected`,
      detail: 'The same bullet appears more than once.',
      note: 'Duplicated content lowers the score of every component.',
    });
  }
  if (skillCount < 8) {
    recs.push({
      id: 'thin-skills',
      level: 'info',
      title: 'Skills list is short',
      detail: `${skillCount} skill${skillCount === 1 ? '' : 's'} detected.`,
      note: 'List the tools you genuinely use, matching the wording in the job description.',
    });
  }
  const softLow = components.find((c) => c.id === 'titleAlignment');
  if (softLow && softLow.value < 45) {
    recs.push({
      id: 'title-gap',
      level: 'info',
      title: 'Job title does not match the target role',
      detail: `Held titles score ${softLow.value}% against the target role.`,
      note: 'If you hold the target role under a different name, say so plainly in the summary.',
    });
  }
  if (jd?.yearsOfExperience?.length) {
    const requested = jd.yearsOfExperience[0].years;
    const stated = (String(resume?.summary || '') + ' ' + (resume?.experience || []).map((e) => e.dates).join(' ')).match(/(\d{1,2})\s*\+?\s*years?/i);
    const has = stated ? Number(stated[1]) : null;
    if (has !== null && has < requested) {
      recs.push({
        id: 'years-gap',
        level: 'info',
        title: `Job description asks for ${requested}+ years, your resume shows ${has}+`,
        detail: 'Only add years you can evidence.',
        note: 'Do not inflate your experience. Show scope and impact instead.',
      });
    }
  }
  if (layout?.columns > 1) {
    recs.push({
      id: 'multi-column',
      level: 'warning',
      title: `Original layout uses ${layout.columns} column${layout.columns > 1 ? 's' : ''}`,
      detail: 'Multi-column layouts can scramble ATS text extraction order.',
      note: 'A single-column layout is the safest option for applicant tracking systems.',
    });
  }
  if (layout?.tables?.length) {
    recs.push({
      id: 'tables',
      level: 'warning',
      title: 'The original document uses tables for layout',
      detail: `${layout.tables.length} table${layout.tables.length > 1 ? 's' : ''} detected.`,
      note: 'Tables often break keyword extraction in older parsers.',
    });
  }
  if (!recs.length) {
    recs.push({
      id: 'clean',
      level: 'success',
      title: 'No structural issues detected by the local rules',
      detail: 'Keep the content accurate and re-check the score after each application.',
      note: 'Scores are heuristic estimates, not ATS verdicts.',
    });
  }
  return recs;
};

/** Score both the original and the optimized resume so the UI can show a delta. */
export const scoreComparison = (originalResume, optimizedResume, jd, match, layout) => ({
  original: scoreAts(originalResume, jd, match, { layout }),
  optimized: scoreAts(optimizedResume, jd, match, { layout }),
});

export default scoreAts;
