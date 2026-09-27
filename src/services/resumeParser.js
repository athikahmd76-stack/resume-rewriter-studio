/**
 * ResumeParser
 *
 * Converts a parsed document (PDF or DOCX) into the structured resume model:
 *
 *   { personal, summary, experience[], education[], skills[], certifications[],
 *     projects[], achievements[], languages[], other[], sections[] }
 *
 * No facts are invented here. Every value is a literal substring of the source
 * document, or an empty string.
 */

import { buildSectionLookup, SECTION_META, CANONICAL_SECTION_ORDER } from '../data/sectionDictionary.js';
import { collapseWhitespace, detectBulletPrefix } from '../utils/textUtils.js';
import { DATE_PATTERNS, extractDateString, hasPresentMarker, splitHeaderSegments } from '../utils/formattingUtils.js';
import { createEmptyResume, emptyPersonal, emptyExperienceEntry, newId } from './resumeModel.js';

const SECTION_LOOKUP = buildSectionLookup();

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|,)]+/i;
const PORTFOLIO_RE = /(?:https?:\/\/)?(?:www\.)?(?:github\.com|dribbble\.com|behance\.net|medium\.com|portfolio\.[\w-]+|[\w-]+\.(?:com|net|org|io|dev|co))\/?[^\s|,)]{0,60}/i;

const ROLE_TOKENS = [
  'analyst', 'manager', 'engineer', 'specialist', 'lead', 'consultant', 'director', 'officer',
  'executive', 'assistant', 'coordinator', 'supervisor', 'developer', 'architect', 'accountant',
  'auditor', 'planner', 'buyer', 'administrator', 'scientist', 'therapist', 'teacher', 'nurse',
  'advisor', 'partner', 'associate', 'intern', 'representative', 'executive', 'head', 'chief',
  'controller', 'technician', 'technologist', 'designer', 'marketer', 'strategist', 'agent',
  'clerk', 'attendant', 'navigator', 'trainer', 'facilitator', 'instructor', 'scientist',
  'account executive', 'business analyst', 'product owner', 'scrum master', 'apprentice',
  'senior', 'junior', 'principal', 'staff', 'freelance', 'contractor', 'trainee', 'associate',
  'coach', 'owner', 'founder', 'fellow', 'chairman', 'officer', 'clerk',
];

const COMPANY_TOKENS = [
  'inc', 'inc.', 'llc', 'l.l.c.', 'ltd', 'ltd.', 'limited', 'plc', 'gmbh', 'ag', 'sa', 's.a.',
  'nv', 'n.v.', 'bv', 'b.v.', 'pte', 'pvt', 'corp', 'corp.', 'corporation', 'company', 'co.',
  'group', 'holdings', 'partners', 'ventures', 'industries', 'systems', 'technologies', 'solutions',
  'services', 'consulting', 'enterprises', 'labs', 'laboratories', 'foundation', 'institute',
  'university', 'college', 'hospital', 'bank', 'airlines', 'motors', 'pharmaceuticals',
];

const CITY_HINTS = [
  'london', 'new york', 'los angeles', 'chicago', 'toronto', 'vancouver', 'montreal', 'sydney',
  'melbourne', 'singapore', 'dubai', 'mumbai', 'delhi', 'bengaluru', 'bangalore', 'hyderabad',
  'chennai', 'pune', 'gurugram', 'noida', 'berlin', 'munich', 'paris', 'amsterdam', 'dublin',
  'madrid', 'barcelona', 'rome', 'milan', 'zurich', 'vienna', 'warsaw', 'lisbon', 'stockholm',
  'oslo', 'helsinki', 'copenhagen', 'brussels', 'auckland', 'johannesburg', 'cape town',
  'nairobi', 'lagos', 'cairo', 'istanbul', 'seoul', 'tokyo', 'shanghai', 'beijing', 'hong kong',
];

const US_STATES = 'al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc';
const STATE_RE = new RegExp(`\\b(?:${US_STATES})\\b\\s*,?\\s*(?:USA|US|United States)?\\b`, 'i');

