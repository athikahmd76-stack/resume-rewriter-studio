/** Empty/clone/normalise helpers for the structured resume model. */

export const emptyPersonal = () => ({
  name: '',
  headline: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  portfolio: '',
  website: '',
  extras: [],
});

export const emptyExperienceEntry = () => ({
  id: `exp-${Math.random().toString(36).slice(2, 10)}`,
  company: '',
  role: '',
  location: '',
  dates: '',
  responsibilities: [],
  achievements: [],
  notes: '',
  sourceLines: [],
});

export const createEmptyResume = () => ({
  personal: emptyPersonal(),
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  achievements: [],
  languages: [],
  other: [],
  sections: [],
  meta: {
    sourceKind: null,
    sourceFile: '',
    parsedAt: null,
    originalText: '',
  },
});

const deepClone = (value) => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through to JSON clone */
    }
  }
  return JSON.parse(JSON.stringify(value));
};

export const cloneResume = (resume) => deepClone(resume);

/** Rebuild a fresh id for a new entry. */
export const newId = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Flatten a resume to a single searchable string (used by keyword matching). */
export const resumeToText = (resume) => {
  if (!resume) return '';
  const p = resume.personal || {};
  const parts = [
    p.name, p.headline, p.email, p.phone, p.location, p.linkedin, p.portfolio, p.website,
    ...(p.extras || []).map((x) => (x && typeof x === 'object' ? x.text : x)),
    resume.summary,
  ];
  for (const e of resume.experience || []) {
    parts.push(e.role, e.company, e.location, e.dates, e.notes);
    parts.push(...(e.responsibilities || []), ...(e.achievements || []));
  }
  // `parts` holds the raw line the parser read, and for education and
  // certifications that line already contains the institution/degree/dates text
  // also held in the structured fields. Pushing both made every entry count
  // twice, so a keyword written once in a degree scored as mentioned twice and
  // the flat text read as if the entry were repeated.
  for (const ed of resume.education || []) {
    parts.push(...(ed.parts || []), ed.institution, ed.degree, ed.dates, ed.details);
  }
  parts.push(...(resume.skills || []).flatMap((s) => (s.items ? [s.label, ...s.items] : [s])));
  for (const c of resume.certifications || []) parts.push(...(c.parts || []), c.name, c.issuer, c.year, c.detail);
  for (const pr of resume.projects || []) parts.push(pr.name, pr.role, pr.dates, pr.detail, ...(pr.bullets || []));
  // These three sections are stored as { text, parts }. The rewriter edits
  // `text` and the DOCX/PDF exporters render `text`, so the scorer has to read
  // `text` too. Reading `parts` here meant a rewritten achievement showed up in
  // the exported document but was invisible to keyword matching and the ATS
  // score, which is exactly the kind of change that appears to do nothing.
  for (const a of resume.achievements || []) parts.push(a?.text || a, ...((a?.parts || []).filter((p) => p !== a?.text)));
  for (const l of resume.languages || []) parts.push(l?.text || l, ...((l?.parts || []).filter((p) => p !== l?.text)));
  for (const o of resume.other || []) parts.push(o?.text || o, ...((o?.parts || []).filter((p) => p !== o?.text)));
  // Drop repeated lines. The same text is genuinely held twice in the model
  // (a parsed raw line plus the field it was parsed into), and keyword matching
  // counts occurrences, so a line left in twice read as evidence the candidate
  // had mentioned it twice.
  const seen = new Set();
  return parts
    .filter(Boolean)
    .map((x) => String(x).trim())
    .filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)))
    .join('\n');
};

/** Experience bullets in document order (responsibilities + achievements). */
export const experienceBullets = (entry) => [...(entry?.responsibilities || []), ...(entry?.achievements || [])];

export const isEmptyResume = (resume) => {
  if (!resume) return true;
  if (resume.personal?.name) return false;
  if (resume.summary) return false;
  if ((resume.experience || []).length) return false;
  if ((resume.education || []).length) return false;
  if ((resume.skills || []).length) return false;
  return true;
};

export default {
  createEmptyResume,
  cloneResume,
  newId,
  resumeToText,
  experienceBullets,
  isEmptyResume,
};
