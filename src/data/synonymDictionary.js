/**
 * Local synonym dictionary.
 *
 * Purpose: recognise that "purchasing" and "procurement" refer to the same
 * competency so a JD keyword can be *matched* against resume wording.
 *
 * SAFETY RULES ENFORCED BY THE ENGINE:
 *  - The engine may add a synonym to the resume ONLY when the synonym is a
 *    genuine, meaning-preserving synonym of something the candidate already
 *    claims (see `isSafeSubstitution` in services/keywordMatcher.js).
 *  - Synonyms are never used to introduce a new skill.
 */

export const SYNONYM_DICTIONARY = {
  // ---- Supply chain & operations -------------------------------------------
  procurement: ['purchasing', 'sourcing', 'buying', 'vendor management', 'supplier management', 'procure to pay'],
  'supply chain': ['supply chain management', 'scm', 'logistics network', 'end-to-end supply chain'],
  inventory: ['stock', 'stock control', 'inventory management', 'inventory control', 'on-hand inventory', 'sku management'],
  'demand planning': ['demand forecasting', 'sales and operations planning', 's&op', 'forecast accuracy', 'sop planning', 'demand management'],
  forecasting: ['demand forecasting', 'statistical forecasting', 'forecast modelling', 'forecast accuracy', 'demand planning'],
  'supply planning': ['supply planning', 'materials planning', 'supply and demand planning'],
  distribution: ['logistics', 'dispatch', 'distribution planning', 'fulfilment', 'fulfillment', 'warehousing', 'transportation'],
  warehousing: ['warehouse operations', 'warehouse management', 'storage operations', 'wms', 'fulfilment', 'fulfillment'],
  logistics: ['transportation', 'dispatch', 'freight', 'shipment management', 'last mile', 'fleet management'],
  'order management': ['order fulfilment', 'order fulfillment', 'order processing', 'order to cash'],
  'inventory optimization': ['inventory optimisation', 'stock optimization', 'inventory reduction', 'working capital reduction', 'inventory turns'],
  replenishment: ['replenishment planning', 'cycle counting', 'stock replenishment', 'automatic replenishment'],
  'vendor management': ['supplier management', 'supplier relationship management', 'srm', 'vendor development'],
  'continuous improvement': ['process improvement', 'kaizen', 'lean', 'six sigma', 'process optimisation', 'process optimization'],
  lean: ['lean manufacturing', 'lean operations', 'waste reduction', 'value stream mapping'],
  'six sigma': ['dmaic', 'process improvement', 'quality improvement', 'root cause analysis'],
  'root cause analysis': ['problem solving', 'troubleshooting', 'issue resolution', 'rca'],
  'material planning': ['mrp', 'materials requirements planning', 'production planning'],
  'production planning': ['capacity planning', 'production scheduling', 'shop floor planning'],
  'route to market': ['channel strategy', 'distribution channels', 'go-to-market'],
  'store operations': ['retail operations', 'store management', 'shop floor operations', 'branch operations'],
  merchandising: ['visual merchandising', 'category management', 'assortment planning', 'range planning'],
  'category management': ['assortment planning', 'range planning', 'category performance'],

  // ---- Business intelligence / analytics -----------------------------------
  'power bi': ['powerbi', 'microsoft power bi', 'power bi desktop', 'bi reporting', 'powerbi reports'],
  'business intelligence': ['bi', 'reporting', 'analytics', 'data visualization', 'data visualisation', 'dashboards'],
  tableau: ['tableau desktop', 'tableau reports', 'tableau dashboards', 'tableau server'],
  'excel': ['microsoft excel', 'advanced excel', 'excel models', 'pivot tables', 'vlookup', 'spreadsheets'],
  'sql': ['t-sql', 'pl/sql', 'sql queries', 'sql reporting', 'ansi sql'],
  reporting: ['dashboards', 'kpi reporting', 'report generation', 'periodic reporting', 'management reporting'],
  'forecasting models': ['statistical models', 'predictive models', 'scenario models', 'what-if models'],
  kpis: ['key performance indicators', 'performance metrics', 'kpi tracking', 'metrics tracking'],
  'data analysis': ['data analytics', 'analytics', 'quantitative analysis', 'data interpretation'],

  // ---- ERP / systems -------------------------------------------------------
  sap: ['sap erp', 'sap modules', 'sap transactions'],
  'sap s/4hana': ['s/4hana', 'sap s4hana', 's4hana', 'sap s/4 hana', 'sap simple finance', 'sap ewm', 'sap ibp'],
  erp: ['enterprise resource planning', 'erp systems', 'erp implementation'],
  'sap mm': ['materials management', 'sap materials management', 'procurement module'],
  'sap sd': ['sales and distribution', 'sap order management', 'sap delivery management'],
  'sap fi': ['financial accounting', 'sap finance', 'sap controlling'],
  'sap bw': ['business warehouse', 'sap bw reporting', 'sap bw queries'],
  'sap pm': ['plant maintenance', 'sap maintenance'],

  // ---- Finance -------------------------------------------------------------
  budgeting: ['budget planning', 'financial planning', 'cost planning', 'budgeting process'],
  forecasting_: ['financial forecasting', 'budget forecasting', 'variance analysis'],
  'variance analysis': ['budget variance', 'cost variance', 'variance tracking'],
  reconciliation: ['account reconciliation', 'financial reconciliation', 'balance reconciliation'],
  'cost control': ['cost management', 'cost reduction', 'spend management'],
  audit: ['internal audit', 'external audit', 'audit support', 'compliance audit'],
  compliance: ['regulatory compliance', 'policy compliance', 'statutory compliance'],
  'internal controls': ['control environment', 'segregation of duties', 'control processes'],
  'cost saving': ['cost reduction', 'cost savings', 'savings realisation', 'savings realization'],

  // ---- Technology ----------------------------------------------------------
  'supply chain management system': ['scm system', 'supply chain software', 'supply chain platform'],
  'sap mm module': ['materials management module', 'sap mm'],
  wms: ['warehouse management system', 'warehouse systems', 'wms module'],
  tms: ['transportation management system', 'transport management system'],
  'itil': ['information technology infrastructure library', 'itil framework'],
  agile: ['agile methodology', 'scrum', 'kanban', 'agile delivery'],
  'change management': ['organizational change', 'change initiatives', 'adoption management'],
  'process mapping': ['process documentation', 'value stream mapping', 'as is to be mapping'],
  automation: ['process automation', 'workflow automation', 'rpa', 'robotic process automation'],

  // ---- Soft skills (mild, meaning-preserving) ------------------------------
  leadership: ['team leadership', 'people leadership', 'leading teams', 'line management'],
  'stakeholder management': ['stakeholder engagement', 'customer engagement', 'client management'],
  communication: ['communication skills', 'written communication', 'verbal communication', 'presentation skills'],
  'team work': ['teamwork', 'collaboration', 'cross functional collaboration', 'cross-functional work'],
  mentoring: ['coaching', 'coaching and mentoring', 'developing teams', 'talent development'],
  'problem solving': ['analytical thinking', 'issue resolution', 'troubleshooting', 'critical thinking'],
  'time management': ['prioritisation', 'prioritization', 'planning and prioritisation', 'deadline management'],
  negotiation: ['supplier negotiation', 'commercial negotiation', 'contract negotiation', 'vendor negotiation'],
  presentation: ['presentations', 'presenting', 'business presentations'],

  // ---- Generic office ------------------------------------------------------
  'document control': ['document management', 'records management', 'version control'],
  'report writing': ['report preparation', 'reporting writing', 'writing reports'],
  'data cleaning': ['data cleansing', 'data preparation', 'data wrangling'],
  'data migration': ['system migration', 'data transfer', 'legacy migration'],
};

