/**
 * JobDescriptionAnalyzer
 *
 * Local, deterministic, rule-based extraction from a pasted job description.
 * Produces required / preferred skills, tools, technologies, responsibilities,
 * qualifications, years of experience, certifications and a prioritised
 * keyword list (HIGH / MEDIUM / LOW).
 *
 * CRITICAL: this engine only *reads* the JD. It never writes anything into the
 * resume. Any JD term that is not already supported by the source resume is
 * reported as MISSING - NOT FOUND IN SOURCE RESUME.
 */

import { extractNgrams, normalizeKeyword, dedupeKeywords, textMentionsTerm } from '../utils/keywordUtils.js';
import { STOP_WORDS, NON_KEYWORD_TERMS } from '../data/stopWords.js';
import { SOFT_SKILL_TERMS, KNOWN_CERTIFICATION_HINTS, getSynonyms } from '../data/synonymDictionary.js';
import { LEADERSHIP_VERBS, ANALYTICAL_VERBS } from '../data/actionVerbs.js';
import { collapseWhitespace, splitLines } from '../utils/textUtils.js';

const PRIORITY = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

/** Section cues that mark a line/block as a requirement vs. a nice-to-have. */
const REQUIRED_CUES = [
  'required', 'requirements', 'must have', 'must-have', 'essential', 'minimum', 'you have', 'we require',
  'you will need', 'need to have', 'required qualifications', 'basic qualification', 'hard requirement',
];
const PREFERRED_CUES = [
  'preferred', 'nice to have', 'nice-to-have', 'desirable', 'bonus', 'plus', 'a plus', 'preferred qualification',
  'good to have', 'favorable', 'favourable', 'ideally', 'advantageous',
];
const RESPONSIBILITY_CUES = [
  'responsibilities', 'what you will do', 'the role', 'your role', 'about the role', 'duties', 'day to day',
  'day-to-day', 'key responsibilities', 'what you\'ll do', 'you will be responsible', 'main responsibilities',
  'role description', 'scope of the role', 'your responsibilities',
];
const QUALIFICATION_CUES = [
  'qualifications', 'requirements', 'what you need', 'we look for', 'profile', 'skills required',
  'desired skills', 'must have', 'minimum qualifications', 'who you are', 'about you',
];
const TOOL_CUES = [
  'tools', 'technologies', 'tech stack', 'software', 'platforms', 'systems', 'technical skills',
  'environment', 'environment', 'erp', 'applications',
];
// Location, salary and contact boilerplate. These lines describe the advert
// rather than the job, and scanning them produced keywords like "manchester
// hybrid" and "analyst - manchester" that no resume can honestly contain.
const NOISE_CUES = [
  'location', 'locations', 'based in', 'based near', 'office', 'salary', 'salaries', 'pay',
  'compensation', 'benefits', 'per annum', 'p.a.', 'pro rata', 'fte', 'contract type',
  'employment type', 'closing date', 'apply now', 'apply by', 'how to apply', 'contact',
  'email', 'phone', 'teleephone', 'website', 'equal opportunities', 'diversity',
];
// Work-model wording, which usually travels with a city name in the same line.
const WORK_MODEL_RE = /\b(hybrid|remote|on-?site|in office|days? (?:in|at) (?:the )?(?:office|site)|commutable|relocation)\b/i;

/** Categorise a keyword into a domain bucket. */
export const categorizeKeyword = (term) => {
  const t = normalizeKeyword(term);
  if (!t) return 'other';
  if (SOFT_SKILL_TERMS.has(t)) return 'soft-skill';
  if (getSynonyms(t).length) return 'domain-skill';
  if (/(microsoft|oracle|sap|salesforce|aws|azure|gcp|tableau|power bi|sql|python|java|javascript|react|node|excel|vba|power automate|sharepoint|hyperion|people soft|workday|quickbooks|navision|atlassian|confluence|jira|shopify|adobe|figma|tableau|looker|qlik|hadoop|spark|kafka|etl|api|rest|sap hana|hana|abap|crm|erp|scm|wms|tms|plm|mes|grc|qms)\b/i.test(t)) return 'technology';
  if (/\b(certified|certification|certificate|license|diploma|mba|phd|bachelor|master|degree|chartered|acca|cpa|cma|cfa|pmp|cscp|cpim|six sigma|lean|apics|citp|shl|cipd)\b/i.test(t)) return 'qualification';
  if (/(supply chain|logistics|procurement|inventory|manufactur|warehouse|distribution|retail|planning|forecast|operations|finance|accounting|audit|compliance|quality|sales|marketing|hr|human resource|recruit|it |information technology|customer service|project management|analytics|engineer)/i.test(t)) return 'domain';
  if (/\b(lead|manage|manage ment|communicat|collaborat|team|problem|analyt|stakeholder|present|negotiat|coach|mentor|prioritis|ownership|adapt)\b/i.test(t)) return 'soft-skill';
  return 'other';
};

