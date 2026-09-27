/**
 * Stop words used by the local keyword extraction engine.
 * Kept intentionally small: we only strip filler, not meaningful
 * business/technical vocabulary.
 */

export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'across', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'been', 'being', 'below', 'best', 'better', 'both', 'but', 'by', 'can', 'could', 'did',
  'do', 'does', 'doing', 'done', 'down', 'during', 'each', 'etc', 'even', 'ever', 'every', 'few',
  'for', 'from', 'further', 'get', 'gets', 'got', 'had', 'has', 'have', 'he', 'her', 'here', 'hers',
  'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'like', 'may',
  'me', 'might', 'more', 'most', 'much', 'must', 'my', 'new', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'one', 'only', 'or', 'other', 'our', 'ours', 'out', 'over', 'own', 'per',
  'same', 'shall', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'upon', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'will', 'with', 'within', 'would', 'you', 'your', 'yours',
  // resume / job-description boilerplate
  'ability', 'able', 'across', 'actually', 'apply', 'candidate', 'candidates', 'company', 'demonstrated',
  'desired', 'detail', 'details', 'duties', 'ensure', 'ensure', 'equal', 'equal', 'experience',
  'familiar', 'gender', 'identity', 'ideal', 'including', 'knowledge', 'like', 'looking', 'match',
  'minimum', 'must', 'nice', 'none', 'nothing', 'offer', 'preferred', 'qualified', 'qualifications',
  'required', 'requirements', 'role', 'salary', 'skills', 'strong', 'success', 'team', 'teams',
  'understanding', 'work', 'working', 'year', 'years', 'responsibilities', 'responsibility',
  'position', 'candidate', 'requirements', 'please', 'apply', 'benefits', 'equal', 'employer',
  'opportunity', 'opportunities', 'environment', 'level', 'levels', 'well', 'will', 'would', 'may',
  'join', 'joining', 'help', 'helps', 'helping', 'using', 'use', 'used', 'make', 'makes', 'making',
  'etc', 'via', 'per', 'etc.',
]);

/** Words that must never be promoted to a resume keyword. */
export const NON_KEYWORD_TERMS = new Set([
  'responsibility', 'responsibilities', 'requirement', 'requirements', 'qualification',
  'qualifications', 'candidate', 'applicant', 'applicants', 'employer', 'employment',
  'application', 'apply', 'applicant', 'position', 'role', 'opportunity', 'company', 'team',
  'workplace', 'workforce', 'colleague', 'colleagues', 'stakeholder', 'stakeholders',
  'day', 'days', 'month', 'months', 'week', 'weeks', 'time', 'times', 'people', 'person',
  'other', 'others', 'such', 'well', 'able', 'across', 'within', 'using', 'use', 'used',
]);

/** Very common low-signal verbs that should not be treated as skills. */
export const WEAK_VERBS = new Set([
  'be', 'is', 'are', 'was', 'were', 'am', 'been', 'being', 'do', 'does', 'did', 'doing',
  'have', 'has', 'had', 'get', 'gets', 'got', 'go', 'goes', 'went', 'come', 'comes', 'came',
  'make', 'makes', 'made', 'take', 'takes', 'took', 'see', 'sees', 'saw', 'know', 'knows',
  'knew', 'think', 'thought', 'want', 'wants', 'need', 'needs', 'use', 'uses', 'used', 'using',
  'work', 'works', 'worked', 'working', 'help', 'helps', 'helped', 'helping', 'try', 'tried',
  'trying', 'look', 'looks', 'looked', 'looking', 'thing', 'things', 'stuff', 'etc',
]);

export default STOP_WORDS;