const normalizeHeading = (line) =>
  String(line || '')
    .replace(/[:.\-â€“â€”_|*#â€¢]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Is this line plausibly a section heading? */
const isHeadingLine = (block) => {
  const text = collapseWhitespace(block.text || '');
  if (!text) return false;
  if (text.length > 64) return false;
  if (text.split(' ').length > 6) return false;
  if (block.type === 'bullet') return false;
  if (block.bullet) return false;
  const normalized = normalizeHeading(text);
  if (SECTION_LOOKUP.has(normalized)) return true;
  if (block.fontSize && block.bodyFontSize && block.fontSize >= block.bodyFontSize * 1.06) {
    // visually prominent short line: heading candidate
    if (normalized.length >= 3 && normalized.length <= 60) return true;
  }
  if (block.bold && normalized.length <= 48 && normalized.split(' ').length <= 5) {
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 3) return true;
  }
  return false;
};

const sectionIdFor = (line) => {
  const normalized = normalizeHeading(line && typeof line === 'object' ? line.text : line);
  if (SECTION_LOOKUP.has(normalized)) return SECTION_LOOKUP.get(normalized);
  // tolerant: "work experience & history", "education 2010-2014"
  const stripped = normalized.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  if (SECTION_LOOKUP.has(stripped)) return SECTION_LOOKUP.get(stripped);
  for (const [alias, canonical] of SECTION_LOOKUP) {
    if (alias.length >= 4 && stripped.startsWith(alias)) return canonical;
  }
  return null;
};

/** Turn parsed blocks into annotated lines. */
const toLines = (blocks) => blocks.map((block, index) => {
  const text = collapseWhitespace(block.text || '');
  const bullet = detectBulletPrefix(block.text || '');
  return {
    index,
    id: `l${index}`,
    text,
    raw: block.text || '',
    isBullet: Boolean(bullet) || Boolean(block.bullet),
    bulletMarker: bullet ? bullet.char : block.marker || null,
    bulletText: bullet ? bullet.rest : text,
    numbered: Boolean(bullet && bullet.numbered),
    level: block.level || 0,
    type: block.type || (bullet ? 'bullet' : 'paragraph'),
    heading: Boolean(block.headingLevel) || /^h[1-6]$/i.test(block.styleName || ''),
    headingLevel: block.headingLevel || null,
    fontSize: block.fontSize ?? null,
    bold: Boolean(block.bold),
    italic: Boolean(block.italic),
    align: block.align || 'left',
    color: block.color || null,
    inCell: Boolean(block.inCell),
  };
});

/**
 * Headings that are labels inside a section rather than a section of their own.
 * "ADDITIONAL" under EXPERIENCE used to open an "Interests" section and swallow
 * the rest of the jobs.
 */
const WEAK_HEADINGS = new Set([
  'additional', 'additional work', 'additional experience', 'other', 'others', 'misc', 'miscellaneous',
  'notes', 'general', 'extra', 'extras', 'more', 'select', 'selected', 'key', 'relevant',
  'early career', 'mid career', 'late career', 'previous career', 'earlier experience',
  'prior experience', 'career highlights', 'highlights', 'employers',
]);

/** Split the annotated line list into `{ headerLines, sections: [{id,title,lines}] }`. */
const segmentDocument = (lines) => {
  const bodyFontSize = (() => {
    const sizes = lines.filter((l) => !l.isBullet && l.fontSize).map((l) => l.fontSize);
    if (!sizes.length) return null;
    const s = [...sizes].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  })();

  for (const l of lines) l.bodyFontSize = bodyFontSize;

  const sections = [];
  let current = null;
  const headerLines = [];

  for (const line of lines) {
    const id = isHeadingLine(line) ? sectionIdFor(line) : null;
    if (id) {
      const normalized = normalizeHeading(line.text);
      const insideSection = Boolean(current) && current.lines.length > 0;
      // A repeated heading for the section we are already in, or a generic
      // label such as "ADDITIONAL", is a sub-heading - keep the lines flowing.
      const isSubHeading = insideSection && (id === current.id || WEAK_HEADINGS.has(normalized));
      if (isSubHeading) continue;
      current = { id, title: collapseWhitespace(line.text).replace(/[:\s]+$/, ''), lines: [], lineIndex: line.index, explicit: true };
      sections.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else headerLines.push(line);
  }

  // If we found no sections at all, treat the whole document as one blob.
  if (!sections.length) {
    sections.push({ id: 'other', title: '', lines: lines.slice(), lineIndex: 0, explicit: false });
    return { headerLines: [], sections, bodyFontSize };
  }

  return { headerLines, sections, bodyFontSize };
};

const looksLikeRole = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  const words = t.split(/[\s/|,-]+/);
  return words.some((w) => ROLE_TOKENS.includes(w.replace(/[.,]/g, ''))) || ROLE_TOKENS.some((r) => new RegExp(`\\b${r}\\b`).test(t));
};

const looksLikeCompany = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  if (COMPANY_TOKENS.some((c) => new RegExp(`(^|[\\s,])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,.])`).test(t))) return true;
  if (/\b(ltd|inc|llc|gmbh|plc|bv|pvt|pty|corp|s\.?a)\b/i.test(t)) return true;
  return false;
};

