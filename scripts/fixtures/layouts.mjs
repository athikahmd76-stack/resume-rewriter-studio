/**
 * Real-world resume layouts, shared by the DOCX and PDF parser checks.
 *
 * `doc` is a flat line list, exactly what a parser sees. The line kind only
 * controls formatting (size/bold/indent/marker) so that the parser gets the
 * same signals a real file gives it:
 *
 *   name    candidate name
 *   title   current role under the name
 *   contact contact line
 *   h       section heading
 *   sub     sub-heading inside a section (must never become a job)
 *   role    job title line
 *   meta    company / city / dates line
 *   dates   dates on their own line
 *   b       bullet
 *   cont    wrapped continuation of the bullet above (no marker)
 *   plain   unlabelled body line
 *
 * `expect` states what a correct parser must produce. `bullets` counts
 * responsibilities + achievements of that entry.
 */
export const CANDIDATE = {
  name: 'Priya Raman',
  title: 'Senior Data Engineer',
  contact: 'Bengaluru, India | +91 98860 11223 | priya.raman@example.org',
  summary: 'Data engineer with eight years building batch and streaming pipelines on internal data platforms.',
};

const B = {
  led: 'Led the migration of 40 dashboards to a single metric layer, cutting query cost by 30%.',
  ledWrap: 'Rebuilt the ingestion service so that 2019-era batch jobs and the new streaming path',
  ledWrap2: 'share one contract, which removed 3 hours of manual reconciliation every morning.',
  spark: 'Built Spark batch jobs processing 1.2 TB of clickstream data daily into Snowflake.',
  sql: 'Rewrote the sessionisation model in SQL, improving attribution accuracy by 14%.',
  mentored: 'Mentored three engineers through onboarding and first production ownership.',
  intern: 'Built the first reporting pack for store-level margin tracking across 11 stores.',
  freelance: 'Delivered warehouse migrations and dbt models for three mid-market retailers.',
  volunteer: 'Ran a monthly Python workshop for 25 students at a local community college.',
};

const exp = (role, meta, bullets) => [
  { t: 'role', text: role },
  ...(meta ? [{ t: 'meta', text: meta }] : []),
  ...bullets.map((text) => ({ t: 'b', text })),
];