/** Soft-skill vocabulary that is safe to recognise but must never be *added* to a skills list. */
export const SOFT_SKILL_TERMS = new Set([
  'leadership', 'communication', 'teamwork', 'team work', 'collaboration', 'mentoring',
  'problem solving', 'problem-solving', 'time management', 'negotiation', 'presentation',
  'adaptability', 'attention to detail', 'critical thinking', 'creativity', 'decision making',
  'delegation', 'empathy', 'initiative', 'multitasking', 'ownership', 'resilience',
  'stakeholder management', 'work ethic', 'interpersonal skills', 'organisational skills',
  'organizational skills', 'self starter', 'team player', 'conflict resolution',
]);

/** Certifications recognised by the local JD engine. Used only for *reporting*. */
export const KNOWN_CERTIFICATION_HINTS = [
  ['cpa', 'certified public accountant'],
  ['cma', 'certified management accountant'],
  ['acca', 'chartered certified accountant'],
  ['cfa', 'chartered financial analyst'],
  ['pmp', 'project management professional'],
  ['six sigma', 'six sigma certification'],
  ['lean', 'lean certification'],
  ['six sigma black belt', 'six sigma black belt'],
  ['apics', 'apics certification'],
  ['cpim', 'certified in production and inventory management'],
  ['cscp', 'certified supply chain professional'],
  ['cissp', 'certified information systems security professional'],
  ['comptia a+', 'comptia a+'],
  ['comptia security+', 'comptia security+'],
  ['netplus', 'comptia netplus'],
  ['ccna', 'cisco certified network associate'],
  ['ccie', 'cisco certified internetwork expert'],
  ['aws certified', 'aws certification'],
  ['azure', 'microsoft azure certification'],
  ['sc-300', 'power bi analyst associate'],
  ['pl-300', 'power bi data analyst'],
  ['sc-200', 'power platform functional consultant'],
  ['pmi', 'project management institute'],
  ['scrum master', 'professional scrum master'],
  ['safe', 'scaled agile framework'],
  ['iso 9001', 'iso 9001'],
  ['cecs', 'continuing education credits'],
];

export const getSynonyms = (term) => {
  const key = String(term || '').trim().toLowerCase();
  if (!key) return [];
  if (SYNONYM_DICTIONARY[key]) return SYNONYM_DICTIONARY[key];
  // try singular / plural normalisation
  const singular = key.replace(/s$/, '');
  if (SYNONYM_DICTIONARY[singular]) return SYNONYM_DICTIONARY[singular];
  return [];
};

export default SYNONYM_DICTIONARY;