const looksLikeLocation = (text) => {
  const t = String(text || '').trim();
  if (!t || t.length > 48) return false;
  if (STATE_RE.test(t)) return true;
  if (CITY_HINTS.some((c) => t.toLowerCase().includes(c))) return true;
  if (/Remote|Hybrid|On-?site/i.test(t)) return true;
  // "City, ST" pattern
  if (/^[^,]{2,28},\s*[A-Z]{2,3}$/.test(t)) return true;
  return false;
};

/** Pull contact details out of the header block. */
const parsePersonal = (headerLines, fallbackName = '') => {
  const personal = emptyPersonal();
  const texts = headerLines.map((l) => collapseWhitespace(l.text)).filter(Boolean);
  const extras = [];
  let name = '';

  // Contact details are often packed onto one line: "email | phone | city | LinkedIn".
  // Split first, then classify each segment, so a long line is still understood.
  const segments = texts
    .flatMap((t) => [t, ...splitHeaderSegments(t)])
    .map((t) => t.replace(/^[|\u2022\u2013\u2014-\s]+|[|\u2022\u2013\u2014-\s]+$/g, '').trim())
    .filter(Boolean);

  for (const text of segments) {
    const email = text.match(EMAIL_RE);
    if (email && !personal.email) personal.email = email[0].replace(/[.,;]+$/, '');
    const linkedin = text.match(LINKEDIN_RE);
    if (linkedin && !personal.linkedin) personal.linkedin = linkedin[0].replace(/[.,;)]+$/, '');
    // Never mine a portfolio/website out of an email address.
    if (!email) {
      const portfolio = text.match(PORTFOLIO_RE);
      if (portfolio && !personal.portfolio && !/linkedin/i.test(portfolio[0])) {
        personal.portfolio = portfolio[0].replace(/[.,;)]+$/, '');
      }
    }
    const phone = text.match(PHONE_RE);
    if (phone && !personal.phone) {
      const candidate = phone[0].trim();
      const digits = candidate.replace(/\D/g, '');
      if (digits.length >= 8 && digits.length <= 15 && !/^(19|20)\d{2}$/.test(candidate)) personal.phone = candidate;
    }
    if (looksLikeLocation(text) && !personal.location && text.length <= 40) personal.location = text;
  }

  // Name = first prominent line that is not contact details / a section title
  for (let i = 0; i < headerLines.length; i += 1) {
    const line = headerLines[i];
    const text = collapseWhitespace(line.text);
    if (!text) continue;
    if (EMAIL_RE.test(text)) continue;
    if (LINKEDIN_RE.test(text) || PORTFOLIO_RE.test(text)) continue;
    if (PHONE_RE.test(text) && text.replace(/\D/g, '').length >= 8) continue;
    if (line.isBullet) continue;
    if (SECTION_LOOKUP.has(normalizeHeading(text))) continue;
    const wordCount = text.split(/\s+/).length;
    if (wordCount > 6) continue;
    if (/(resume|curriculum vitae|\bcv\b)/i.test(text)) continue;
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length < 3) continue;
    // Prefer the largest / boldest line in the header
    name = text;
    break;
  }

  personal.name = name || fallbackName || '';
  personal.headline = '';

  // Contact line / other header text kept verbatim for layout fidelity
  for (const line of headerLines) {
    const text = collapseWhitespace(line.text);
    if (!text) continue;
    if (text === personal.name) continue;
    if (EMAIL_RE.test(text) && text.replace(EMAIL_RE, '').trim().length <= 2) continue;
    extras.push({ id: newId('contact'), text, align: line.align, bold: line.bold, fontSize: line.fontSize });
  }
  personal.extras = extras;
  return personal;
};

const splitSkillLine = (line) => {
  const text = collapseWhitespace(line);
  const colonIdx = text.search(/:\s*/);
  if (colonIdx > 0 && colonIdx < 34) {
    const label = text.slice(0, colonIdx).trim();
    const rest = text.slice(colonIdx + 1).trim();
    if (label.split(' ').length <= 4 && rest.length > 0) return { label, items: splitList(rest) };
  }
  return { label: '', items: splitList(text) };
};