const bucketLines = (text) => {
  const lines = splitLines(text);
  const buckets = { required: [], preferred: [], responsibilities: [], qualifications: [], tools: [], general: [], noise: [] };
  let mode = 'general';
  for (const raw of lines) {
    const line = collapseWhitespace(raw);
    if (!line) continue;
    const lower = line.toLowerCase();
    if (NOISE_CUES.some((c) => lower.includes(c)) || WORK_MODEL_RE.test(line)) { buckets.noise.push(line); continue; }
    if (REQUIRED_CUES.some((c) => lower.includes(c))) { mode = 'required'; buckets.required.push(line); continue; }
    if (PREFERRED_CUES.some((c) => lower.includes(c))) { mode = 'preferred'; buckets.preferred.push(line); continue; }
    if (RESPONSIBILITY_CUES.some((c) => lower.includes(c))) { mode = 'responsibilities'; buckets.responsibilities.push(line); continue; }
    if (QUALIFICATION_CUES.some((c) => lower.includes(c))) { mode = 'qualifications'; buckets.qualifications.push(line); continue; }
    if (TOOL_CUES.some((c) => lower.includes(c))) { mode = 'tools'; buckets.tools.push(line); continue; }
    if (/^[•\-*•]/.test(raw.trim()) || /^\(?\d{1,2}[.)]\s/.test(line)) {
      buckets[mode].push(line);
    } else {
      buckets.general.push(line);
    }
  }
  return { buckets, lines };
};

/** Split a requirement line into candidate keyword phrases. */
const candidatesFromLine = (line) => {
  const text = String(line || '')
    .replace(/^[\s•\-*•\u2022\d.)\]]+/, '')
    .replace(/\b(we|you|our|the|will|would|should|must|can|is|are|have|has|with|for|and|or|in|on|of|to|a|an)\b/gi, ' ')
    .replace(/[.;:]+$/, '');
  // A slash only separates clauses when it is spaced. An unspaced slash is part
  // of the term itself, and splitting on it turned "SAP S/4HANA" into the
  // requirements "sap s" and "4hana" - nonsense that then got promoted into the
  // candidate's skills list and reported back as a gap they could not close.
  const parts = text.split(/\s*[,;]\s*|\s+\/\s+|\s{2,}|\s+(?:and|or)\s+/i).map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const grams = extractNgrams(part, { maxN: 3, limit: 6 });
    if (grams.length) {
      // prefer the longest high-frequency gram from this part
      const best = grams.slice().sort((a, b) => b.term.length - a.term.length || b.count - a.count)[0];
      out.push({ term: best.term, count: best.count, source: part });
    }
  }
  return out;
};

const extractYears = (text) => {
  const out = [];
  const patterns = [
    /(\d{1,2})\s*\+?\s*years?(?:\s+of)?\s+(?:relevant\s+|proven\s+|hands[- ]on\s+|professional\s+)?experience/gi,
    /(?:minimum|at least|over|more than)\s*(\d{1,2})\s+years?/gi,
    /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*years?/gi,
    /(\d{1,2})\s*\+?\s*years?[^.]{0,40}(?:in|of|with)\s+([a-z ]{3,40})/gi,
  ];
  const seen = new Set();
  for (const re of patterns) {
    let m = re.exec(text);
    while (m) {
      const years = re.global && /[-–]/.test(m[0]) && m[2] && /^\d+$/.test(m[2])
        ? Math.min(Number(m[1]), Number(m[2]))
        : Number(m[1]);
      const context = (m[2] && !/^\d+$/.test(m[2]) ? ` in ${m[2].trim()}` : '') || '';
      const key = `${years}${context.toLowerCase()}`;
      if (Number.isFinite(years) && years > 0 && years <= 45 && !seen.has(key)) {
        seen.add(key);
        out.push({ years, context: context.trim(), phrase: collapseWhitespace(m[0]) });
      }
      m = re.exec(text);
    }
  }
  return out.sort((a, b) => b.years - a.years);
};

