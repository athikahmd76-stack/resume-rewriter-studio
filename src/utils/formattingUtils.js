/** Formatting utilities: bullets, dates, emphasis and layout style definitions. */

export const BULLET_STYLES = {
  dot: '\u2022',
  disc: '\u25CF',
  square: '\u25AA',
  dash: '\u2013',
  arrow: '\u2192',
  none: '',
};

export const BULLET_STYLE_OPTIONS = [
  { id: 'dot', label: 'Filled dot', char: '\u2022' },
  { id: 'disc', label: 'Small disc', char: '\u25CF' },
  { id: 'square', label: 'Square', char: '\u25AA' },
  { id: 'dash', label: 'Dash', char: '\u2013' },
  { id: 'arrow', label: 'Arrow', char: '\u2192' },
  { id: 'none', label: 'Plain text', char: '' },
];

export const getBulletChar = (style) =>
  Object.prototype.hasOwnProperty.call(BULLET_STYLES, style) ? BULLET_STYLES[style] : BULLET_STYLES.dot;

export const detectBulletStyle = (text) => {
  const sample = String(text || '').slice(0, 20000);
  const counts = { '\u2022': 0, '\u25CF': 0, '\u25AA': 0, '\u2013': 0, '\u2192': 0 };
  for (const ch of Object.keys(counts)) {
    counts[ch] = sample.split(ch).length - 1;
  }
  // dash is very common in date ranges - only accept if there are many and no dot bullets
  if (counts['\u2022'] > 0 || counts['\u25CF'] > 0 || counts['\u25AA'] > 0) {
    return counts['\u25CF'] > counts['\u25AA'] && counts['\u25CF'] >= counts['\u2022'] ? 'disc' : (counts['\u25AA'] > counts['\u2022'] ? 'square' : 'dot');
  }
  if (counts['\u2013'] > 12) return 'dash';
  return 'dot';
};

const MONTHS = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)';
const YEAR = '(19|20)\\d{2}';

export const DATE_PATTERNS = {
  rangeMonths: new RegExp(`\\b${MONTHS}\\.?\\s*${YEAR}\\s*[-–—]{1,2}\\s*(present|current|now|${MONTHS}\\.?\\s*${YEAR}|${YEAR})\\b`, 'i'),
  rangeYears: new RegExp(`\\b${YEAR}\\s*[-–—]{1,2}\\s*(present|current|now|${YEAR})\\b`, 'i'),
  singleDate: new RegExp(`\\b${MONTHS}\\.?\\s*${YEAR}\\b|\\b${YEAR}\\b`, 'i'),
  toPresent: /\b(present|current|presently|now|today|to date|ongoing)\b/i,
};

/** Extract a date/date-range string from a line, if present. */
export const extractDateString = (line) => {
  const text = String(line || '');
  const m1 = text.match(DATE_PATTERNS.rangeMonths);
  if (m1) return m1[0].replace(/\s+/g, ' ').trim();
  const m2 = text.match(DATE_PATTERNS.rangeYears);
  if (m2) return m2[0].replace(/\s+/g, ' ').trim();
  const m3 = text.match(DATE_PATTERNS.singleDate);
  if (m3) return m3[0].replace(/\s+/g, ' ').trim();
  return '';
};

export const hasPresentMarker = (line) => DATE_PATTERNS.toPresent.test(String(line || ''));

/** Heuristic tense detection for a single bullet. */
export const detectTense = (text) => {
  const t = String(text || '');
  const past = (t.match(/\b\w+ed\b/g) || []).length;
  const knownPast = ['led', 'built', 'ran', 'drove', 'sold', 'wrote', 'designed', 'created', 'launched', 'reduced', 'saved', 'grew', 'won', 'sent', 'made', 'held', 'kept', 'brought', 'taught', 'bought', 'sought', 'found', 'delivered', 'achieved', 'established', 'implemented', 'managed', 'developed', 'improved', 'increased', 'owned', 'spearheaded', 'orchestrated', 'mobilized', 'standardized', 'streamlined', 'redesigned', 'forecasted', 'benchmarked', 'quantified', 'reorganized', 'restructured'];
  const pastHits = knownPast.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(t)).length;
  const present = (t.match(/\b(manage|maintain|deliver|develop|lead|oversee|coordinate|support|handle|prepare|monitor|review|ensure|analyze|own|drive|build|create|design|establish|implement|operate|perform|run|use|update|verify|plan|forecast|optimiz|standardiz|streamlin)\\w*\\b/gi) || []).length;
  const scorePast = past + pastHits;
  if (scorePast > present) return 'past';
  if (present > scorePast) return 'present';
  return 'unknown';
};