const splitList = (text) =>
  String(text || '')
    // Commas, semicolons, pipes and bullets always separate items. A slash only
    // separates when it is spaced out, so "SAP S/4HANA" and "CI/CD" stay intact.
    .split(/\s*(?:,|;|\||\u2022|\u2023|\u25AA|\n)\s*|\s+\/\s+/)
    .map((s) => s.replace(/^[-*\u2022\u2013\u2014]\s*/, '').trim())
    .filter((s) => s.length > 0 && s.length < 80);

const parseSummary = (lines) => {
  const parts = lines
    .filter((l) => !l.isBullet || l.text)
    .map((l) => collapseWhitespace(l.isBullet ? l.bulletText : l.text))
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
};

const parseSkills = (lines) => {
  const groups = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    const { label, items } = splitSkillLine(text);
    if (!items.length) continue;
    groups.push({ id: newId('skill'), label, items, source: text });
  }
  return groups;
};

const YEAR_ONLY_RE = /^\s*(?:19|20)\d{2}\s*$/;

const parseCertifications = (lines) => {
  const items = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    for (const part of splitList(text)) {
      // A trailing year belongs to the certification before it, never its own entry.
      if (YEAR_ONLY_RE.test(part)) {
        const prev = items[items.length - 1];
        if (prev) {
          if (!prev.year) prev.year = part.trim();
          if (prev.parts.length && !prev.parts[prev.parts.length - 1].includes(part)) {
            prev.parts[prev.parts.length - 1] = `${prev.parts[prev.parts.length - 1]}, ${part.trim()}`;
          }
          continue;
        }
      }
      const year = part.match(/\b(19|20)\d{2}\b/);
      items.push({
        id: newId('cert'),
        name: part,
        issuer: '',
        year: year ? year[0] : '',
        detail: '',
        parts: [part],
      });
    }
  }
  // Standalone entries that are only a year carry no information on their own.
  return items.filter((c) => !YEAR_ONLY_RE.test(c.name) || c.name !== c.year);
};

const parseLanguages = (lines) => {
  const items = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    for (const part of splitList(text)) {
      const level = part.match(/\(([^)]{2,40})\)\s*$/)?.[1] || '';
      const name = level ? part.replace(/\s*\(([^)]{2,40})\)\s*$/, '').trim() || part : part;
      items.push({ id: newId('lang'), text: name, level, parts: [part] });
    }
  }
  return items;
};

const parseEducation = (lines) => {
  const entries = [];
  let current = null;
  const ensure = () => {
    if (!current) {
      current = { id: newId('edu'), institution: '', degree: '', field: '', dates: '', location: '', details: [], parts: [] };
      entries.push(current);
    }
    return current;
  };

  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    const entry = ensure();
    entry.parts.push(text);
    if (line.isBullet) {
      entry.details.push(text);
      continue;
    }
    const dates = extractDateString(text);
    if (dates && !entry.dates) entry.dates = dates;

    // "BSc Supply Chain Management | University of Leeds | 2015 - 2019"
    const segments = splitHeaderSegments(text).filter(Boolean);
    if (segments.length > 1) {
      const rest = segments.filter((s) => !entry.dates || s !== entry.dates);
      if (rest.length && !entry.degree) entry.degree = rest[0];
      const institution = rest.slice(1).find((s) => /university|college|school|institute|academy|polytechnic/i.test(s));
      if (institution && !entry.institution) entry.institution = institution;
      if (!entry.institution) {
        const other = rest.find((s) => s !== entry.degree && !looksLikeLocation(s) && !/^(remote|hybrid)$/i.test(s));
        if (other) entry.institution = other;
      }
      continue;
    }

    const stripped = text.replace(dates, '').trim();
    const degreeWords = /\b(bachelor|master|ph\.?d|doctorate|diploma|b\.?sc|m\.?sc|b\.?a|m\.?a|b\.?com|m\.?com|b\.?tech|m\.?tech|b\.?e|m\.?e|mba|associate|foundation|postgraduate|undergraduate|honou?rs|certificat|diplomat|licentiate|ca|acca|cma|cpa)\b/i;
    if (degreeWords.test(stripped) && !entry.degree) {
      entry.degree = stripped;
      continue;
    }
    if (!entry.institution) {
      entry.institution = stripped || text;
    } else if (!entry.degree) {
      entry.degree = stripped;
    } else {
      entry.details.push(text);
    }
  }
  return entries.filter((e) => e.parts.length);
};