const extractCertifications = (text) => {
  const out = [];
  const lower = text.toLowerCase();
  for (const [needle, label] of KNOWN_CERTIFICATION_HINTS) {
    if (lower.includes(needle)) out.push({ term: label, matched: needle });
  }
  const explicit = text.match(/\b([A-Z]{2,6})\s+(?:certification|certified)\b/g);
  if (explicit) for (const e of explicit) out.push({ term: e.trim(), matched: e.toLowerCase() });
  return dedupeKeywords(out.map((o) => o.term)).map((term) => ({ term }));
};

const extractActionVerbs = (buckets) => {
  const verbs = new Set();
  const scan = [...buckets.responsibilities, ...buckets.required, ...buckets.preferred, ...buckets.general];
  for (const line of scan) {
    for (const w of line.replace(/[^A-Za-z ]/g, ' ').split(/\s+/)) {
      const lower = w.toLowerCase();
      if (LEADERSHIP_VERBS.has(lower) || ANALYTICAL_VERBS.has(lower)) verbs.add(lower);
    }
  }
  return [...verbs].sort();
};

const extractIndustries = (buckets) => {
  const out = new Set();
  const text = buckets.join(' ').toLowerCase();
  const industries = [
    'supply chain', 'logistics', 'manufacturing', 'retail', 'e-commerce', 'ecommerce', 'pharmaceutical',
    'automotive', 'aerospace', 'food and beverage', 'fmcg', 'fashion', 'healthcare', 'hospitality',
    'construction', 'energy', 'oil and gas', 'banking', 'financial services', 'fintech', 'insurance',
    'telecommunications', 'technology', 'software', 'it services', 'consulting', 'public sector',
    'non-profit', 'education', 'media', 'automotive', 'electronics', 'chemical', 'steel', 'mining',
  ];
  for (const i of industries) if (text.includes(i)) out.add(i);
  return [...out].sort();
};

const extractSoftSkills = (buckets) => {
  const text = buckets.join(' \n ').toLowerCase();
  const out = [];
  for (const term of SOFT_SKILL_TERMS) {
    if (textMentionsTerm(text, term)) out.push(term);
  }
  // common soft-skill phrasing not in the dictionary
  const extras = ['self-starter', 'self starter', 'detail oriented', 'results driven', 'results-oriented',
    'team player', 'go-getter', 'fast paced', 'fast-paced', 'client facing', 'client-facing', 'cross functional', 'cross-functional'];
  for (const e of extras) if (textMentionsTerm(text, e)) out.push(e);
  return dedupeKeywords(out);
};

/**
 * @param {string} jobDescription
 * @param {{targetRole?:string, userKeywords?:string[]}} context
 */
