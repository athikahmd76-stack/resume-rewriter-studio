/**
 * SwotAnalyzer
 * ============
 * A DETERMINISTIC SWOT breakdown of a resume against a specific job.
 *
 * The same honesty rules as the rest of the app apply, and they matter more
 * here than anywhere else:
 *
 *   - Every item cites the evidence it was derived from.
 *   - A strength is something the resume demonstrably contains.
 *   - A weakness is something the resume demonstrably lacks or does badly.
 *   - An opportunity is a *change the candidate could make*. It never asserts
 *     that the candidate has an experience they have not claimed.
 *   - A threat is a risk to this specific application, stated as a risk.
 *
 * Anything the source resume does not support is labelled as a gap to close,
 * never as a strength. The engine cannot tell you whether you have worked with
 * a tool it has never seen you mention, so it will not pretend to.
 */

import { experienceBullets } from './resumeModel.js';
import { countWords } from '../utils/textUtils.js';
import { hasMetric } from './resumeParser.js';

const S = 'strength';
const W = 'weakness';
const O = 'opportunity';
const T = 'threat';

const collectBullets = (resume) => {
  const bullets = [];
  for (const e of resume?.experience || []) {
    for (const b of experienceBullets(e)) bullets.push(b);
  }
  for (const p of resume?.projects || []) for (const b of p.bullets || []) bullets.push(b);
  for (const a of resume?.achievements || []) bullets.push(a.text);
  return bullets.filter(Boolean);
};

const componentValue = (scores, id) => scores?.components?.find((c) => c.id === id)?.value ?? null;
const list = (items) => items.map((s) => String(s).trim()).filter(Boolean);

/** Keep the highest-priority items, but never fewer than `min`. */
const top = (items, n, min = 4) => {
  const rank = { high: 0, medium: 1, low: 2 };
  const sorted = [...items].sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
  return sorted.slice(0, Math.max(min, n));
};

/**
 * @param {object} input
 * @param {object} input.resume          the optimized (live) resume
 * @param {object} input.originalResume  the parsed original
 * @param {object} input.jd              JD analysis
 * @param {object} input.match           keyword match result
 * @param {object} input.scores          { original, optimized } ATS scores
 * @param {object} input.jobMatch        { original, optimized } job match scores
 * @param {object} input.guard           fact guard result
 * @param {object} input.layout          detected layout model
 * @param {object} input.changeLog       applied rewrite changes
 */