/** The most common font size in a section - everything else is compared to it. */
const bodyFontSizeOf = (lines) => {
  const sizes = lines.map((l) => l.fontSize).filter((s) => typeof s === 'number' && s > 0).sort((a, b) => a - b);
  return sizes.length ? sizes[Math.floor(sizes.length / 2)] : null;
};

/**
 * A sub-heading inside a section body - "EARLY CAREER", "ADDITIONAL WORK" - is a
 * label, never a job. DOCX flags these as headings; in a PDF they are usually a
 * short all-caps line. All-caps is the signal that is safe here: job titles are
 * regularly bold, so bold on its own is not enough.
 */
const isSubHeadingLine = (line) => {
  if (line.isBullet || line.bullet) return false;
  if (line.heading || line.headingLevel || line.type === 'heading') return true;
  const text = collapseWhitespace(line.text || '');
  if (!text || text.length > 48 || text.split(' ').length > 5) return false;
  if (SECTION_LOOKUP.has(normalizeHeading(text))) return true;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  return letters === letters.toUpperCase();
};

/** A date range or a "present/current" marker. A lone year is not a header signal. */
const hasDateRange = (text) => DATE_PATTERNS.rangeMonths.test(text) || DATE_PATTERNS.rangeYears.test(text);

const WORK_TYPE_RE = /^(remote|hybrid|on-?site|contract|permanent|full[- ]time|part[- ]time|freelance|internship)$/i;
const LEGAL_SUFFIX_RE = /^(inc|llc|ltd|limited|plc|gmbh|co|corp|corporation|company|group|holdings|s\.?a\.?)$/i;

/**
 * Decide role / company / location / dates for a job from *all* of its header
 * lines at once. Deciding line by line is what put the company in the role field
 * for a company-first header, so the segments of every header line are pooled.
 * While the header is still growing only unambiguous segments are accepted; the
 * positional guess ("the first thing is the role") waits for `settle`, otherwise a
 * company line above the role would win the role field and never be revisited.
 */
const finalizeHeader = (entry, settle = false) => {
  const segments = [];
  for (const text of entry.headerTexts || []) {
    const dates = extractDateString(text);
    if (dates && !entry.dates) entry.dates = dates;
    const withoutDates = dates ? text.replace(dates, ' ').replace(/\s{2,}/g, ' ').trim() : text;
    for (const seg of splitHeaderSegments(withoutDates)) {
      // "Cobalt Retail Labs, Hyderabad" is one segment but two facts, so a comma
      // inside a segment separates too - unless the tail is a legal suffix,
      // which belongs to the company name ("Acme, Inc.").
      const parts = seg.includes(',') ? seg.split(',').map((s) => s.trim()).filter(Boolean) : [seg];
      parts.forEach((part, idx) => {
        if (idx > 0 && LEGAL_SUFFIX_RE.test(part) && segments.length) {
          segments[segments.length - 1] = `${segments[segments.length - 1]}, ${part}`;
          return;
        }
        if (part) segments.push(part);
      });
    }
  }
  if (!segments.length) return;

  const notes = [];
  const used = new Set();
  segments.forEach((seg, idx) => {
    if (WORK_TYPE_RE.test(seg)) { notes.push(seg); used.add(idx); return; }
    if (!entry.location && looksLikeLocation(seg)) { entry.location = seg; used.add(idx); }
  });

  if (!entry.role) {
    const idx = segments.findIndex((s, i) => !used.has(i) && looksLikeRole(s) && !looksLikeCompany(s));
    if (idx >= 0) { entry.role = segments[idx]; used.add(idx); }
  }
  if (!entry.company) {
    const idx = segments.findIndex((s, i) => !used.has(i) && s !== entry.role && looksLikeCompany(s));
    if (idx >= 0) { entry.company = segments[idx]; used.add(idx); }
  }

  if (settle) {
    // Nothing in the header looked like a role, so the first free segment is it.
    if (!entry.role) {
      const idx = segments.findIndex((s, i) => !used.has(i));
      if (idx >= 0) { entry.role = segments[idx]; used.add(idx); }
    }
    if (!entry.company) {
      const idx = segments.findIndex((s, i) => !used.has(i) && s !== entry.role);
      if (idx >= 0) { entry.company = segments[idx]; used.add(idx); }
    }
  }

  // Anything left over is still text from the document, so keep it rather than
  // dropping it: a region right after the city belongs to the location.
  segments.forEach((seg, idx) => {
    if (used.has(idx)) return;
    const prevIsLocation = idx > 0 && entry.location && used.has(idx - 1) && segments[idx - 1] === entry.location;
    if (prevIsLocation) entry.location = `${entry.location}, ${seg}`;
    else notes.push(seg);
  });
  if (notes.length) entry.notes = entry.notes ? `${entry.notes}, ${notes.join(', ')}` : notes.join(', ');
};