export const analyzeJobDescription = (jobDescription, context = {}) => {
  const text = String(jobDescription || '').trim();
  const result = {
    provided: Boolean(text),
    length: text.length,
    title: '',
    targetRole: context.targetRole || '',
    yearsOfExperience: [],
    requiredSkills: [],
    preferredSkills: [],
    tools: [],
    technologies: [],
    responsibilities: [],
    qualifications: [],
    certifications: [],
    softSkills: [],
    industries: [],
    actionVerbs: [],
    keywords: [],
    highPriority: [],
    mediumPriority: [],
    lowPriority: [],
    hardRequirements: [],
    domainTerms: [],
    sections: [],
    summary: '',
  };

  if (!text) return result;

  // --- job title ------------------------------------------------------------
  const titleMatch = text.match(/(?:job title|position|role|title)\s*[:-]\s*(.{2,80})/i)
    || text.match(/^\s*([A-Z][^\n]{4,70})\s*$/m);
  // Keep only the role itself. Advert headings routinely trail a location and a
  // work model ("Supply Chain Analyst - Manchester (Hybrid)"), and every word
  // in the title is treated as a strong keyword, so leaving the tail in
  // produced requirements like "manchester hybrid" that no resume can meet.
  result.title = titleMatch
    ? collapseWhitespace(String(titleMatch[1]).split(/\s+[-–—|]\s+|\s*[-(]/)[0]).replace(/[.,;]$/, '').trim()
    : '';

  const { buckets, lines } = bucketLines(text);
  result.sections = Object.entries(buckets)
    .filter(([, v]) => v.length)
    .map(([k, v]) => ({ id: k, lineCount: v.length }));

  // --- years of experience --------------------------------------------------
  result.yearsOfExperience = extractYears(text);

  // --- certifications -------------------------------------------------------
  result.certifications = extractCertifications(text);

  // --- keyword candidates ---------------------------------------------------
  const scored = new Map();
  const titleParts = normalizeKeyword(result.title || '').split(' ').filter(Boolean);
  // Only a compound role title breaks into meaningless fragments: "Supply Chain
  // Analyst" contributed "supply", "chain" and "analyst" as requirements of their
  // own, none of which a resume can answer. A two-word title is a plain
  // job-family pair and both halves are usually meaningful on their own, so
  // "Data Analyst" still has to offer "data" as a keyword.
  const titleWords = titleParts.length > 2 ? new Set(titleParts) : new Set();
  const addCandidate = ({ term, count = 1, weight = 1, required = false, preferred = false, fromTool = false }) => {
    const raw = normalizeKeyword(term);
    if (!raw) return;
    // Trim the filler off the ends before anything else, so the stored keyword
    // is the thing a candidate would actually write on their resume.
    const t = trimPhraseFiller(raw);
    if (!t) return;
    if (t.length < 2 || t.length > 46) return;
    if (NON_KEYWORD_TERMS.has(t)) return;
    if (STOP_WORDS.has(t)) return;
    if (WEAK_ONLY.has(t)) return;
    if (isNoiseTerm(t)) return;
    // The role phrase is already a requirement on its own, so the loose words it
    // is built from ("Supply Chain Analyst" -> "supply", "chain", "analyst") only
    // pad the gap list with things no resume could answer on their own.
    if (!t.includes(' ') && titleWords.has(t)) return;
    const entry = scored.get(t) || {
      term: t, count: 0, weight: 0, required: false, preferred: false, tool: false,
      category: categorizeKeyword(t),
    };
    entry.count += count;
    entry.weight += weight;
    entry.required = entry.required || required;
    entry.preferred = entry.preferred || preferred;
    entry.tool = entry.tool || fromTool;
    scored.set(t, entry);
  };

  for (const line of buckets.required) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 4, required: true });
  }
  for (const line of buckets.preferred) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 2.4, preferred: true });
  }
  for (const line of buckets.qualifications) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 3 });
  }
  for (const line of buckets.tools) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 3.4, fromTool: true });
  }
  for (const line of buckets.responsibilities) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 2.2 });
  }
  for (const line of buckets.general) {
    for (const c of candidatesFromLine(line)) addCandidate({ ...c, weight: 1.4 });
  }
  // JD title words are strong signals. A readable role phrase counts as one
  // requirement, because its fragments are not skills: "Supply Chain Analyst"
  // used to contribute "supply", "analyst" and "chain analyst" separately, none
  // of which any resume can evidence on its own. A heading that has swallowed
  // the whole advert is not a phrase, so that case falls back to n-grams.
  if (result.title) {
    if (titleParts.length && titleParts.length <= 4) {
      const t = normalizeKeyword(result.title);
      if (t && !isNoiseTerm(t)) addCandidate({ term: t, count: 1, weight: 3.6 });
    } else {
      for (const c of extractNgrams(result.title, { maxN: 3, limit: 5 })) {
        addCandidate({ term: c.term, count: c.count, weight: 3.6 });
      }
    }
  }
  for (const cert of result.certifications) {
    addCandidate({ term: cert.term, count: 1, weight: 3.2, required: true });
  }
  for (const soft of extractSoftSkills(Object.values(buckets))) {
    addCandidate({ term: soft, count: 1, weight: 1.6, preferred: true });
  }
  for (const userKw of context.userKeywords || []) {
    addCandidate({ term: userKw, count: 1, weight: 5, required: true });
  }

  // --- strip filler glued onto the front and back of a phrase ---------------
  // The n-gram pass legitimately produces things like "build sql dashboards",
  // "excellent stakeholder management" and "capability pivot tables". Those
  // phrases never match a real resume because the candidate never writes the
  // filler, so a genuine keyword like "sql" gets reported as missing even when
  // the resume says it. Registering the trimmed core as well keeps the phrase
  // available for context while making the real keyword matchable.
  for (const k of [...scored.values()]) {
    if (!k.term.includes(' ')) continue;
    const core = trimPhraseFiller(k.term);
    if (core !== k.term && core.length >= 2) {
      addCandidate({ term: core, count: 1, weight: k.weight * 0.9, required: k.required, preferred: k.preferred, fromTool: k.tool });
    }
  }

  // --- priority assignment (deterministic) ---------------------------------
  const keywords = [...scored.values()].map((k) => {
    const dictBonus = getSynonyms(k.term).length ? 1.5 : 0;
    const categoryBonus = ['technology', 'domain-skill', 'qualification'].includes(k.category) ? 1.1 : 0;
    const score = k.weight + k.count * 0.55 + dictBonus + categoryBonus;
    let priority = PRIORITY.LOW;
    if (k.required && score >= 5.5) priority = PRIORITY.HIGH;
    else if (score >= 5.2) priority = PRIORITY.HIGH;
    else if (score >= 2.9) priority = PRIORITY.MEDIUM;
    return { ...k, score: Number(score.toFixed(2)), priority };
  });

  keywords.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

  result.keywords = keywords.slice(0, 90);
  result.highPriority = result.keywords.filter((k) => k.priority === PRIORITY.HIGH);
  result.mediumPriority = result.keywords.filter((k) => k.priority === PRIORITY.MEDIUM);
  result.lowPriority = result.keywords.filter((k) => k.priority === PRIORITY.LOW);
  result.hardRequirements = result.keywords.filter((k) => k.required).map((k) => k.term);
  result.requiredSkills = result.keywords.filter((k) => k.required && k.category !== 'soft-skill').map((k) => k.term);
  result.preferredSkills = result.keywords.filter((k) => k.preferred || (k.priority === PRIORITY.MEDIUM && !k.required)).map((k) => k.term);
  result.tools = result.keywords.filter((k) => k.tool || k.category === 'technology').map((k) => k.term);
  result.technologies = result.keywords.filter((k) => k.category === 'technology' || k.category === 'domain-skill').map((k) => k.term);
  result.domainTerms = result.keywords.filter((k) => k.category === 'domain' || k.category === 'domain-skill').map((k) => k.term);
  result.softSkills = extractSoftSkills(Object.values(buckets));
  result.industries = extractIndustries([...buckets.required, ...buckets.responsibilities, ...buckets.qualifications, ...buckets.general]);
  result.actionVerbs = extractActionVerbs(buckets);
  result.qualifications = lines.filter((l) => QUALIFICATION_CUES.some((c) => l.toLowerCase().includes(c))).slice(0, 12);
  result.responsibilities = buckets.responsibilities.slice(0, 24);

  const years = result.yearsOfExperience[0]?.years || null;
  result.summary = `${result.keywords.length} keywords identified${years ? `, ${years}+ years of experience requested` : ''}. ${result.highPriority.length} high priority terms.`;

  return result;
};

