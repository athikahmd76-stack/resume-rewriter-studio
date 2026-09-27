/**
 * Section dictionary: recognises resume section headings and their aliases.
 * Used by the parser to bucket lines into a structured resume model.
 */

export const SECTION_ALIASES = {
  contact: ['contact', 'contact information', 'contact details', 'contact info', 'personal details',
    'personal information', 'details'],
  summary: ['summary', 'professional summary', 'profile', 'professional profile', 'about me',
    'about', 'career summary', 'career profile', 'executive summary', 'personal statement',
    'objective', 'career objective', 'professional overview', 'overview'],
  experience: ['experience', 'work experience', 'professional experience', 'employment',
    'employment history', 'work history', 'career history', 'relevant experience', 'experience history',
    'professional background', 'work background', 'positions', 'roles'],
  education: ['education', 'academic background', 'academic qualifications', 'qualifications',
    'education and training', 'educational background', 'academics', 'education & training'],
  skills: ['skills', 'core skills', 'key skills', 'technical skills', 'competencies', 'core competencies',
    'areas of expertise', 'expertise', 'technical expertise', 'skill set', 'skills & competencies',
    'capabilities', 'professional skills', 'it skills', 'key competencies', 'strengths'],
  certifications: ['certifications', 'certification', 'certificates', 'licenses', 'licences',
    'accreditations', 'licenses and certifications', 'certifications & training', 'training',
    'courses', 'professional development'],
  projects: ['projects', 'key projects', 'personal projects', 'selected projects', 'project work',
    'project experience', 'portfolio', 'case studies', 'project highlights'],
  achievements: ['achievements', 'awards', 'honors', 'honours', 'accomplishments', 'recognitions',
    'key achievements', 'awards and achievements', 'milestones', 'accomplishments and awards'],
  languages: ['languages', 'language skills', 'linguistic skills', 'language proficiency', 'languages spoken'],
  interests: ['interests', 'hobbies', 'activities', 'interests and hobbies', 'personal interests',
    'outside work', 'extracurricular', 'sports', 'volunteering', 'volunteer experience',
    'community involvement', 'affiliations', 'memberships', 'professional affiliations',
    'professional memberships', 'references', 'additional information', 'additional details',
    'other information', 'other', 'miscellaneous', 'notes', 'additional'],
};

/** Build a lookup of normalised alias -> canonical section id. */
export const buildSectionLookup = () => {
  const lookup = new Map();
  for (const [canonical, aliases] of Object.entries(SECTION_ALIASES)) {
    lookup.set(canonical, canonical);
    for (const alias of aliases) lookup.set(alias, canonical);
  }
  return lookup;
};

/** Headings that never contain bullets, even if a colon follows. */
export const SECTION_HEADING_HINTS = [
  'summary', 'profile', 'about', 'objective', 'overview', 'experience', 'education', 'skills',
  'certification', 'certifications', 'project', 'projects', 'achievement', 'achievements',
  'award', 'awards', 'language', 'languages', 'contact', 'interest', 'interests', 'publication',
  'publications', 'reference', 'references', 'training', 'membership', 'affiliation', 'honor',
  'honour', 'volunteer', 'course', 'courses', 'portfolio', 'expertise', 'competencies',
];

/** Canonical ordering used when the source order is unknown. */
export const CANONICAL_SECTION_ORDER = [
  'contact', 'summary', 'experience', 'skills', 'projects', 'education', 'certifications',
  'achievements', 'languages', 'interests', 'other',
];

/** Section meta used by the renderer + exporters. */
export const SECTION_META = {
  contact: { label: 'Contact', defaultTitle: '' },
  summary: { label: 'Summary', defaultTitle: 'Professional Summary' },
  experience: { label: 'Experience', defaultTitle: 'Professional Experience' },
  skills: { label: 'Skills', defaultTitle: 'Skills' },
  projects: { label: 'Projects', defaultTitle: 'Projects' },
  education: { label: 'Education', defaultTitle: 'Education' },
  certifications: { label: 'Certifications', defaultTitle: 'Certifications' },
  achievements: { label: 'Achievements', defaultTitle: 'Achievements & Awards' },
  languages: { label: 'Languages', defaultTitle: 'Languages' },
  interests: { label: 'Interests', defaultTitle: 'Additional Information' },
  other: { label: 'Other', defaultTitle: 'Additional Information' },
};

export default SECTION_ALIASES;