const parseExperience = (lines) => {
  const entries = [];
  let current = null;
  const bodySize = bodyFontSizeOf(lines);
  // Which list the last bullet went into, so a wrapped line joins the right one.
  let lastBulletList = null;
  const lastLineOfEntry = () => (current && current.rawLines.length ? current.rawLines[current.rawLines.length - 1] : null);
  const isBodySized = (line) => bodySize === null || line.fontSize === null || line.fontSize <= bodySize * 1.02;
  const stripDates = (text, dates) => (dates ? text.replace(dates, ' ').replace(/\s{2,}/g, ' ').trim() : text);

  const startEntry = (line) => {
    current = { ...emptyExperienceEntry(), rawLines: [line], headerTexts: [] };
    entries.push(current);
    lastBulletList = null;
  };
  const addHeaderLine = (line, text) => {
    current.rawLines.push(line);
    current.headerTexts.push(text);
    finalizeHeader(current);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;

    if (!line.isBullet && isSubHeadingLine(line)) continue;

    if (line.isBullet) {
      if (!current) { startEntry(line); current.headerTexts.push(text); }
      else current.rawLines.push(line);
      // the header may still be incomplete when the first bullet shows up
      finalizeHeader(current);
      lastBulletList = hasMetric(text) ? 'achievements' : 'responsibilities';
      current[lastBulletList].push(text);
      continue;
    }

    const next = lines[i + 1];
    const nextText = next ? collapseWhitespace(next.isBullet ? next.bulletText : next.text) : '';
    const afterNext = lines[i + 2];
    const afterNextText = afterNext ? collapseWhitespace(afterNext.isBullet ? afterNext.bulletText : afterNext.text) : '';
    const nextIsBullet = Boolean(next && (next.isBullet || next.bullet));
    // A header can span three lines - role / company, city / dates - so the date
    // that proves this is a header may be one line further down.
    const soonHasDate = [nextText, afterNextText].some((t) => t && (hasDateRange(t) || hasPresentMarker(t)));
    const nextIsShortPlain = Boolean(nextText) && nextText.length <= 90 && !/[.!?]$/.test(nextText) && !nextIsBullet;

    const dates = extractDateString(text);
    const isDateOnly = Boolean(dates) && !stripDates(text, dates);
    // A lone year is not a header signal: "rebuilt the 2019 pipeline" is a bullet.
    const strongDate = hasDateRange(text) || hasPresentMarker(text);
    const segments = splitHeaderSegments(text).filter((s) => s && s.length);
    const headerOnly = Boolean(current) && !current.company && !current.dates
      && !current.responsibilities.length && !current.achievements.length;
    const lastLine = lastLineOfEntry();
    const gapBreak = Boolean(current) && lastLine && !lastLine.isBullet
      && line.fontSize !== null && lastLine.fontSize !== null
      && line.fontSize > lastLine.fontSize * 1.05;

    // 1. A line that is nothing but a date completes the job above it.
    if (isDateOnly) {
      if (!current) { startEntry(line); addHeaderLine(line, text); continue; }
      if (!current.dates) addHeaderLine(line, text);
      continue;
    }

    // 2. The job above is still only a header, so this line finishes it:
    //    "Senior Data Engineer" / "Acme Ltd, Berlin" / "2021 - Present".
    if (headerOnly) {
      addHeaderLine(line, text);
      continue;
    }

    if (!current) { startEntry(line); addHeaderLine(line, text); continue; }

    // 3. A real header line opens the next job. Headers are short and often set
    //    in a larger or bold face, so this can never swallow a wrapped bullet
    //    line - which is what used to invent jobs out of bullet wraps.
    const headerFace = (!isBodySized(line) || line.bold) && !/[.!?]$/.test(text);
    const looksHeader = text.length <= 90 && (
      (strongDate && (looksLikeCompany(text) || looksLikeRole(text) || segments.length > 1))
      || (looksLikeCompany(text) && segments.length > 1)
      || (looksLikeRole(text) && (soonHasDate || nextIsShortPlain || nextIsBullet))
      || (headerFace && (looksLikeRole(text) || looksLikeCompany(text) || segments.length > 1))
      || gapBreak
    );
    if (looksHeader) {
      startEntry(line);
      addHeaderLine(line, text);
      continue;
    }

    // 4. Body-sized prose right after a bullet is a wrapped bullet line: PDFs
    //    break long bullets across lines and the wrap carries no marker.
    if (lastBulletList && isBodySized(line)) {
      const list = current[lastBulletList];
      list[list.length - 1] = `${list[list.length - 1]} ${text}`.replace(/\s{2,}/g, ' ').trim();
      current.rawLines.push(line);
      continue;
    }

    // 5. Anything else is detail for the job in progress. A plain paragraph is
    //    its own bullet (many resumes use no bullet glyph at all), so it must
    //    not become a continuation of the paragraph above it.
    current.rawLines.push(line);
    if (!current.dates && dates) { current.dates = dates; continue; }
    if (looksLikeLocation(text) && !current.location) { current.location = text; continue; }
    current.responsibilities.push(text);
    lastBulletList = null;
  }

  // A header can still be growing when the next job starts, so settle every
  // entry once the whole section has been read.
  entries.forEach((e) => finalizeHeader(e, true));

  return entries.filter((e) => e.company || e.role || e.responsibilities.length || e.achievements.length);
};