const TENSE_OVERRIDES = {
  past: {
    manage: 'Managed', maintain: 'Maintained', deliver: 'Delivered', develop: 'Developed',
    lead: 'Led', oversee: 'Oversaw', coordinate: 'Coordinated', support: 'Supported',
    handle: 'Managed', prepare: 'Prepared', monitor: 'Monitored', review: 'Reviewed',
    ensure: 'Ensured', analyze: 'Analyzed', analyse: 'Analyzed', own: 'Owned', drive: 'Drove',
    build: 'Built', create: 'Created', design: 'Designed', establish: 'Established',
    implement: 'Implemented', operate: 'Operated', perform: 'Performed', run: 'Ran', use: 'Used',
    update: 'Updated', verify: 'Verified', plan: 'Planned', forecast: 'Forecasted',
    optimize: 'Optimized', optimise: 'Optimized', standardize: 'Standardized',
    standardise: 'Standardized', streamline: 'Streamlined', report: 'Reported',
    partner: 'Partnered', collaborate: 'Collaborated', negotiate: 'Negotiated', train: 'Trained',
    mentor: 'Mentored', present: 'Presented', document: 'Documented', track: 'Tracked',
    evaluate: 'Evaluated', assess: 'Assessed', identify: 'Identified', improve: 'Improved',
    increase: 'Increased', reduce: 'Reduced', save: 'Saved', grow: 'Grew', cut: 'Cut',
    resolve: 'Resolved', manage_: 'Managed',
  },
  present: {
    manage: 'Manage', maintain: 'Maintain', deliver: 'Deliver', develop: 'Develop',
    lead: 'Lead', oversee: 'Oversee', coordinate: 'Coordinate', support: 'Support',
    handle: 'Manage', prepare: 'Prepare', monitor: 'Monitor', review: 'Review',
    ensure: 'Ensure', analyze: 'Analyze', analyse: 'Analyze', own: 'Own', drive: 'Drive',
    build: 'Build', create: 'Create', design: 'Design', establish: 'Establish',
    implement: 'Implement', operate: 'Operate', perform: 'Perform', run: 'Run', use: 'Use',
    update: 'Update', verify: 'Verify', plan: 'Plan', forecast: 'Forecast',
    optimize: 'Optimize', optimise: 'Optimize', standardize: 'Standardize',
    standardise: 'Standardize', streamline: 'Streamline', report: 'Report',
    partner: 'Partner', collaborate: 'Collaborate', negotiate: 'Negotiate', train: 'Train',
    mentor: 'Mentor', present: 'Present', document: 'Document', track: 'Track',
    evaluate: 'Evaluate', assess: 'Assess', identify: 'Identify', improve: 'Improve',
    increase: 'Increase', reduce: 'Reduce', save: 'Save', grow: 'Grow', cut: 'Cut',
    resolve: 'Resolve',
  },
};

/** Apply a consistent tense to the leading verb of a bullet. */
export const applyTense = (text, tense) => {
  if (tense === 'unknown' || !text) return text;
  const table = TENSE_OVERRIDES[tense];
  if (!table) return text;
  return text.replace(/\b([a-zA-Z]+)\b/, (match, word) => {
    const lower = word.toLowerCase();
    const replacement = table[lower];
    if (!replacement) return match;
    if (match[0] === match[0].toUpperCase()) return replacement;
    return replacement.charAt(0).toLowerCase() + replacement.slice(1);
  });
};

/** Split "Company | Role | Location | Jan 2020 - Present" style header lines. */
export const splitHeaderSegments = (line) =>
  String(line || '')
    .split(/\s*[|•·]\s*|\s{3,}/g)
    .map((s) => s.trim())
    .filter(Boolean);

export const BUILTIN_STYLES = {
  minimal: {
    id: 'minimal',
    name: 'Professional Minimal',
    description: 'Clean single column, generous whitespace, ATS safest.',
    fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    headingFont: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    baseFontSize: 10.4,
    lineHeight: 1.42,
    headingWeight: 700,
    headingSize: 11.4,
    nameSize: 23,
    letterSpacing: 0,
    textColor: '#111827',
    headingColor: '#111827',
    accentColor: '#111827',
    ruleColor: '#d1d5db',
    marginTop: 20,
    marginRight: 54,
    marginBottom: 20,
    marginLeft: 54,
    sectionGap: 13,
    entryGap: 11,
    bulletStyle: 'dot',
    upperCaseHeadings: true,
  },
  corporate: {
    id: 'corporate',
    name: 'Modern Corporate',
    description: 'Accent heading rules and a left-aligned name block with contact strip.',
    fontFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    headingFont: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    baseFontSize: 10.2,
    lineHeight: 1.4,
    headingWeight: 700,
    headingSize: 11.2,
    nameSize: 22,
    letterSpacing: 0.6,
    textColor: '#1f2937',
    headingColor: '#0f3d5e',
    accentColor: '#0f3d5e',
    ruleColor: '#0f3d5e',
    marginTop: 46,
    marginRight: 52,
    marginBottom: 40,
    marginLeft: 52,
    sectionGap: 13,
    entryGap: 11,
    bulletStyle: 'dot',
    upperCaseHeadings: true,
  },
  executive: {
    id: 'executive',
    name: 'Executive Clean',
    description: 'Serif headings, tighter rhythm, restrained rules.',
    fontFamily: "'Georgia', 'Times New Roman', 'Iowan Old Style', serif",
    headingFont: "'Georgia', 'Times New Roman', serif",
    baseFontSize: 10.5,
    lineHeight: 1.46,
    headingWeight: 700,
    headingSize: 11.6,
    nameSize: 24,
    letterSpacing: 0.2,
    textColor: '#1c1917',
    headingColor: '#1c1917',
    accentColor: '#1c1917',
    ruleColor: '#a8a29e',
    marginTop: 50,
    marginRight: 58,
    marginBottom: 42,
    marginLeft: 58,
    sectionGap: 14,
    entryGap: 12,
    bulletStyle: 'dash',
    upperCaseHeadings: true,
  },
};

export const STYLE_LIST = Object.values(BUILTIN_STYLES);

/** A4 = 210mm x 297mm -> 794 x 1123 px at 96dpi. */
export const A4 = { widthPx: 794, heightPx: 1123, widthMm: 210, heightMm: 297, ratio: 297 / 210 };

export const mmToPx = (mm) => (Number(mm) * 96) / 25.4;
export const pxToMm = (px) => (Number(px) * 25.4) / 96;

export default {
  BULLET_STYLES,
  BULLET_STYLE_OPTIONS,
  getBulletChar,
  detectBulletStyle,
  extractDateString,
  hasPresentMarker,
  detectTense,
  applyTense,
  splitHeaderSegments,
  BUILTIN_STYLES,
  STYLE_LIST,
  A4,
  mmToPx,
  pxToMm,
};
