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
  const buckets = { required: [], preferred: [], responsibilities: [], qualifications: [], tools: [], general: [] };
  let mode = 'general';
  for (const raw of lines) {
    const line = collapseWhitespace(raw);
    if (!line) continue;
    const lower = line.toLowerCase();
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
  const parts = text.split(/\s*[,;|/]\s*|\s{2,}|\s+(?:and|or)\s+/i).map((p) => p.trim()).filter(Boolean);
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
  result.title = titleMatch ? collapseWhitespace(titleMatch[1]).replace(/[.,;]$/, '') : '';

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
  const addCandidate = ({ term, count = 1, weight = 1, required = false, preferred = false, fromTool = false }) => {
    const t = normalizeKeyword(term);
    if (!t) return;
    if (t.length < 2 || t.length > 46) return;
    if (NON_KEYWORD_TERMS.has(t)) return;
    if (STOP_WORDS.has(t)) return;
    if (WEAK_ONLY.has(t)) return;
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
  // JD title words are strong signals
  if (result.title) {
    for (const c of extractNgrams(result.title, { maxN: 3, limit: 5 })) {
      addCandidate({ term: c.term, count: c.count, weight: 3.6 });
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

const WEAK_ONLY = new Set(['experience', 'work', 'role', 'team', 'teams', 'job', 'candidate', 'ability', 'knowledge', 'skills', 'skill', 'company', 'business', 'environment', 'level', 'years', 'year', 'strong', 'good', 'great', 'excellent', 'plus', 'must', 'will', 'have', 'including', 'etc', 'new', 'well', 'time', 'day', 'people', 'other', 'good', 'best', 'first', 'like', 'across', 'within', 'using', 'use']);

export default analyzeJobDescription;