const METRIC_RE = /(\b\d{1,3}(?:[.,]\d+)?\s?(?:%|percent)\b)|(\b(?:usd|eur|gbp|inr|aud|cad|zar|sgd|ae[dv])\s?[\d.,]+\s?(?:k|m|bn|million|billion|thousand)?\b)|(\b[\d.,]+\s?(?:k|m|bn)\b)|(\bby\s+\d{1,3}\s?%)|(\b\d{1,3}\s?%)|(\b\d[\d,]{2,}\+?\b)|(\b\d+(?:\.\d+)?\s?(?:x|times)\b)|(\bfrom\s+[\d.,]+|\bto\s+[\d.,]+\s?(?:%|k|m|million))/i;

export const hasMetric = (text) => METRIC_RE.test(String(text || ''));


const parseProjects = (lines) => {
  const projects = [];
  let current = null;
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    if (!line.isBullet && isSubHeadingLine(line)) continue;
    if (line.isBullet) {
      if (!current) {
        current = { id: newId('proj'), name: '', role: '', dates: '', detail: '', bullets: [], parts: [text] };
        projects.push(current);
      }
      current.bullets.push(text);
      current.parts.push(text);
      continue;
    }
    const dates = extractDateString(text);
    const withoutDates = dates ? text.replace(dates, ' ').replace(/\s{2,}/g, ' ').trim() : text;
    const segments = splitHeaderSegments(withoutDates);

    // A project header is often split over two lines - "Customer 360" then
    // "Consultant | 2024" - so a second header line before any bullet refines
    // the project instead of starting a new one.
    if (current && !current.bullets.length && (text.length <= 90)) {
      if (!withoutDates) {
        if (!current.dates) current.dates = dates;
      } else if (!current.role && !current.dates) {
        current.role = segments[0] || withoutDates;
        if (segments[1]) current.detail = segments.slice(1).join(' | ');
      } else if (!current.detail && segments.length) {
        current.detail = segments.join(' | ');
      }
      current.parts.push(text);
      continue;
    }

    current = {
      id: newId('proj'),
      name: segments[0] || withoutDates || text,
      role: segments[1] || '',
      dates,
      detail: segments.slice(2).join(' | '),
      bullets: [],
      parts: [text],
    };
    projects.push(current);
  }
  return projects.filter((p) => p.name || p.bullets.length);
};

const parseAchievements = (lines) => {
  const items = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    items.push({ id: newId('ach'), text, parts: [text] });
  }
  return items;
};

const parseGenericSection = (lines) => {
  const items = [];
  for (const line of lines) {
    const text = collapseWhitespace(line.isBullet ? line.bulletText : line.text);
    if (!text) continue;
    items.push({ id: newId('other'), text, parts: [text], align: line.align, bold: line.bold, fontSize: line.fontSize });
  }
  return items;
};

/**
 * @param {{blocks:Array, text:string, kind:string}} parsed
 * @returns {{resume:object, sections:Array, diagnostics:object}}
 */