export const buildSwot = ({
  resume,
  jd,
  match,
  scores,
  jobMatch,
  guard,
  layout,
  changeLog,
} = {}) => {
  const strengths = [];
  const weaknesses = [];
  const opportunities = [];
  const threats = [];

  const opt = jobMatch?.optimized || null;
  const optAts = scores?.optimized || null;
  const bullets = collectBullets(resume);
  const quantified = bullets.filter((b) => hasMetric(b));
  const sectionIds = new Set((resume?.sections || []).map((s) => s.id));
  const skillCount = (resume?.skills || []).reduce((a, g) => a + (g.items?.length || 0), 0);
  const literalHits = (match?.matched || []).filter((m) => m.status === 'MATCHED');
  const synonymHits = (match?.matched || []).filter((m) => m.status === 'SYNONYM');
  const missing = match?.missing || [];
  const missingHigh = missing.filter((m) => m.priority === 'HIGH' || m.source === 'user');
  const unsupportedTech = (match?.unsupported || []).filter((m) => m.category === 'technology');
  const audit = match?.resumeAudit || { overused: [], duplicateBullets: [] };

  // ==================== STRENGTHS ====================
  if (literalHits.length) {
    strengths.push({
      id: 's-keywords',
      title: `${literalHits.length} job keyword${literalHits.length > 1 ? 's' : ''} already stated explicitly`,
      detail: list(literalHits.slice(0, 12).map((m) => m.display)).join(', '),
      severity: literalHits.length >= 12 ? 'high' : literalHits.length >= 6 ? 'medium' : 'low',
    });
  }
  if (quantified.length) {
    strengths.push({
      id: 's-metrics',
      title: `${quantified.length} of ${bullets.length} bullets carry a measurable result`,
      detail: `That is ${bullets.length ? Math.round((quantified.length / bullets.length) * 100) : 0}% of your experience bullets - the strongest signal on any resume.`,
      severity: quantified.length / Math.max(1, bullets.length) >= 0.5 ? 'high' : 'medium',
    });
  }
  const verbs = componentValue(optAts, 'actionVerbs');
  if (verbs !== null && verbs >= 65) {
    strengths.push({
      id: 's-verbs',
      title: `${verbs}% of bullets open with a strong action verb`,
      detail: 'Recruiters and screeners scan the first word of every bullet.',
      severity: verbs >= 80 ? 'high' : 'medium',
    });
  }
  const presentCore = ['summary', 'experience', 'skills', 'education'].filter((s) => sectionIds.has(s));
  if (presentCore.length >= 3) {
    strengths.push({
      id: 's-structure',
      title: `Standard ATS sections present (${presentCore.length} of 4)`,
      detail: `Detected: ${presentCore.join(', ')}.`,
      severity: presentCore.length === 4 ? 'medium' : 'low',
    });
  }
  if ((resume?.certifications || []).length) {
    strengths.push({
      id: 's-certs',
      title: `${resume.certifications.length} certification${resume.certifications.length > 1 ? 's' : ''} listed`,
      detail: list(resume.certifications.slice(0, 4).map((c) => c.name || c.text)).join(', '),
      severity: 'low',
    });
  }
  if (skillCount >= 10) {
    strengths.push({
      id: 's-skills',
      title: `${skillCount} named skills across the resume`,
      detail: 'Breadth gives keyword matchers more to match against.',
      severity: 'low',
    });
  }
  if (opt && opt.overall >= 70) {
    strengths.push({
      id: 's-match',
      title: `Job match scores ${opt.overall}% after the rewrite`,
      detail: opt.verdict,
      severity: opt.overall >= 85 ? 'high' : 'medium',
    });
  }
  if (optAts && optAts.overall >= 70) {
    strengths.push({
      id: 's-ats',
      title: `ATS heuristic score of ${optAts.overall}%`,
      detail: 'The document parses cleanly and follows the structure a parser expects.',
      severity: 'medium',
    });
  }
  if (guard?.passed && (changeLog?.length || 0) > 0) {
    strengths.push({
      id: 's-guard',
      title: `${changeLog.length} rewrite change${changeLog.length > 1 ? 's' : ''} applied with the fact guard passing`,
      detail: 'Every edit was re-checked against the source document. Nothing unsupported was introduced.',
      severity: 'medium',
    });
  }

  // ==================== WEAKNESSES ====================
  if (missingHigh.length) {
    weaknesses.push({
      id: 'w-missing',
      title: `${missingHigh.length} requested keyword${missingHigh.length > 1 ? 's' : ''} not in your resume`,
      detail: list(missingHigh.slice(0, 12).map((m) => m.display)).join(', '),
      severity: missingHigh.length >= 8 ? 'high' : missingHigh.length >= 3 ? 'medium' : 'low',
    });
  }
  const absentRequired = opt?.gaps?.absentRequired || [];
  if (absentRequired.length) {
    weaknesses.push({
      id: 'w-required',
      title: `${absentRequired.length} skill${absentRequired.length > 1 ? 's' : ''} the posting lists as required ${absentRequired.length > 1 ? 'are' : 'is'} absent`,
      detail: list(absentRequired.slice(0, 12)).join(', '),
      severity: absentRequired.length >= 4 ? 'high' : 'medium',
    });
  }
  if (bullets.length && quantified.length / bullets.length < 0.3) {
    weaknesses.push({
      id: 'w-nometrics',
      title: `${bullets.length - quantified.length} of ${bullets.length} bullets have no measurable outcome`,
      detail: 'Unquantified bullets are much harder to rank above other candidates.',
      severity: quantified.length === 0 ? 'high' : 'medium',
    });
  }
  const read = componentValue(optAts, 'readability');
  if (read !== null && read < 60) {
    weaknesses.push({
      id: 'w-readability',
      title: `Readability scores ${read}%`,
      detail: 'Bullets run long, sit in the wrong length range, or still use passive phrasing such as "responsible for".',
      severity: read < 45 ? 'high' : 'medium',
    });
  }
  const verbVal = componentValue(optAts, 'actionVerbs');
  if (verbVal !== null && verbVal < 60) {
    weaknesses.push({
      id: 'w-verbs',
      title: `${100 - verbVal}% of bullets do not open with a strong verb`,
      detail: 'Weak openings ("Worked on", "Helped with", "Responsible for") read as low ownership.',
      severity: verbVal < 40 ? 'high' : 'medium',
    });
  }
  if (audit.duplicateBullets.length) {
    weaknesses.push({
      id: 'w-dupes',
      title: `${audit.duplicateBullets.length} duplicated bullet${audit.duplicateBullets.length > 1 ? 's' : ''}`,
      detail: list(audit.duplicateBullets.slice(0, 3).map((d) => d.text.slice(0, 70))).join(' | '),
      severity: 'high',
    });
  }
  const missingSections = ['summary', 'experience', 'skills', 'education'].filter((s) => !sectionIds.has(s));
  if (missingSections.length) {
    weaknesses.push({
      id: 'w-sections',
      title: `No ${missingSections.join(', ')} section detected`,
      detail: 'Parsers look for these exact headings. If the content exists, add the heading yourself.',
      severity: missingSections.includes('experience') ? 'high' : 'medium',
    });
  }
  if (skillCount < 8) {
    weaknesses.push({
      id: 'w-skills',
      title: `Only ${skillCount} named skill${skillCount === 1 ? '' : 's'} detected`,
      detail: 'A short skills list gives a keyword matcher very little to match on.',
      severity: skillCount < 5 ? 'medium' : 'low',
    });
  }
  if (opt && opt.overall < 55) {
    weaknesses.push({
      id: 'w-match',
      title: `Job match is only ${opt.overall}%`,
      detail: opt.verdict,
      severity: opt.overall < 40 ? 'high' : 'medium',
    });
  }
  const long = bullets.filter((b) => countWords(b) > 34);
  if (long.length) {
    weaknesses.push({
      id: 'w-long',
      title: `${long.length} bullet${long.length > 1 ? 's are' : ' is'} longer than 34 words`,
      detail: 'Screeners scan, they do not read. Long bullets get skipped.',
      severity: 'low',
    });
  }

  // ==================== OPPORTUNITIES ====================
  if (missingHigh.length) {
    opportunities.push({
      id: 'o-close-gaps',
      title: `Close ${Math.min(missingHigh.length, 8)} of the missing keyword gaps - if they are true for you`,
      detail: list(missingHigh.slice(0, 8).map((m) => m.display)).join(', '),
      severity: missingHigh.length >= 8 ? 'high' : 'medium',
    });
  }
  if (synonymHits.length) {
    const aligned = synonymHits.filter((m) => m.canInsert);
    opportunities.push({
      id: 'o-synonyms',
      title: `${synonymHits.length} keyword${synonymHits.length > 1 ? 's are' : ' is'} already proven under a synonym`,
      detail: `${list(synonymHits.slice(0, 6).map((m) => `${m.resumeTerm} -> ${m.display}`)).join(', ')}. Use the posting's wording where it means the same thing.`,
      severity: aligned.length ? 'medium' : 'low',
    });
  }
  const requestedCerts = jd?.certifications || [];
  if (requestedCerts.length) {
    const held = (resume?.certifications || []).map((c) => String(c.name || c.text || '').toLowerCase());
    const notHeld = requestedCerts.filter((c) => !held.some((h) => h.includes(String(c.term || c).toLowerCase().slice(0, 6))));
    if (notHeld.length) {
      opportunities.push({
        id: 'o-cert',
        title: `The posting names ${notHeld.length} certification${notHeld.length > 1 ? 's' : ''} you have not listed`,
        detail: list(notHeld.slice(0, 5).map((c) => c.term || String(c))).join(', '),
        severity: 'low',
      });
    }
  }
  const requestedYears = jd?.yearsOfExperience?.[0]?.years || null;
  if (requestedYears) {
    opportunities.push({
      id: 'o-years',
      title: `Make your ${requestedYears}+ years of scope visible in the summary`,
      detail: 'The posting asks for seniority. State the scale you operated at - team size, budget, volume - if it is true.',
      severity: 'medium',
    });
  }
  const preferred = (jd?.preferredSkills || []).slice(0, 10);
  if (preferred.length) {
    opportunities.push({
      id: 'o-preferred',
      title: `${preferred.length} preferred skill${preferred.length > 1 ? 's' : ''} the posting lists as nice-to-have`,
      detail: list(preferred).join(', '),
      severity: 'low',
    });
  }
  const industries = (jd?.industries || []).slice(0, 6);
  if (industries.length) {
    opportunities.push({
      id: 'o-industry',
      title: `Name the industry context the posting expects (${industries.join(', ')})`,
      detail: 'Recruiters screen for sector familiarity. Mention yours where it genuinely applies.',
      severity: 'low',
    });
  }
  if (optAts) {
    const weakest = [...optAts.components].sort((a, b) => a.value - b.value)[0];
    if (weakest && weakest.value < 70) {
      opportunities.push({
        id: 'o-weakest',
        title: `Lowest scoring dimension: ${weakest.label} at ${weakest.value}%`,
        detail: weakest.hint,
        severity: weakest.value < 45 ? 'medium' : 'low',
      });
    }
  }

  // ==================== THREATS ====================
  if (unsupportedTech.length) {
    threats.push({
      id: 't-unsupported',
      title: `${unsupportedTech.length} tool${unsupportedTech.length > 1 ? 's' : ''} this job wants that your resume cannot support`,
      detail: `${list(unsupportedTech.slice(0, 10).map((m) => m.display)).join(', ')}. Claiming these is the fastest way to fail a technical screen.`,
      severity: unsupportedTech.length >= 5 ? 'high' : 'medium',
    });
  }
  const yearsGap = requestedYears ? yearsShortfall(resume, requestedYears) : null;
  if (yearsGap) {
    threats.push({
      id: 't-years',
      title: `The posting asks for ${requestedYears}+ years, your resume shows about ${yearsGap}+`,
      severity: 'high',
      detail: 'This is a hard filter for many screeners. Do not inflate it - show scope and impact instead.',
    });
  }
  const stuffed = (audit.overused || []).filter((o) => o.mentions >= 5);
  if (stuffed.length) {
    threats.push({
      id: 't-stuffing',
      title: `${stuffed.length} phrase${stuffed.length > 1 ? 's are' : ' is'} repeated 5+ times`,
      detail: `${list(stuffed.slice(0, 6).map((o) => `"${o.term}" x${o.mentions}`)).join(', ')}. Modern parsers discount keyword stuffing, and reviewers read it as padding.`,
      severity: 'medium',
    });
  }
  if (layout?.columns > 1) {
    threats.push({
      id: 't-columns',
      title: `The source layout uses ${layout.columns} columns`,
      detail: 'Multi-column text extraction order is unreliable in many parsers. A single column is safer.',
      severity: 'high',
    });
  }
  if (layout?.tables?.length) {
    threats.push({
      id: 't-tables',
      title: `${layout.tables.length} table${layout.tables.length > 1 ? 's' : ''} used for layout in the source`,
      detail: 'Table-based layouts commonly lose content in older applicant tracking systems.',
      severity: 'medium',
    });
  }
  if (guard && !guard.passed) {
    threats.push({
      id: 't-guard',
      title: `The fact guard blocked ${guard.blocked.length} unsupported item${guard.blocked.length > 1 ? 's' : ''}`,
      detail: 'The rewrite tried to introduce content the source resume does not support. Those edits were removed.',
      severity: 'high',
    });
  }
  if (opt && opt.overall < 45) {
    threats.push({
      id: 't-lowmatch',
      title: `A ${opt.overall}% job match will likely be screened out before a human reads it`,
      detail: opt.verdict,
      severity: 'high',
    });
  }
  if (missing.length >= 10) {
    threats.push({
      id: 't-gapvolume',
      title: `${missing.length} requested keywords are absent in total`,
      detail: 'That volume of gaps usually means the resume is aimed at a different role entirely.',
      severity: missing.length >= 20 ? 'high' : 'medium',
    });
  }

  const quadrants = {
    strengths: top(strengths, 8, 3),
    weaknesses: top(weaknesses, 8, 3),
    opportunities: top(opportunities, 8, 3),
    threats: top(threats, 8, 3),
  };

  return {
    ...quadrants,
    counts: {
      strengths: strengths.length,
      weaknesses: weaknesses.length,
      opportunities: opportunities.length,
      threats: threats.length,
    },
    headline: headlineFor(quadrants, opt, optAts),
    disclaimer:
      'Generated by deterministic local rules from your own resume and the job description. Every item is traceable to parsed content. A gap is a gap: this tool cannot see experience you did not write down, and it will not assume it exists.',
    empty:
      !strengths.length && !weaknesses.length && !opportunities.length && !threats.length,
  };
};

