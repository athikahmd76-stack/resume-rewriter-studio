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
  { pattern: /\bresponsible for\b/i, verb: 'Managed', note: 'Owned the end-to-end scope', scope: 'lead' },
  { pattern: /\bresponsibilities included\b/i, verb: 'Managed', note: 'Owned the end-to-end scope', scope: 'lead' },
  { pattern: /\bresponsible to\b/i, verb: 'Reported', note: 'Ownership clarity', scope: 'own' },
  { pattern: /\bin charge of\b/i, verb: 'Managed', note: 'Ownership clarity', scope: 'lead' },
  { pattern: /\baccountable for\b/i, verb: 'Owned', note: 'Ownership clarity', scope: 'own' },
  { pattern: /\btook care of\b/i, verb: 'Managed', note: 'Ownership clarity', scope: 'do' },
  { pattern: /\bdealt with\b/i, verb: 'Managed', note: 'Ownership clarity', scope: 'do' },

  // hands-on phrasings
  { pattern: /\bworked on\b/i, verb: 'Executed', note: 'Delivery language', scope: 'do' },
  { pattern: /\bwork on\b/i, verb: 'Execute', note: 'Delivery language', scope: 'do' },
  { pattern: /\bworked in\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'do' },
  { pattern: /\bhelped with\b/i, verb: 'Supported', note: 'Delivery language', scope: 'support' },
  { pattern: /\bhelped\b/i, verb: 'Supported', note: 'Delivery language', scope: 'support' },
  { pattern: /\bassisted with\b/i, verb: 'Supported', note: 'Delivery language', scope: 'support' },
  { pattern: /\bassisted\b/i, verb: 'Supported', note: 'Delivery language', scope: 'support' },
  { pattern: /\bpart of\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'do' },
  { pattern: /\binvolved in\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'support' },
  { pattern: /\bparticipated in\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'support' },
  { pattern: /\btook part in\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'support' },

  // vague / filler
  // "Did reporting" is not a delivery, it is authorship, and "Executed
  // reporting" is not English anyone writes.
  { pattern: /^did\s+(?:\w+\s+){0,2}report\w*/i, verb: 'Produced', note: 'Plain-English delivery language', scope: 'do' },
  { pattern: /^did\b/i, verb: 'Executed', note: 'Delivery language', scope: 'do' },
  { pattern: /^handl(?:e|ed|ing)\b/i, verb: 'Managed', note: 'Ownership clarity', scope: 'do' },
  { pattern: /\bparticipated\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'support' },
  { pattern: /\bhandled\b/i, verb: 'Managed', note: 'Ownership clarity', scope: 'do' },
  { pattern: /\boversaw\b/i, verb: 'Directed', note: 'Stronger leadership verb', scope: 'lead' },
  { pattern: /\bwas involved\b/i, verb: 'Contributed to', note: 'Delivery language', scope: 'support' },
  { pattern: /\bmade\b/i, verb: 'Delivered', note: 'Delivery language', scope: 'do' },
  { pattern: /\bused to\b/i, verb: 'Applied', note: 'Delivery language', scope: 'do' },
];

/**
 * How much of an achievement a verb claims, strongest last.
 *
 * The point of the ladder is that a rewrite may make the language stronger but
 * must not make the *claim* stronger. "Handled stock reconciliation" and "Took
 * care of the reconciliation" are work the candidate did; rewriting either to
 * "Managed" turns it into a statement about managing people, which they never
 * said and the app must never put in their mouth. Every entry in
 * WEAK_PHRASE_MAP carries the scope of the phrasing it matches, and the rewriter
 * applies it only when the replacement verb sits on the same rung.
 */
export const VERB_SCOPE = {
  // a management or supervisory claim
  lead: ['managed', 'directed', 'oversaw', 'supervised', 'led', 'spearheaded', 'championed',
    'coordinated', 'orchestrated', 'administered', 'governed', 'mentored', 'chaired'],
  // owns an outcome or a piece of work outright
  own: ['owned', 'delivered', 'implemented', 'deployed', 'launched', 'rolled out', 'operationalized',
    'accountable', 'reported'],
  // performed the work
  do: ['executed', 'execute', 'produced', 'built', 'created', 'developed', 'designed', 'prepared',
    'maintained', 'maintain', 'analyzed', 'analysed', 'documented', 'reported', 'tracked', 'monitored',
    'reviewed', 'applied', 'resolved', 'improved', 'reduced', 'increased', 'saved', 'cut', 'streamlined',
    'optimized', 'negotiated', 'forecasted', 'processed', 'handled', 'ran', 'tested', 'audited',
    'assessed', 'evaluated', 'investigated', 'identified', 'measured', 'updated', 'established'],
  // helped, did not own
  support: ['supported', 'contributed to', 'assisted', 'helped', 'participated'],
};

const SCOPE_OF_VERB = (() => {
  const m = new Map();
  for (const [scope, verbs] of Object.entries(VERB_SCOPE)) {
    for (const v of verbs) if (!m.has(v)) m.set(v, scope);
  }
  return m;
})();

/** The claim level of a replacement verb, or null when it is not classified. */
export const verbScope = (verb) => SCOPE_OF_VERB.get(String(verb || '').toLowerCase()) || null;

/**
 * Phrasings the pass recognises but refuses to rewrite, because every stronger
 * verb available would overstate the candidate's role. They are surfaced to the
 * user instead of being silently changed.
 */
export const OVERSTATED_UPGRADES = [
  { pattern: /\bhandl(?:e|ed|ing)\b/i, phrase: 'Handled', keep: 'Handled', reason: '"Managed" would claim you managed a team or a budget you did not' },
  { pattern: /\btook care of\b/i, phrase: 'Took care of', keep: 'Took care of', reason: '"Managed" would claim ownership you did not state' },
  { pattern: /\bdealt with\b/i, phrase: 'Dealt with', keep: 'Dealt with', reason: '"Managed" would claim a management scope you did not state' },
  { pattern: /\bworked in\b/i, phrase: 'Worked in', keep: 'Worked in', reason: 'a field is not a project, so "Contributed to" would change the meaning' },
  { pattern: /\bpart of\b/i, phrase: 'Part of', keep: 'Part of', reason: '"Contributed to a team" is not what the sentence says' },
  { pattern: /\bmade\b/i, phrase: 'Made', keep: 'Made', reason: '"Made savings" and "Delivered savings" are not the same claim' },
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