export const parseResume = (parsed) => {
  const resume = createEmptyResume();
  const diagnostics = {
    sectionsFound: [],
    sectionsMissing: [],
    lineCount: 0,
    warnings: [],
  };

  const lines = toLines(parsed.blocks || []);
  diagnostics.lineCount = lines.length;
  if (!lines.length) {
    diagnostics.warnings.push('No text lines were detected in the document.');
    return { resume, sections: [], diagnostics };
  }

  const { headerLines, sections, bodyFontSize } = segmentDocument(lines);
  void bodyFontSize;

  resume.personal = parsePersonal(headerLines);

  // Map each detected section to the model bucket
  const order = [];
  for (const section of sections) {
    const id = section.id;
    if (!order.includes(id)) order.push(id);
    switch (id) {
      case 'contact':
        break;
      case 'summary':
        if (!resume.summary) resume.summary = parseSummary(section.lines);
        break;
      case 'experience':
        resume.experience.push(...parseExperience(section.lines));
        break;
      case 'education':
        resume.education.push(...parseEducation(section.lines));
        break;
      case 'skills':
        resume.skills.push(...parseSkills(section.lines));
        break;
      case 'certifications':
        resume.certifications.push(...parseCertifications(section.lines));
        break;
      case 'projects':
        resume.projects.push(...parseProjects(section.lines));
        break;
      case 'achievements':
        resume.achievements.push(...parseAchievements(section.lines));
        break;
      case 'languages':
        resume.languages.push(...parseLanguages(section.lines));
        break;
      case 'interests':
      case 'other':
      default:
        resume.other.push(...parseGenericSection(section.lines));
        break;
    }
    diagnostics.sectionsFound.push({ id, title: section.title, lineCount: section.lines.length, explicit: section.explicit });
  }

  // Sections that were not found (informational only - never fabricated)
  diagnostics.sectionsMissing = CANONICAL_SECTION_ORDER.filter((id) => {
    if (id === 'contact') return false;
    return !order.includes(id);
  });

  resume.meta = {
    sourceKind: parsed.kind,
    parsedAt: new Date().toISOString(),
    originalText: parsed.text || '',
    bodyFontSize,
  };

  // Deduplicate experience entries that ended up identical
  resume.experience = dedupeBy(resume.experience, (e) => `${e.role}|${e.company}|${e.dates}`.toLowerCase() + `|${e.responsibilities.length}`);
  resume.education = dedupeBy(resume.education, (e) => e.parts.join('|').toLowerCase());
  resume.skills = dedupeBy(resume.skills, (s) => s.source.toLowerCase());
  resume.certifications = dedupeBy(resume.certifications, (c) => c.name.toLowerCase());
  resume.projects = dedupeBy(resume.projects, (p) => p.name.toLowerCase());
  resume.languages = dedupeBy(resume.languages, (l) => l.text.toLowerCase());

  const sectionMeta = order
    .filter((id) => id !== 'contact' && hasContent(resume, id))
    .map((id, i) => ({
      id,
      title: SECTION_META[id]?.defaultTitle || id,
      detectedTitle: diagnostics.sectionsFound.find((s) => s.id === id)?.title || '',
      order: i,
      visible: true,
    }));

  resume.sections = sectionMeta;

  if (!resume.personal.name) {
    diagnostics.warnings.push('The candidate name could not be detected in the header. You can add it in the editor.');
  }
  if (!resume.experience.length) {
    diagnostics.warnings.push('No experience entries were detected. Check that the document has an experience section heading.');
  }
  if (!resume.skills.length) {
    diagnostics.warnings.push('No skills section was detected.');
  }

  return { resume, sections: sectionMeta, diagnostics, headerLines };
};

const hasContent = (resume, id) => {
  switch (id) {
    case 'summary': return Boolean(resume.summary);
    case 'experience': return resume.experience.length > 0;
    case 'education': return resume.education.length > 0;
    case 'skills': return resume.skills.length > 0;
    case 'certifications': return resume.certifications.length > 0;
    case 'projects': return resume.projects.length > 0;
    case 'achievements': return resume.achievements.length > 0;
    case 'languages': return resume.languages.length > 0;
    case 'interests':
    case 'other': return resume.other.length > 0;
    default: return false;
  }
};

const dedupeBy = (arr, keyFn) => {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
};

export {
  isHeadingLine,
  sectionIdFor,
  looksLikeRole,
  looksLikeCompany,
  looksLikeLocation,
  splitList,
  splitSkillLine,
  METRIC_RE,
  EMAIL_RE,
  PHONE_RE,
};
export default parseResume;