const WEAK_ONLY = new Set(['experience', 'work', 'role', 'team', 'teams', 'job', 'candidate', 'ability', 'knowledge', 'skills', 'skill', 'company', 'business', 'environment', 'level', 'years', 'year', 'strong', 'good', 'great', 'excellent', 'plus', 'must', 'will', 'have', 'including', 'etc', 'new', 'well', 'time', 'day', 'people', 'other', 'good', 'best', 'first', 'like', 'across', 'within', 'using', 'use', 'hiring', 'hire', 'building', 'build', 'creating', 'create', 'working', 'work', 'helping', 'help', 'knowledge', 'familiarity', 'familiar', 'exposure', 'excellent', 'highly', 'desirable', 'capability', 'capabilities', 'demonstrated', 'proven', 'solid', 'proven', 'preferred', 'ideally', 'ideally', ' ideally']);

// Words that qualify a keyword without being part of it. Trimmed from the ends
// of an extracted phrase so the real term underneath becomes matchable.
const PHRASE_FILLER = new Set([
  'build', 'building', 'built', 'create', 'creating', 'develop', 'developing',
  'design', 'designing', 'maintain', 'maintaining', 'manage', 'managing', 'work', 'working',
  'works', 'use', 'using', 'used', 'apply', 'applying', 'strong', 'strongly',
  'excellent', 'extensive', 'deep', 'solid', 'proven', 'demonstrated', 'exposure',
  'familiar', 'familiarity', 'knowledge', 'understanding', 'capability', 'capabilities',
  'experience', 'experienced', 'expert', 'expertise', 'skilled', 'skill', 'skills',
  'ability', 'able', 'highly', 'desirable', 'preferred', 'ideally', 'must', 'will',
  'have', 'has', 'including', 'include', 'includes', 'such', 'other', 'others', 'plus',
  'across', 'within', 'from', 'with', 'for', 'and', 'the', 'a', 'an', 'of', 'to', 'in',
  'on', 'at', 'hiring', 'hire', 'looking', 'seeking', 'join', 'help', 'helping',
  'supporting', 'support', 'driving', 'drive', 'delivering', 'deliver', 'leading', 'lead',
  'automate', 'automating', 'utilise', 'utilize', 'utilising', 'utilizing',
  'run', 'running', 'improve', 'improving', 'improve', 'strengthen', 'strengthening',
  'partner', 'partners', 'closely', 'repetitive', 'routine', 'regular', 'weekly',
  'daily', 'monthly', 'annual', 'ongoing', 'various', 'multiple', 'several',
]);

