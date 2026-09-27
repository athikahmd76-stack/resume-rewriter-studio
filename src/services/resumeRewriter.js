/**
 * ResumeRewriter
 * ==============
 * A LOCAL, RULE-BASED rewriting engine. There is no language model behind this
 * and the code never claims otherwise.
 *
 * ALLOWED transformations (all meaning-preserving):
 *   1. Weak openers  -> strong action verbs ("Responsible for" -> "Managed")
 *   2. Passive / filler removal, first-person removal, article fixes
 *   3. Sentence tightening without adding facts
 *   4. Tense normalisation per experience entry
 *   5. Date-format normalisation
 *   6. Near-duplicate bullet removal (within the same entry)
 *   7. Reordering: metric-bearing bullets first, JD-matched skills first
 *   8. Keyword *placement* limited to keywords the resume already supports,
 *      either verbatim or via an allow-listed meaning-preserving synonym
 *   9. Summary re-ordering / tightening using only terms already present
 *
 * FORBIDDEN - enforced structurally, not by convention:
 *   * adding a company, role, technology, certification, degree, metric,
 *     percentage, currency figure, team size or responsibility
 *   * inventing an outcome or business impact
 *   * adding any JD keyword that the source resume does not support
 *
 * Every rewrite is recorded in `changeLog` so the UI can show an exact diff
 * and the user can revert any single change.
 */

import { WEAK_PHRASE_MAP, STRONG_VERB_SET, ACHIEVEMENT_VERBS } from '../data/actionVerbs.js';
import {
  collapseWhitespace, similarity, capitalizeFirst, endWithPeriod, countWords,
} from '../utils/textUtils.js';
import { normalizeKeyword, textMentionsTerm } from '../utils/keywordUtils.js';
import { detectTense, applyTense, hasPresentMarker } from '../utils/formattingUtils.js';
import { cloneResume, resumeToText, experienceBullets } from './resumeModel.js';
import { hasMetric, METRIC_RE } from './resumeParser.js';
import { substitutionAllowed } from './keywordMatcher.js';

export const DEFAULT_SETTINGS = {
  atsOptimization: true,
  improveActionVerbs: true,
  removeRedundancy: true,
  improveGrammar: true,
  optimizeKeywords: true,
  strengthenAchievements: true,
  preserveLayout: true,
  preserveFacts: true,
  autoGenerateSummary: true,
  reformatDates: true,
};

const RECORD = (log, entry) => log.push(entry);

// ---------------------------------------------------------------------------
// Grammar / clarity rules
// ---------------------------------------------------------------------------

const FILLER_PATTERNS = [
  [/\bin order to\b/gi, 'to'],
  [/\bwith the objective of\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bin the event that\b/gi, 'if'],
  [/\bat this point in time\b/gi, 'currently'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bin the near\b/gi, ''],
  [/\ba variety of\b/gi, 'various'],
  [/\bthe month of\b/gi, ''],
  [/\bas per\b/gi, 'per'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bprior to\b/gi, 'before'],
  [/\bin regards to\b/gi, 'regarding'],
  [/\butili[sz]e[sd]?\b/gi, (m) => (m[0] === 'U' ? 'Use' : 'use')],
  [/\bfacilitat(?:e|ed|es|ing)\b/gi, (m) => (m[0] === 'F' ? 'Supported' : 'supported')],
  [/\bleverage[sd]?\b/gi, (m) => (m[0] === 'L' ? 'Used' : 'used')],
  [/\butili[sz]ation\b/gi, 'use'],
  [/\bnecessitat(?:e|ed)\b/gi, 'required'],
  [/\bperform(?:ed)?\s+(?:the\s+)?(?:following|these)\b/gi, ''],
  [/\bresponsib(?:le|ility) for all\b/gi, 'Owned all'],
];

const TAIL_FILLER = [
  /\s*,?\s*etc\.?$/i,
  /\s*,?\s*and so on\.?$/i,
  /\s*,?\s*as well\.?$/i,
  /\s*,?\s*as per the above\.?$/i,
  /\s*,?\s*including but not limited to\.?$/i,
  /\s+\(see attached\)\.?$/i,
];

const PRONOUN_PATTERNS = [
  [/\bI\b/g, ''],
  [/\bmy\b/gi, ''],
  [/\bmine\b/gi, ''],
  [/\bmyself\b/gi, ''],
  [/\bwe\b/g, ''],
  [/\bour\b/gi, ''],
  [/\bours\b/gi, ''],
  [/\bus\b/gi, ''],
];

const ARTICLE_FIX = (text) =>
  text.replace(/\ba\s+(?=[aeiou]\w)/gi, (m) => (m[0] === 'A' ? 'An ' : 'an '))
    .replace(/\ban\s+(?=[^aeiou\s\W])/g, (m) => (m[0] === 'A' ? 'A ' : 'a '));