export const FIXTURES = [
  {
    id: 'two-line-header',
    note: 'role on one line, company | city | dates on the next - the most common layout',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      ...exp('Lead Data Engineer', 'Helio Analytics | Bengaluru, India | 2021 - Present', [B.led, B.spark]),
    ],
    expect: {
      experience: [{ role: 'Lead Data Engineer', company: 'Helio Analytics', dates: /2021/, bullets: 2 }],
    },
  },
  {
    id: 'one-line-header',
    note: 'everything on a single line separated by pipes',
    doc: [
      { t: 'h', text: 'WORK EXPERIENCE' },
      ...exp('Data Engineer | Northgate Retail | Pune, India | 2018 - 2021', null, [B.sql, B.mentored]),
    ],
    expect: {
      experience: [{ role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 2 }],
    },
  },
  {
    id: 'date-on-own-line',
    note: 'role / company, city / Jan 2021 - Present as three separate lines',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Analytics Engineer' },
      { t: 'meta', text: 'Cobalt Retail Labs, Hyderabad' },
      { t: 'dates', text: 'Jan 2021 – Present' },
      { t: 'b', text: B.intern },
    ],
    expect: {
      experience: [{ role: 'Analytics Engineer', company: /Cobalt/, dates: /2021/, bullets: 1 }],
    },
  },
  {
    id: 'wrapped-bullets',
    note: 'long bullets wrap onto a second line with no marker; the wrap holds a year and a role word',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Lead Data Engineer' },
      { t: 'meta', text: 'Helio Analytics | 2021 - Present' },
      { t: 'b', text: B.ledWrap },
      { t: 'cont', text: B.ledWrap2 },
      { t: 'b', text: B.spark },
      { t: 'cont', text: 'Daily, with retries and alerting wired into the scheduler.' },
    ],
    expect: {
      experience: [{ role: 'Lead Data Engineer', company: 'Helio Analytics', dates: /2021/, bullets: 2 }],
      requireInExperience: ['share one contract', 'Daily, with retries'],
    },
  },
  {
    id: 'promotion-same-company',
    note: 'two jobs at one employer - two entries, never merged and never split further',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Senior Data Engineer' },
      { t: 'meta', text: 'Acme Corp | Bengaluru | 2021 - Present' },
      { t: 'b', text: B.led },
      { t: 'role', text: 'Data Engineer' },
      { t: 'meta', text: 'Acme Corp | Bengaluru | 2018 - 2021' },
      { t: 'b', text: B.sql },
    ],
    expect: {
      experience: [
        { role: 'Senior Data Engineer', company: 'Acme Corp', dates: /2021/, bullets: 1 },
        { role: 'Data Engineer', company: 'Acme Corp', dates: /2018/, bullets: 1 },
      ],
    },
  },
  {
    id: 'projects-after-experience',
    note: 'a projects block after the jobs must not turn into jobs',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      ...exp('Data Engineer', 'Northgate Retail | 2018 - 2021', [B.sql]),
      { t: 'h', text: 'PROJECTS' },
      { t: 'role', text: 'Customer 360 platform' },
      { t: 'meta', text: 'Open source | 2022' },
      { t: 'b', text: 'Unified 11 source systems into one profile store.' },
    ],
    expect: {
      experience: [{ role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 1 }],
      projects: 1,
      forbiddenInExperience: ['Customer 360', 'Unified 11 source systems'],
    },
  },
  {
    id: 'skills-mention-role-words',
    note: 'a skills line that contains "Engineering" must not be read as a job',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      ...exp('Data Engineer', 'Northgate Retail | 2018 - 2021', [B.sql]),
      { t: 'h', text: 'SKILLS' },
      { t: 'plain', text: 'Languages: Python, SQL, Scala' },
      { t: 'plain', text: 'Engineering practices: data quality, cost optimisation, incident response' },
    ],
    expect: {
      experience: [{ role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 1 }],
      skillsItems: 6,
      forbiddenInExperience: ['incident response'],
    },
  },
  {
    id: 'no-dates-freelance',
    note: 'a freelance role with no company and no dates is still one job',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Freelance Data Consultant' },
      { t: 'b', text: B.freelance },
    ],
    expect: {
      experience: [{ role: /Freelance/, company: '', dates: '', bullets: 1 }],
    },
  },
  {
    id: 'subheading-inside-experience',
    note: 'a sub-heading is a label, not a job - the job after it is still found',
    doc: [
      { t: 'h', text: 'PROFESSIONAL EXPERIENCE' },
      { t: 'sub', text: 'EARLY CAREER' },
      ...exp('Data Analyst Intern', 'Vertex Retail | 2015 - 2016', [B.intern]),
      { t: 'sub', text: 'ADDITIONAL' },
      { t: 'role', text: 'Volunteer Data Coach' },
      { t: 'b', text: B.volunteer },
    ],
    expect: {
      experience: [
        { role: /Data Analyst Intern/, company: 'Vertex Retail', dates: /2015/, bullets: 1 },
        { role: /Volunteer Data Coach/, company: '', dates: '', bullets: 1 },
      ],
    },
  },
  {
    id: 'company-first-header',
    note: 'company above the role, month-year dates, city on the role line',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'meta', text: 'Helio Analytics' },
      { t: 'role', text: 'Lead Data Engineer, Bengaluru' },
      { t: 'dates', text: 'Jan 2019 – Present' },
      { t: 'b', text: B.led },
    ],
    expect: {
      experience: [{ role: 'Lead Data Engineer', company: 'Helio Analytics', dates: /2019/, bullets: 1 }],
    },
  },
  {
    id: 'no-bullet-glyphs',
    note: 'bullets written as plain paragraphs with no marker - each stays its own line',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Data Engineer' },
      { t: 'meta', text: 'Northgate Retail | 2018 - 2021' },
      { t: 'plain', text: B.led },
      { t: 'plain', text: B.spark },
      { t: 'plain', text: B.sql },
    ],
    expect: {
      experience: [{ role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 3 }],
    },
  },
  {
    id: 'parent-and-child-headings',
    note: 'a parent heading and a child heading for the same section are one section',
    doc: [
      { t: 'h', text: 'PROFESSIONAL EXPERIENCE' },
      ...exp('Lead Data Engineer', 'Helio Analytics | 2021 - Present', [B.led]),
      { t: 'h', text: 'RELEVANT EXPERIENCE' },
      ...exp('Data Engineer', 'Northgate Retail | 2018 - 2021', [B.sql]),
    ],
    expect: {
      experience: [
        { role: 'Lead Data Engineer', company: 'Helio Analytics', dates: /2021/, bullets: 1 },
        { role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 1 },
      ],
    },
  },
  {
    id: 'achievements-are-not-jobs',
    note: 'an awards block after the jobs stays in its own section',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      ...exp('Data Engineer', 'Northgate Retail | 2018 - 2021', [B.sql]),
      { t: 'h', text: 'ACHIEVEMENTS' },
      { t: 'b', text: 'Employee of the year, 2020' },
      { t: 'b', text: 'Best internal hackathon, 2019' },
      { t: 'h', text: 'ADDITIONAL INFORMATION' },
      { t: 'b', text: 'Fluent in English and German' },
    ],
    expect: {
      experience: [{ role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 1 }],
      forbiddenInExperience: ['Employee of the year', 'hackathon'],
    },
  },
  {
    id: 'three-jobs-two-columns-worth-of-noise',
    note: 'a long resume with a mix of header styles, wraps and a year inside a bullet',
    doc: [
      { t: 'h', text: 'EXPERIENCE' },
      { t: 'role', text: 'Lead Data Engineer' },
      { t: 'meta', text: 'Helio Analytics | Bengaluru, India | 2021 - Present' },
      { t: 'b', text: B.led },
      { t: 'cont', text: B.ledWrap },
      { t: 'cont', text: B.ledWrap2 },
      { t: 'b', text: B.spark },
      { t: 'role', text: 'Data Engineer' },
      { t: 'meta', text: 'Northgate Retail | Pune, India' },
      { t: 'dates', text: '2018 - 2021' },
      { t: 'b', text: B.sql },
      { t: 'role', text: 'Analytics Engineer | Cobalt Retail Labs' },
      { t: 'dates', text: '2016 – 2018' },
      { t: 'b', text: B.intern },
    ],
    expect: {
      experience: [
        { role: 'Lead Data Engineer', company: 'Helio Analytics', dates: /2021/, bullets: 2 },
        { role: 'Data Engineer', company: 'Northgate Retail', dates: /2018/, bullets: 1 },
        { role: 'Analytics Engineer', company: 'Cobalt Retail Labs', dates: /2016/, bullets: 1 },
      ],
    },
  },
];

/** A document that wraps one of these fixtures with a header and later sections. */
export const withSurrounds = (fixtureDoc) => [
  { t: 'name', text: CANDIDATE.name },
  { t: 'title', text: CANDIDATE.title },
  { t: 'contact', text: CANDIDATE.contact },
  { t: 'h', text: 'PROFESSIONAL SUMMARY' },
  { t: 'plain', text: CANDIDATE.summary },
  ...fixtureDoc,
  { t: 'h', text: 'EDUCATION' },
  { t: 'plain', text: 'B.Tech, Computer Science - Anna University, 2016' },
];

export const JD = 'Hiring a senior data engineer strong in Airflow, Spark, Snowflake and dbt. You will own data quality.';