/** Read the years the resume actually claims, without inflating them. */
const yearsShortfall = (resume, requested) => {
  const haystack = [
    resume?.summary || '',
    ...(resume?.experience || []).map((e) => `${e.dates || ''} ${e.company || ''}`),
  ].join(' ');
  const explicit = haystack.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  if (explicit) return Math.min(Number(explicit[1]), requested - 1);
  const span = longestSpanYears(resume);
  if (span && span < requested) return span;
  return null;
};

const longestSpanYears = (resume) => {
  const years = (resume?.experience || [])
    .map((e) => e.dates || '')
    .flatMap((d) => String(d).match(/\b(19|20)\d{2}\b/g) || [])
    .map(Number)
    .filter(Boolean);
  if (years.length < 2) return null;
  return Math.max(...years) - Math.min(...years);
};

const headlineFor = (q, opt, optAts) => {
  if (q.strengths.length && q.threats.length) {
    return `${q.strengths.length} demonstrated strength${q.strengths.length > 1 ? 's' : ''}, ${q.weaknesses.length} gap${q.weaknesses.length === 1 ? '' : 's'} to close and ${q.threats.length} risk${q.threats.length === 1 ? '' : 's'} to handle. Job match ${opt ? `${opt.overall}%` : 'n/a'}${optAts ? `, ATS heuristic ${optAts.overall}%` : ''}.`;
  }
  if (q.strengths.length) return `${q.strengths.length} demonstrated strength${q.strengths.length > 1 ? 's' : ''}. Job match ${opt ? `${opt.overall}%` : 'n/a'}.`;
  return `Job match ${opt ? `${opt.overall}%` : 'n/a'}${optAts ? `, ATS heuristic ${optAts.overall}%` : ''}.`;
};

export { S, W, O, T };
export default buildSwot;