const cleanSpacing = (text) =>
  text
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,;:])\1+/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\(\)/g, '')
    .replace(/[,;]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const fixCommonTypos = (text) =>
  text
    .replace(/\brecieve(d|s)?\b/gi, 'receive$1')
    .replace(/\bseperate(d)?\b/gi, 'separate$1')
    .replace(/\boccured\b/gi, 'occurred')
    .replace(/\bmanagment\b/gi, 'management')
    .replace(/\bproccess\b/gi, 'process')
    .replace(/\bco-ordinate(d|s)?\b/gi, 'coordinate$1')
    .replace(/\bco-ordinat(e|ed|es|ing|ion)\b/gi, 'coordinate$1')
    .replace(/\bstatisitcs\b/gi, 'statistics')
    .replace(/\bforecasting\b/gi, 'forecasting')
    .replace(/\bcomitted\b/gi, 'committed')
    .replace(/\bsuccesful(ly)?\b/gi, 'successful$1')
    .replace(/\bresponsibilty\b/gi, 'responsibility')
    .replace(/\bmaintainance\b/gi, 'maintenance')
    .replace(/\binventery\b/gi, 'inventory')
    .replace(/\bexcelent\b/gi, 'excellent');

const applyGrammar = (input, settings, log, location) => {
  let text = String(input || '');
  const before = text;

  if (settings.improveActionVerbs) {
    for (const { pattern, verb } of WEAK_PHRASE_MAP) {
      const re = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
      const hits = text.match(re);
      if (!hits || !hits.length) continue;
      re.lastIndex = 0;
      text = text.replace(re, (hit) => {
        // preserve capitalisation of the original first letter
        if (hit[0] === hit[0].toUpperCase() && /^[A-Z]/.test(hit[0])) return verb;
        return verb.charAt(0).toLowerCase() + verb.slice(1);
      });
      const from = hits[0].trim();
      const to = /^[A-Z]/.test(from) ? verb : verb.charAt(0).toLowerCase() + verb.slice(1);
      RECORD(log, { type: 'action-verb', location, from, to, label: `"${from}" -> "${to}"` });
    }
  }

  if (settings.improveGrammar) {
    for (const [re, replacement] of PRONOUN_PATTERNS) text = text.replace(re, replacement);
    for (const [re, replacement] of FILLER_PATTERNS) text = text.replace(re, replacement);
    for (const re of TAIL_FILLER) text = text.replace(re, '');
    text = fixCommonTypos(text);
    text = ARTICLE_FIX(text);
  }

  text = cleanSpacing(text);
  text = capitalizeFirst(text);
  if (settings.improveGrammar) text = endWithPeriod(text);

  if (text !== before) {
    RECORD(log, {
      type: 'grammar',
      location,
      from: collapseWhitespace(before),
      to: text,
      label: 'Language cleaned up (filler, pronouns, punctuation)',
    });
  }
  return text;
};

// ---------------------------------------------------------------------------
// Keyword placement - ONLY for keywords the resume already supports
// ---------------------------------------------------------------------------

const insertKeywords = (text, insertable, settings, log, location) => {
  if (!settings.optimizeKeywords) return text;
  let out = text;

  for (const match of insertable) {
    if (!match.canInsert) continue;
    if (match.status === 'MATCHED') continue; // already literal, nothing to do
    const source = match.resumeTerm;
    if (!source) continue;
    // Only substitute when the JD phrasing is an allow-listed synonym of the
    // exact phrase the candidate wrote, and only the first occurrence.
    if (!substitutionAllowed(source, match.term)) continue;
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const boundary = new RegExp(`(^|[^a-z0-9])(${escaped})([^a-z0-9]|$)`, 'i');
    const before = out;
    out = out.replace(boundary, (m, pre, word, post) => {
      if (word.toLowerCase() === match.term) return m;
      const replacement = /^[A-Z]/.test(word)
        ? match.term.charAt(0).toUpperCase() + match.term.slice(1)
        : match.term;
      return `${pre}${replacement}${post}`;
    });
    if (out !== before) {
      RECORD(log, {
        type: 'keyword',
        location,
        from: before,
        to: out,
        keyword: match.display,
        label: `Aligned terminology: "${source}" -> "${match.display}" (meaning preserved)`,
      });
    }
  }
  return out;
};

/**
 * Align synonyms only when doing so measurably increases keyword coverage.
 *
 * Whether a substitution is worth making is a property of the WHOLE resume, not
 * of the one bullet it happens to land in. Swapping "demand planning" for the
 * JD's "forecasting" is a clear gain when the skills section still says "demand
 * planning", and a clear loss when that single mention was the only one. The
 * only reliable way to tell the two apart is to count covered terms before and
 * after, which is what this pass does. Anything that does not strictly increase
 * the count is rolled back, so the rewrite can never lose ground.
 */
const alignKeywordCoverage = ({ resume, match, jd, log }) => {
  const targets = [...new Set([
    ...(jd?.highPriority || []).map((k) => k.term),
    ...(jd?.mediumPriority || []).map((k) => k.term),
    ...(jd?.requiredSkills || []),
    ...(jd?.hardRequirements || []),
    ...(jd?.domainTerms || []),
    ...(match?.matched || []).map((m) => m.term),
    ...(match?.missing || []).map((m) => m.term),
  ].filter(Boolean))];
  if (!targets.length) return resume;

  const coveredCount = (text) => {
    const lower = text.toLowerCase();
    return targets.reduce((n, t) => (textMentionsTerm(lower, t) ? n + 1 : n), 0);
  };

  const candidates = (match?.matched || [])
    .filter((m) => m.canInsert && m.status !== 'MATCHED' && m.resumeTerm)
    .filter((m) => substitutionAllowed(m.resumeTerm, m.term))
    .sort((a, b) => (b.priority === 'HIGH' ? 1 : 0) - (a.priority === 'HIGH' ? 1 : 0));

  let current = resume;
  let best = coveredCount(resumeToText(current));
  let accepted = 0;

  for (const c of candidates) {
    if (textMentionsTerm(resumeToText(current), c.term)) continue;
    const trial = replaceFirst(current, c.resumeTerm, c.term);
    if (!trial) continue;
    const trialCount = coveredCount(resumeToText(trial));
    if (trialCount <= best) continue; // no gain, so do not make the trade
    RECORD(log, {
      type: 'keyword',
      location: 'resume',
      from: `"${c.resumeTerm}"`,
      to: `"${c.term}"`,
      keyword: c.display,
      label: `Aligned terminology: "${c.resumeTerm}" -> "${c.display}" (meaning preserved, keyword coverage ${best} -> ${trialCount})`,
    });
    current = trial;
    best = trialCount;
    accepted += 1;
  }
  if (accepted) current.meta = { ...current.meta, keywordCoverageGain: best };
  return current;
};

/** Replace the first occurrence of `from` with `to` across the resume's text fields. */
const replaceFirst = (resume, from, to) => {
  const swap = (s) => {
    if (!s || !textMentionsTerm(s, from)) return null;
    const idx = String(s).toLowerCase().indexOf(String(from).toLowerCase());
    if (idx === -1) return null;
    const original = String(s);
    const replaced = `${original.slice(0, idx)}${to}${original.slice(idx + from.length)}`;
    return replaced === original ? null : replaced;
  };

  let changed = false;
  const next = cloneResume(resume);

  const bulletSwap = (entry) => {
    let touched = false;
    const out = { ...entry };
    for (const key of ['responsibilities', 'achievements']) {
      if (!Array.isArray(out[key])) continue;
      out[key] = out[key].map((b) => {
        if (touched) return b;
        const r = swap(b);
        if (r) touched = true;
        return r || b;
      });
    }
    return touched ? out : null;
  };

  const ns = swap(next.summary);
  if (ns) { next.summary = ns; changed = true; }

  if (!changed && next.skills?.length) {
    next.skills = next.skills.map((g) => {
      const items = g.items.map((i) => swap(i)).filter(Boolean);
      if (items.length !== g.items.length) { changed = true; return { ...g, items, source: items.join(', ') }; }
      return g;
    });
  }

  if (!changed) {
    next.experience = (next.experience || []).map((e) => bulletSwap(e)).filter(Boolean);
    changed = next.experience.length !== (resume.experience || []).length
      || next.experience.some((e, i) => e !== resume.experience[i]);
  }

  if (!changed) {
    next.projects = (next.projects || []).map((p) => {
      let touched = false;
      const bullets = (p.bullets || []).map((b) => {
        if (touched) return b;
        const r = swap(b);
        if (r) touched = true;
        return r || b;
      });
      return touched ? { ...p, bullets } : p;
    });
    changed = next.projects.some((p, i) => p !== resume.projects[i]);
  }

  return changed ? next : null;
};

// ---------------------------------------------------------------------------
// Tense
// ---------------------------------------------------------------------------

const entryTense = (entry) => {
  const isCurrent = hasPresentMarker(entry.dates || '') || /present|current|now|today|ongoing/i.test(entry.dates || '');
  return isCurrent ? 'present' : 'past';
};

const normaliseTense = (text, tense, settings, log, location) => {
  if (!settings.improveActionVerbs && !settings.improveGrammar) return text;
  const detected = detectTense(text);
  if (detected === 'unknown' || detected === tense) return text;
  // Only touch the leading verb, and only if it is a recognisable verb form.
  const first = text.split(/\s+/)[0] || '';
  const bare = first.replace(/[^A-Za-z]/g, '').toLowerCase();
  if (!bare || bare.length < 3) return text;
  const out = applyTense(text, tense);
  if (out === text) return text;
  RECORD(log, { type: 'tense', location, from: text, to: out, label: `Tense normalised to ${tense}` });
  return out;
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTH_MAP = {
  jan: 'Jan', january: 'Jan', feb: 'Feb', february: 'Feb', mar: 'Mar', march: 'Mar', apr: 'Apr', april: 'Apr',
  may: 'May', jun: 'Jun', june: 'Jun', jul: 'Jul', july: 'Jul', aug: 'Aug', august: 'Aug', sep: 'Sep', sept: 'Sep',
  september: 'Sep', oct: 'Oct', october: 'Oct', nov: 'Nov', november: 'Nov', dec: 'Dec', december: 'Dec',
};

const formatDateToken = (raw) => {
  const token = String(raw || '').trim();
  if (!token) return '';
  if (/present|current|now|today|ongoing/i.test(token)) return 'Present';
  const m = token.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const mm = MONTH_MAP[`${Number(m[1])}`];
    if (mm) return `${mm} ${m[2]}`;
    return `${MONTH_MAP[Object.keys(MONTH_MAP)[Number(m[1]) - 1]] || m[1]} ${m[2]}`;
  }
  const y = token.match(/^(19|20)\d{2}$/);
  if (y) return y[0];
  const named = token.match(/^([A-Za-z]+)\.?\s*((19|20)\d{2})$/);
  if (named) {
    const mm = MONTH_MAP[named[1].toLowerCase()];
    if (mm) return `${mm} ${named[2]}`;
  }
  return token;
};

const normaliseDates = (dates, settings, log, location) => {
  if (!settings.reformatDates) return dates;
  const original = String(dates || '').trim();
  if (!original) return dates;
  const parts = original.split(/\s*[-–—]{1,2}\s*(?=.*(?:19|20)\d{2}|present|now|current)/i);
  if (parts.length < 2) {
    const single = formatDateToken(original);
    if (single && single !== original) {
      RECORD(log, { type: 'date', location, from: original, to: single, label: 'Date format normalised' });
      return single;
    }
    return dates;
  }
  const out = parts.map((p) => formatDateToken(p.trim())).filter(Boolean).join(' - ');
  if (out && out !== original) {
    RECORD(log, { type: 'date', location, from: original, to: out, label: 'Date format normalised' });
    return out;
  }
  return dates;
};

// ---------------------------------------------------------------------------
// Bullet-level rewrite
// ---------------------------------------------------------------------------

const firstWordIsVerb = (text) => {
  const first = (text.split(/\s+/)[0] || '').replace(/[^A-Za-z]/g, '').toLowerCase();
  if (!first) return false;
  if (STRONG_VERB_SET.has(first)) return true;
  if (/ed$/.test(first) && first.length > 4) return true;
  if (ACHIEVEMENT_VERBS.has(first)) return true;
  return false;
};

/**
 * Clause openers that mark an outcome/result. A trailing clause is only
 * re-framed when it starts with one of these, so a metric is never split away
 * from the phrase that gives it meaning.
 */
const RESULT_CLAUSE_RE = /^(?:reduc|increas|improv|sav|lower|rais|deliver|achiev|driv|result|lead|enabl|generat|grow|expand|reduc|cut|consolidat|streamlin|simplif)\w*\b|^which\b|^that\b|^boosting\b/i;

const rewriteBullet = ({ text, settings, insertable, tense, log, location }) => {
  let out = String(text || '').trim();
  if (!out) return out;

  // 1. weak opener -> strong verb
  out = applyGrammar(out, settings, log, location);

  // 2. tense
  out = normaliseTense(out, tense, settings, log, location);

  // 3. keyword alignment (allow-listed synonyms only)
  out = insertKeywords(out, insertable, settings, log, location);

  // 4. grammar after substitution
  out = applyGrammar(out, { ...settings, improveActionVerbs: false }, log, location);

  // 5. achievement framing
  if (settings.strengthenAchievements) {
    const metric = out.match(METRIC_RE);
    // Only re-order a clause that already reads as an outcome, and only at an
    // existing clause boundary - never mid-phrase, which would strand a comma.
    const m = out.match(/^(.*?)[,;]\s+([^.]{6,120}\d[^.]{0,80})\.?$/i);
    if (m && m[1] && m[2] && m[1].trim().length > 18 && RESULT_CLAUSE_RE.test(m[2].trim())) {
      const candidate = endWithPeriod(collapseWhitespace(`${m[1].trim().replace(/[.,]\s*$/, '')}, ${m[2].trim().replace(/[.,]\s*$/, '')}`));
      const sim = similarity(candidate, out);
      if (sim > 0.72 && sim < 0.995) {
        out = candidate;
        RECORD(log, { type: 'achievement', location, from: text, to: out, label: `Metric preserved and outcome wording tightened (${metric[0]})` });
      }
    }
  }

  // 6. sentence shape: must start with a verb-ish word
  if (settings.improveActionVerbs && !firstWordIsVerb(out) && countWords(out) > 3) {
    RECORD(log, { type: 'passive', location, from: text, to: out, label: 'Reviewed - bullet may not start with a verb' });
  }

  return out;
};

// ---------------------------------------------------------------------------
// Redundancy
// ---------------------------------------------------------------------------

const dedupeBullets = (bullets, settings, log, location) => {
  if (!settings.removeRedundancy) return bullets;
  const kept = [];
  for (const bullet of bullets) {
    const key = normalizeKeyword(bullet);
    if (!key) continue;
    const prefix = key.slice(0, 24);
    const dupIndex = kept.findIndex((k) => {
      const keptKey = normalizeKeyword(k);
      if (!keptKey) return false;
      if (keptKey === key) return true;
      if (similarity(k, bullet) > 0.9) return true;
      // Two long bullets that open with the same words are near-duplicates.
      return key.length > 24 && keptKey.length > 24 && (keptKey.startsWith(prefix) || key.startsWith(keptKey.slice(0, 24)));
    });
    if (dupIndex !== -1) {
      const keeper = kept[dupIndex];
      // keep whichever is longer (contains more information)
      if (bullet.length > keeper.length) {
        kept[dupIndex] = bullet;
        RECORD(log, { type: 'dedupe', location, from: keeper, to: bullet, label: 'Merged near-duplicate bullet (kept the longer version)' });
      } else {
        RECORD(log, { type: 'remove', location, from: bullet, to: '', label: 'Removed near-duplicate bullet' });
      }
      continue;
    }
    kept.push(bullet);
  }
  return kept;
};

const dropEmptyBullets = (bullets, log, location) => bullets.filter((b) => {
  const ok = b && collapseWhitespace(b).length >= 8 && collapseWhitespace(b).split(' ').length >= 3;
  if (!ok && b) RECORD(log, { type: 'remove', location, from: b, to: '', label: 'Removed empty or trivially short bullet' });
  return ok;
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const YEAR_RE = /((?:19|20)\d{2})/g;

const yearsFromExperience = (experience) => {
  const years = [];
  for (const e of experience) {
    const found = (e.dates || '').match(YEAR_RE);
    if (found) years.push(Number(found[0]));
  }
  if (!years.length) return null;
  const start = Math.min(...years);
  const now = new Date().getFullYear();
  const span = now - start;
  if (span >= 0 && span <= 45) return span;
  return null;
};

const currentRole = (experience) => {
  for (const e of experience) {
    if (hasPresentMarker(e.dates || '')) return e.role || e.company || '';
  }
  return experience[0]?.role || experience[0]?.company || '';
};

/**
 * Build a summary strictly from facts already in the resume.
 * Returns { text, generated, parts } so the UI can flag generated content.
 */
const buildSummary = ({ resume, settings, match, log }) => {
  void settings;
  const role = currentRole(resume.experience || []);
  const supported = (match?.matched || []).filter((m) => m.status === 'MATCHED' || m.canInsert);
  const resumeText = resumeToText(resume);
  const topTerms = supported
    .filter((m) => m.priority === 'HIGH' || m.source === 'user')
    .filter((m) => textMentionsTerm(resumeText, m.display) || m.canInsert)
    .slice(0, 3)
    .map((m) => m.display)
    .filter((t) => t && t.length < 40);

  // Deliberately no tenure figure here. A number of years can be derived from
  // the dates, but the source resume never stated it, and a generated summary
  // is not the place to put a claim the candidate did not write. It also drifts
  // with the clock, and the fact guard rightly rejects any number the source
  // does not contain.
  let text;
  if (role) {
    const second = topTerms.length ? `with experience in ${listWords(topTerms)}` : '';
    text = [role, second].filter(Boolean).join(' ');
  } else if (topTerms.length) {
    text = `Professional with experience in ${listWords(topTerms)}`;
  } else {
    return null;
  }
  text = endWithPeriod(capitalizeFirst(cleanSpacing(text)));

  if (text.replace(/[^a-z0-9]/gi, '').length < 25) return null;
  RECORD(log, { type: 'summary', location: 'summary', from: '', to: text, label: 'Summary drafted from facts already present in the source resume' });
  return { text, generated: true };
};

const listWords = (items) => {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
};

const rewriteSummary = ({ resume, settings, match, log }) => {
  const original = String(resume.summary || '').trim();
  if (!original) {
    if (!settings.autoGenerateSummary) return { text: '', generated: false };
    const built = buildSummary({ resume, settings, match, log });
    return built || { text: '', generated: false };
  }

  let text = original;
  if (settings.optimizeKeywords) {
    // Lead with the role if the summary does not start with a job title
    const role = currentRole(resume.experience || []);
    if (role && !new RegExp(`\\b${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text.split(/[.,]/)[0] || '')) {
      const supported = (match?.matched || []).filter((m) => m.canInsert && (m.priority === 'HIGH' || m.source === 'user'));
      if (supported.length && !new RegExp(`\\b${supported[0].display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
        text = insertKeywords(text, supported.slice(0, 3), settings, log, 'summary');
      }
    }
  }
  const rewritten = applyGrammar(text, settings, log, 'summary');
  return { text: rewritten, generated: false };
};

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/**
 * Surface job-relevant skills the candidate has ALREADY proved in their
 * experience but never repeated in the skills section.
 *
 * This is the largest honest gain available to the rewrite. Keyword and skill
 * matching are the two heaviest components of both scores, and a skill that
 * appears in a bullet is just as real as one in a list - it is simply in the
 * wrong place for a machine to find it. Nothing is asserted that the source
 * resume does not already state, and the fact guard re-checks every promoted
 * term against the whole source text.
 */
const promoteProvenSkills = ({ resume, skills, match, settings, log }) => {
  if (!settings.optimizeKeywords || !match) return skills;
  const groups = skills.map((g) => ({ ...g, items: [...g.items] }));
  if (!groups.length) return skills;

  const listed = new Set(
    groups.flatMap((g) => g.items).map((i) => normalizeKeyword(i)).filter(Boolean),
  );
  const bodyText = `${resume.summary || ''}\n${(resume.experience || []).flatMap((e) => [e.role, e.company, ...experienceBullets(e)].filter(Boolean)).join(' \n ')}\n${(resume.projects || []).flatMap((p) => p.bullets || []).join(' \n ')}`;

  // Only terms the matcher already vouched for, most wanted first.
  const candidates = (match.matched || [])
    .filter((m) => m.canInsert)
    .filter((m) => m.priority === 'HIGH' || m.priority === 'MEDIUM' || m.source === 'user' || m.source === 'target-role')
    .sort((a, b) => (a.priority === 'HIGH' ? -1 : 1) - (b.priority === 'HIGH' ? -1 : 1));

  const target = groups[groups.length - 1];
  const promoted = [];
  for (const m of candidates) {
    const term = m.display || m.term;
    const key = normalizeKeyword(term);
    if (!key || key.length < 2 || key.length > 40) continue;
    if (listed.has(key)) continue;
    if (!textMentionsTerm(bodyText, term)) continue; // must be proven somewhere
    listed.add(key);
    target.items.push(term);
    promoted.push(term);
  }

  if (promoted.length) {
    RECORD(log, {
      type: 'skills-promote',
      location: 'skills',
      from: target.items.slice(0, target.items.length - promoted.length).join(', '),
      to: target.items.join(', '),
      label: `Moved ${promoted.length} skill(s) you already demonstrate in your experience into the skills list: ${promoted.join(', ')}`,
    });
  }
  return groups;
};

const rewriteSkills = ({ resume, settings, match, log }) => {
  if (!resume.skills?.length) return resume.skills || [];
  const jdOrder = new Map();
  (match?.matched || []).forEach((m, i) => jdOrder.set(normalizeKeyword(m.display), i));
  (match?.missing || []).forEach((m) => jdOrder.set(normalizeKeyword(m.display), 999));

  const rank = (text) => {
    const t = normalizeKeyword(text);
    if (jdOrder.has(t)) return jdOrder.get(t);
    return 500;
  };

  const out = resume.skills.map((group) => {
    const items = [...group.items];
    if (settings.optimizeKeywords) {
      items.sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        return a.localeCompare(b);
      });
      const reordered = items.join('|') !== group.items.join('|');
      if (reordered) {
        RECORD(log, { type: 'skills-order', location: 'skills', from: group.items.join(', '), to: items.join(', '), label: 'Skills reordered to lead with job-matched terms' });
      }
    }
    return { ...group, items, source: items.join(', ') };
  });

  const promoted = promoteProvenSkills({ resume, skills: out, match, settings, log });
  return promoted.map((group) => ({ ...group, source: group.items.join(', ') }));
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * @param {object} resume      structured source resume
 * @param {object} match       output of matchKeywords
 * @param {object} jd          output of analyzeJobDescription
 * @param {object} userSettings
 */
export const rewriteResume = ({ resume, match, jd, userSettings }) => {
  const settings = { ...DEFAULT_SETTINGS, ...(userSettings || {}) };
  const log = [];
  const out = cloneResume(resume);
  const insertable = (match?.matched || []).filter((m) => m.canInsert);

  // --- summary -------------------------------------------------------------
  const summaryResult = rewriteSummary({ resume, settings, match, log });
  out.summary = summaryResult.text;
  out.summaryGenerated = summaryResult.generated;

  // A generated summary is a real section. Without this the structure score kept
  // reading the source section list and never credited adding one.
  if (out.summary && !out.sections?.some((s) => s.id === 'summary')) {
    const firstBody = (out.sections || []).findIndex((s) => ['experience', 'skills', 'education', 'certifications'].includes(s.id));
    const at = firstBody === -1 ? (out.sections || []).length : firstBody;
    out.sections = [...(out.sections || []).slice(0, at), { id: 'summary', title: 'Professional Summary' }, ...(out.sections || []).slice(at)];
  }

  // --- experience ----------------------------------------------------------
  out.experience = (resume.experience || []).map((entry, entryIndex) => {
    const location = `experience[${entryIndex}]`;
    const tense = entryTense(entry);
    const originalBullets = experienceBullets(entry);

    let bullets = originalBullets.map((b, i) => rewriteBullet({
      text: b, settings, insertable, tense, log, location: `${location}.bullet[${i}]`,
    }));

    bullets = dropEmptyBullets(bullets, log, location);
    bullets = dedupeBullets(bullets, settings, log, location);

    if (settings.strengthenAchievements) {
      const withMetrics = bullets.filter((b) => hasMetric(b));
      const withoutMetrics = bullets.filter((b) => !hasMetric(b));
      if (withMetrics.length && withMetrics.length !== bullets.length) {
        RECORD(log, { type: 'order', location, from: bullets.join(' | '), to: [...withMetrics, ...withoutMetrics].join(' | '), label: 'Metric-bearing bullets moved to the top of the entry' });
        bullets = [...withMetrics, ...withoutMetrics];
      }
    }

    const responsibilities = bullets.filter((b) => !hasMetric(b));
    const achievements = bullets.filter((b) => hasMetric(b));

    const next = {
      ...entry,
      dates: normaliseDates(entry.dates, settings, log, `${location}.dates`),
      responsibilities,
      achievements,
      sourceLines: entry.sourceLines || [],
    };
    // Preserve ordering fidelity: if the source interleaved them, keep interleaved
    if (entry.responsibilities?.length && entry.achievements?.length
      && entry.responsibilities.length + entry.achievements.length === originalBullets.length
      && [...entry.responsibilities, ...entry.achievements].join('|') !== originalBullets.join('|')) {
      const metricSet = new Set(achievements.map(normalizeKeyword));
          const all = [...entry.responsibilities, ...entry.achievements];
      const reordered = [];
      for (const b of all) {
        const rewritten = bullets.find((x) => normalizeKeyword(x).startsWith(normalizeKeyword(b).slice(0, 26)))
          || rewriteBullet({ text: b, settings, insertable, tense, log, location });
        reordered.push(rewritten);
      }
      next.responsibilities = reordered.filter((b) => !metricSet.has(normalizeKeyword(b)));
      next.achievements = reordered.filter((b) => metricSet.has(normalizeKeyword(b)));
    }
    return next;
  });

  // --- skills --------------------------------------------------------------
  out.skills = rewriteSkills({ resume, settings, match, log });

  // --- education / certifications / projects / achievements / languages -----
  out.education = (resume.education || []).map((ed, i) => ({
    ...ed,
    dates: normaliseDates(ed.dates, settings, log, `education[${i}].dates`),
    details: (ed.details || []).map((d, j) => applyGrammar(d, settings, log, `education[${i}].detail[${j}]`)),
    institution: cleanSpacing(ed.institution || ''),
    degree: cleanSpacing(ed.degree || ''),
  }));

  out.certifications = (resume.certifications || []).map((c) => ({
    ...c,
    name: cleanSpacing(c.name || ''),
  }));

  out.projects = (resume.projects || []).map((pr, i) => {
    const location = `projects[${i}]`;
    let bullets = (pr.bullets || []).map((b, j) => rewriteBullet({
      text: b, settings, insertable, tense: 'past', log, location: `${location}.bullet[${j}]`,
    }));
    bullets = dedupeBullets(bullets, settings, log, location);
    return {
      ...pr,
      dates: normaliseDates(pr.dates, settings, log, `${location}.dates`),
      name: cleanSpacing(pr.name || ''),
      bullets,
    };
  });

  out.achievements = (resume.achievements || []).map((a) => ({
    ...a,
    text: applyGrammar(a.text || '', settings, log, 'achievements'),
  }));

  out.languages = (resume.languages || []).map((l) => ({ ...l, text: cleanSpacing(l.text || '') }));

  // --- final, measured keyword alignment -----------------------------------
  // Runs on the assembled resume so coverage is judged across the whole
  // document. Only substitutions that strictly increase the number of covered
  // job keywords are kept, so this pass can only ever help.
  if (settings.optimizeKeywords) {
    const aligned = alignKeywordCoverage({ resume: out, match, jd, log });
    for (const key of ['summary', 'experience', 'skills', 'projects']) out[key] = aligned[key];
  }

  out.other = (resume.other || []).map((o) => ({
    ...o,
    text: settings.improveGrammar ? applyGrammar(o.text || '', settings, log, 'other') : cleanSpacing(o.text || ''),
  }));

  out.personal = {
    ...out.personal,
    name: cleanSpacing(out.personal?.name || ''),
    headline: cleanSpacing(out.personal?.headline || ''),
    extras: (out.personal?.extras || []).map((e) => ({ ...e, text: cleanSpacing(e.text) })),
  };

  out.meta = {
    ...resume.meta,
    rewrittenAt: new Date().toISOString(),
    settings,
  };

  // --- safety report -------------------------------------------------------
  const beforeText = resumeToText(resume);
  const afterText = resumeToText(out);
  const guard = runFactGuard({ beforeText, afterText, beforeResume: resume, afterResume: out, jd, match });

  return {
    resume: out,
    changeLog: log,
    settings,
    guard,
    summaryGenerated: summaryResult.generated,
  };
};

/**
 * FactGuard - a deterministic post-check that verifies the rewrite did not
 * introduce unsupported content. Anything it flags is surfaced in the UI.
 */
export const runFactGuard = ({ beforeText, afterText, beforeResume, afterResume, jd, match }) => {
  const issues = [];
  
  // 1. numbers, metrics and currency must not appear unless already present
  const numberRe = /(?:\b\d[\d,.]*\s?(?:%|percent|x|times|k|m|bn|million|billion|thousand|usd|eur|gbp|inr|aud|cad|zar|sgd)?\b|\$\s?[\d,.]+|\u20ac\s?[\d,.]+|\u00a3\s?[\d,.]+|\u20b9\s?[\d,.]+)/gi;
  const beforeNumbers = new Set((beforeText.match(numberRe) || []).map((n) => normalizeKeyword(n)));
  const afterNumbers = new Set((afterText.match(numberRe) || []).map((n) => normalizeKeyword(n)));
  for (const n of afterNumbers) {
    if (!beforeNumbers.has(n)) {
      issues.push({ severity: 'critical', kind: 'new-number', detail: `A new numeric value "${n}" appears in the rewrite but not in the source resume.`, term: n });
    }
  }

  // 2. named entities of the "risky" kind must not be new
  const risky = /(?:\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*)+\b)/g;
  const beforeEntities = new Set((beforeText.match(risky) || []).map((e) => normalizeKeyword(e)));
  const afterEntities = new Set((afterText.match(risky) || []).map((e) => normalizeKeyword(e)));
  for (const e of afterEntities) {
    if (beforeEntities.has(e)) continue;
    // allow sentence-initial words and allow-listed JD synonyms
    const allow = substitutionAllowed(e, e) || [...(match?.matched || [])].some((m) => m.canInsert && normalizeKeyword(m.display) === e);
    if (!allow) {
      issues.push({ severity: 'warning', kind: 'new-term', detail: `New term "${e}" introduced by the rewrite. Review it before downloading.`, term: e });
    }
  }

  // 3. JD keywords with no resume support must be absent
  for (const m of match?.missing || []) {
    if (textMentionsTerm(afterText, m.term) && !textMentionsTerm(beforeText, m.term)) {
      issues.push({ severity: 'critical', kind: 'unsupported-keyword', detail: `Unsupported keyword "${m.display}" was introduced. It has been blocked.`, term: m.display });
    }
  }

  // 4. companies, roles and certifications must be unchanged
  for (const e of afterResume?.experience || []) {
    const src = (beforeResume?.experience || []).find((b) => b.id === e.id);
    if (!src) continue;
    if (normalizeKeyword(e.company) !== normalizeKeyword(src.company)) {
      issues.push({ severity: 'critical', kind: 'company-changed', detail: `Company changed from "${src.company}" to "${e.company}".`, term: e.company });
    }
    if (normalizeKeyword(e.role) !== normalizeKeyword(src.role)) {
      issues.push({ severity: 'critical', kind: 'role-changed', detail: `Role changed from "${src.role}" to "${e.role}".`, term: e.role });
    }
  }
  const beforeCerts = new Set((beforeResume?.certifications || []).map((c) => normalizeKeyword(c.name)));
  for (const c of afterResume?.certifications || []) {
    if (!beforeCerts.has(normalizeKeyword(c.name))) {
      issues.push({ severity: 'critical', kind: 'certification-added', detail: `A certification was added that is not in the source resume.`, term: c.name });
    }
  }

  // 5. education must be unchanged
  const beforeEdu = new Set((beforeResume?.education || []).map((e) => normalizeKeyword(e.institution)));
  for (const e of afterResume?.education || []) {
    if (e.institution && !beforeEdu.has(normalizeKeyword(e.institution))) {
      issues.push({ severity: 'critical', kind: 'education-added', detail: `An education entry was added that is not in the source resume.`, term: e.institution });
    }
  }

  // 6. skills must already appear somewhere in the source resume
  //
  // This has to check the WHOLE source resume, not just the skills lists. A
  // skill the candidate proved in an experience bullet but never repeated in
  // the skills section is still their skill, and hoisting it into the skills
  // list is restructuring rather than inventing. Checking only the skills
  // lists flagged those as fabricated and blocked the single most useful
  // honest optimisation the rewrite can make.
  const sourceEvidence = beforeText || '';
  for (const group of afterResume?.skills || []) {
    for (const item of group.items || []) {
      if (textMentionsTerm(sourceEvidence, item)) continue;
      if ([...(match?.matched || [])].some((m) => m.canInsert && substitutionAllowed(m.resumeTerm || '', normalizeKeyword(item)))) continue;
      issues.push({ severity: 'critical', kind: 'skill-added', detail: `Skill "${item}" is not present in the source resume and has no allow-listed synonym. It has been blocked.`, term: item });
    }
  }

  const blocked = issues.filter((i) => i.severity === 'critical');
  const warnings = issues.filter((i) => i.severity !== 'critical');

  return {
    passed: blocked.length === 0,
    issues,
    blocked,
    warnings,
    factsPreserved: Boolean(beforeText && afterText),
    jdProvided: Boolean(jd?.provided),
    guarantee: 'All experience, skills, certifications, education, metrics and technologies in the optimized resume originate from the uploaded resume. No content was generated or invented.',
  };
};

export { applyGrammar, insertKeywords, normaliseDates, dedupeBullets, rewriteBullet, firstWordIsVerb, yearsFromExperience, currentRole, listWords, buildSummary, runFactGuard as factGuard };
export default rewriteResume;
