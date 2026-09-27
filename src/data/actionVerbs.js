/**
 * Action-verb engine data.
 *
 * `WEAK_PHRASE_MAP` maps passive / filler openers to a stronger verb.
 * The replacement is only applied when the remainder of the bullet keeps its
 * original meaning (see services/resumeRewriter.js).
 */

export const STRONG_ACTION_VERBS = [
  // leadership / direction
  'Directed', 'Oversaw', 'Championed', 'Spearheaded', 'Guided', 'Supervised', 'Mentored',
  // management
  'Managed', 'Orchestrated', 'Administered', 'Coordinated', 'Owned', 'Governed', 'Mobilized',
  // delivery / execution
  'Delivered', 'Executed', 'Implemented', 'Deployed', 'Launched', 'Rolled out', 'Operationalized',
  // improvement
  'Redesigned', 'Reengineered', 'Streamlined', 'Simplified', 'Standardized', 'Restructured',
  // growth
  'Expanded', 'Grew', 'Scaled', 'Accelerated', 'Doubled', 'Captured', 'Penetrated', 'Converted',
  // analysis
  'Analyzed', 'Assessed', 'Evaluated', 'Forecast', 'Forecasted', 'Modeled', 'Quantified',
  'Benchmarked', 'Diagnosed', 'Identified', 'Measured', 'Investigated', 'Audited', 'Forecasted',
  // optimisation
  'Optimized', 'Rationalized', 'Streamlined', 'Consolidated', 'Balanced', 'Allocated', 'Prioritized',
  // collaboration
  'Partnered', 'Collaborated', 'Aligned', 'Facilitated', 'Coached', 'Advised', 'Consulted',
  // commercial
  'Negotiated', 'Sourced', 'Procured', 'Solicited', 'Contracted', 'Renewed', 'Onboarded',
  // reporting
  'Documented', 'Reported', 'Forecast', 'Tracked', 'Monitored', 'Communicated', 'Presented',
  // problem solving
  'Resolved', 'Mitigated', 'Prevented', 'Contained', 'Recovered', 'Restored',
  // training
  'Trained', 'Onboarded', 'Educated', 'Upskilled',
  // generic strong verbs
  'Built', 'Developed', 'Created', 'Designed', 'Established', 'Formed', 'Generated', 'Maintained',
  'Prepared', 'Produced', 'Supported', 'Verified', 'Reviewed', 'Updated', 'Enhanced', 'Improved',
  'Increased', 'Reduced', 'Cut', 'Saved', 'Grew', 'Led', 'Planned', 'Drove', 'Established',
];

export const STRONG_VERB_SET = new Set(STRONG_ACTION_VERBS.map((v) => v.toLowerCase()));

/**
 * Weak phrase -> strong verb. Keys are lowercase and matched on word
 * boundaries against the START of a bullet.
 */
export const WEAK_PHRASE_MAP = [
  // responsibility phrasings
  { pattern: /\bresponsible for\b/i, verb: 'Managed', note: 'Owned the end-to-end scope' },
  { pattern: /\bresponsibilities included\b/i, verb: 'Managed', note: 'Owned the end-to-end scope' },
  { pattern: /\bresponsible to\b/i, verb: 'Reported', note: 'Ownership clarity' },
  { pattern: /\bin charge of\b/i, verb: 'Managed', note: 'Ownership clarity' },
  { pattern: /\baccountable for\b/i, verb: 'Owned', note: 'Ownership clarity' },
  { pattern: /\btook care of\b/i, verb: 'Managed', note: 'Ownership clarity' },
  { pattern: /\bdealt with\b/i, verb: 'Managed', note: 'Ownership clarity' },

  // hands-on phrasings
  { pattern: /\bworked on\b/i, verb: 'Executed', note: 'Delivery language' },
  { pattern: /\bwork on\b/i, verb: 'Execute', note: 'Delivery language' },
  { pattern: /\bworked in\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\bhelped with\b/i, verb: 'Supported', note: 'Delivery language' },
  { pattern: /\bhelped\b/i, verb: 'Supported', note: 'Delivery language' },
  { pattern: /\bassisted with\b/i, verb: 'Supported', note: 'Delivery language' },
  { pattern: /\bassisted\b/i, verb: 'Supported', note: 'Delivery language' },
  { pattern: /\bpart of\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\binvolved in\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\bparticipated in\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\btook part in\b/i, verb: 'Contributed to', note: 'Delivery language' },

  // vague / filler
  { pattern: /^did\b/i, verb: 'Executed', note: 'Delivery language' },
  { pattern: /^handl(?:e|ed|ing)\b/i, verb: 'Managed', note: 'Ownership clarity' },
  { pattern: /^managed\b/i, verb: 'Managed', note: 'Already strong' },
  { pattern: /\bparticipated\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\bhandled\b/i, verb: 'Managed', note: 'Ownership clarity' },
  { pattern: /\boversaw\b/i, verb: 'Directed', note: 'Stronger leadership verb' },
  { pattern: /\bwas involved\b/i, verb: 'Contributed to', note: 'Delivery language' },
  { pattern: /\bmade\b/i, verb: 'Delivered', note: 'Delivery language' },
  { pattern: /\bused to\b/i, verb: 'Applied', note: 'Delivery language' },
  { pattern: /\bmaintain(?:ed|ing)?\b/i, verb: 'Maintained', note: 'Already strong' },
];

/** Verbs that indicate a leadership / ownership level, used by the JD analyser. */
export const LEADERSHIP_VERBS = new Set([
  'led', 'manage', 'managed', 'managing', 'direct', 'directed', 'directing', 'oversaw', 'oversee',
  'supervise', 'supervised', 'supervising', 'head', 'headed', 'leadership', 'spearheaded',
  'championed', 'orchestrated', 'coordinated', 'governed', 'administered', 'owned', 'chaired',
]);

export const ANALYTICAL_VERBS = new Set([
  'analyzed', 'analysed', 'analyze', 'analyse', 'assessed', 'evaluate', 'evaluated', 'forecast',
  'forecasted', 'modeled', 'modelled', 'quantified', 'benchmarked', 'diagnosed', 'identified',
  'measured', 'investigated', 'audited', 'reviewed', 'researched', 'interpreted', 'tracked',
  'monitored', 'reported', 'surveyed',
]);

export const ACHIEVEMENT_VERBS = new Set([
  'increased', 'reduced', 'saved', 'cut', 'grew', 'improved', 'achieved', 'delivered', 'generated',
  'launched', 'built', 'developed', 'implemented', 'drove', 'led', 'established', 'streamlined',
  'consolidated', 'scaled', 'expanded', 'accelerated', 'eliminated', 'resolved', 'recovered',
]);

export default STRONG_ACTION_VERBS;