// Ad verbs and layout words that are never skills. Anything in here is dropped
// even when the extractor produced it as a standalone term.
const AD_NOISE = new Set([
  'desirable', 'hybrid', 'network', 'exposure', 'capability', 'capabilities', 'excellent',
  'highly', 'competitive', 'package', 'remuneration', 'essential', 'crucial', 'key',
  'successful', 'successful', 'proven', 'track', 'record', 'background', 'knowledge',
  'familiarity', 'understanding', 'expertise', 'opportunity', 'opportunities', 'candidate',
  'candidates', 'applicant', 'applicants', 'benefits', 'salary', 'location', 'office',
  'remotes', 'remote', 'hybrid', 'onsite', 'fulltime', 'parttime', 'permanent', 'contract',
  'temporary', 'immediate', 'soon', 'negotiable', 'depending', 'depending', 'plus',
  'closely', 'partners', 'reporting', 'reporting', 'tasks', 'someone', 'somebody',
  'team', 'teams',
]);

/** Remove filler words from the front and back of a multi-word phrase. */
const trimPhraseFiller = (term) => {
  const parts = term.split(' ').filter(Boolean);
  while (parts.length > 1 && PHRASE_FILLER.has(parts[0])) parts.shift();
  while (parts.length > 1 && PHRASE_FILLER.has(parts[parts.length - 1])) parts.pop();
  return parts.join(' ');
};

/**
 * Reject extracted terms that no resume could honestly contain, or that are not
 * skills at all. These were being reported to the user as "missing keywords",
 * which made the gap list look long and unreachable and held the keyword score
 * down for reasons that had nothing to do with the candidate.
 */
const isNoiseTerm = (t) => {
  // A dangling dash means the n-gram straddled two list items: "analyst - manchester".
  if (t.includes(' - ') || /-$/.test(t) || /^-/.test(t)) return true;
  // More than four words is a sentence fragment, not a skill.
  if (t.split(' ').length > 4) return true;
  // A phrase carrying a number is a fact from the advert ("40+ stores"). A bare
  // token starting with a digit is fine: "4hana" is SAP S/4HANA.
  if (t.includes(' ') && /\d/.test(t)) return true;
  // A single word that is only filler ("experience", "skills", "automate") is a
  // qualifier the advert used to dress up a real term, not a requirement.
  const words = t.split(' ');
  if (words.length === 1 && PHRASE_FILLER.has(words[0])) return true;
  if (words.length && words.every((w) => AD_NOISE.has(w))) return true;
  return false;
};

export default analyzeJobDescription;
