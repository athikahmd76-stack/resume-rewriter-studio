/**
 * ReportBuilder
 * =============
 * Assembles one plain, serialisable report model out of everything the pipeline
 * already computed, and renders it to the four download formats.
 *
 * Keeping the report as a single plain object matters: the PDF, the HTML, the
 * Markdown and the JSON are all rendered from the *same* model, so the numbers
 * can never disagree between formats, and the JSON is a faithful machine
 * readable record of what the user actually saw on screen.
 *
 * No network, no template engine, no dependency.
 */

import { BUILTIN_STYLES } from '../utils/formattingUtils.js';
import { DEFAULT_SETTINGS } from './resumeRewriter.js';

const APP_NAME = 'Resume Rewriter Studio';
const APP_TAGLINE = 'Local, browser-only resume analysis. No uploads, no backend, no fabrication.';

/* ------------------------------------------------------------------ helpers */

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const signed = (v) => `${num(v) > 0 ? '+' : ''}${num(v)}`;

const fmtDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const fmtDateLabel = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

/** Join a set of before/after component lists into one comparison table. */
const pairComponents = (before, after) => {
  const beforeById = new Map((before || []).map((c) => [c.id, c]));
  return (after || []).map((c) => {
    const b = beforeById.get(c.id);
    return {
      id: c.id,
      label: c.label,
      hint: c.hint,
      weight: c.weight,
      // Carried through so a component that cannot move can say why instead of
      // leaving the reader to assume the rewrite simply did nothing.
      movable: c.movable,
      lockedReason: c.lockedReason,
      before: num(b?.value),
      after: num(c.value),
      delta: num(c.value) - num(b?.value),
    };
  });
};

const candidateOf = (resume) => {
  const p = resume?.personal || {};
  return {
    name: p.name || 'Candidate',
    title: p.title || p.role || '',
    location: p.location || '',
    email: p.email || '',
    phone: p.phone || '',
    links: [p.linkedin, p.portfolio, p.website].filter(Boolean),
  };
};

/* ------------------------------------------------------------- build model  */

/**
 * @param {object} input
 * @param {object} input.result     the full pipeline result
 * @param {object} input.jobMatch   { original, optimized }
 * @param {object} input.swot       buildSwot() output
 * @param {object} [input.context]  { sourceFileName, styleId, isEdited, versionCount }
 */
export const buildReport = ({ result, jobMatch, swot, context = {} } = {}) => {
  if (!result) throw new Error('Nothing to report yet - generate the rewrite first.');

  const resume = result.optimizedResume || {};
  const scores = result.scores || {};
  const match = result.match || {};
  const jd = result.jd || {};
  const guard = result.guard || null;
  const styleId = context.styleId || 'minimal';
  const generatedAt = new Date();

  const atsBefore = num(scores.original?.overall);
  const atsAfter = num(scores.optimized?.overall);
  const jmBefore = num(jobMatch?.original?.overall);
  const jmAfter = num(jobMatch?.optimized?.overall);

  return {
    meta: {
      app: APP_NAME,
      tagline: APP_TAGLINE,
      schema: 'resume-rewriter-studio/report@1',
      generatedAt: fmtDate(generatedAt),
      generatedAtLabel: fmtDateLabel(generatedAt),
      sourceFileName: context.sourceFileName || 'resume',
      styleName: BUILTIN_STYLES[styleId]?.name || 'Professional Minimal',
      preserveLayout: context.preserveLayout !== false,
      edited: Boolean(context.isEdited),
      rewriteMs: num(result.durationMs),
      jdProvided: Boolean(jd.provided),
    },
    candidate: candidateOf(resume),
    target: {
      role: jd.targetRole || jd.title || context.targetRole || 'not set',
      title: jd.title || 'not detected',
      yearsRequested: jd.yearsOfExperience?.[0]?.years || null,
      industries: jd.industries || [],
      requiredSkills: jd.requiredSkills || [],
      preferredSkills: (jd.preferredSkills || []).slice(0, 15),
      certifications: (jd.certifications || []).map((c) => c.term || String(c)),
    },
    headline: swot?.headline || '',
    scores: {
      jobMatch: {
        label: 'Job Match',
        before: jmBefore,
        after: jmAfter,
        delta: jmAfter - jmBefore,
        band: jobMatch?.optimized?.band || null,
        verdict: jobMatch?.optimized?.verdict || '',
        disclaimer: jobMatch?.optimized?.disclaimer || '',
        components: pairComponents(jobMatch?.original?.components, jobMatch?.optimized?.components),
        facts: jobMatch?.optimized?.facts || null,
        gaps: jobMatch?.optimized?.gaps || { missing: [], absentRequired: [], unsupportedCount: 0 },
        matchedTerms: jobMatch?.optimized?.matchedTerms || [],
      },
      ats: {
        label: 'ATS Score',
        before: atsBefore,
        after: atsAfter,
        delta: atsAfter - atsBefore,
        band: scores.optimized?.band || null,
        disclaimer: scores.optimized?.disclaimer || '',
        components: pairComponents(scores.original?.components, scores.optimized?.components),
        metrics: scores.optimized?.metrics || null,
      },
    },
    swot: {
      strengths: swot?.strengths || [],
      weaknesses: swot?.weaknesses || [],
      opportunities: swot?.opportunities || [],
      threats: swot?.threats || [],
      disclaimer: swot?.disclaimer || '',
    },
    keywords: {
      coverage: num(match.summary?.coverage),
      targetsConsidered: num(match.summary?.targetsConsidered),
      matched: (match.matched || []).map(briefKeyword),
      synonyms: (match.synonyms || []).map(briefKeyword),
      missing: (match.missing || []).map(briefKeyword),
      repeated: (match.repeated || []).map((r) => ({ term: r.term, mentions: r.mentions })),
      unsupported: (match.unsupported || []).map(briefKeyword),
    },
    recommendations: (scores.optimized?.recommendations || []).map((r) => ({
      id: r.id, level: r.level, title: r.title, detail: r.detail || '', note: r.note || '',
    })),
    guard: guard
      ? {
        passed: Boolean(guard.passed),
        guarantee: guard.guarantee || '',
        blockedCount: (guard.blocked || []).length,
        blocked: (guard.blocked || []).slice(0, 25),
        issues: (guard.issues || []).slice(0, 25),
      }
      : null,
    changeLog: (result.changeLog || []).slice(0, 60).map((c) => ({
      // The engine emits { type, location, label, advice }; the reports have
      // always been keyed on { kind, section, detail }, which is why every
      // exported report used to list "[edit]" with nothing after it.
      kind: c.advice ? 'note' : (c.kind || c.type || 'edit'),
      section: c.section || c.location || '',
      detail: c.detail || c.label || c.text || '',
    })),
    layout: result.layout
      ? {
        pageSize: result.layout.pageSize,
        orientation: result.layout.orientation,
        columns: result.layout.columns,
        margins: result.layout.margins,
        fidelityNote: result.layout.fidelity?.note || '',
        tables: (result.layout.tables || []).length,
        sectionOrder: (result.layout.sections || []).map((s) => s.id),
      }
      : null,
    settings: { ...DEFAULT_SETTINGS, ...(result.settings || {}) },
    honesty: [
      'Every figure in this report was produced by deterministic rules running in your own browser tab.',
      'No resume, job description or export was uploaded anywhere. No third-party service was contacted.',
      'Keywords listed as missing are NOT in your source resume. They were reported, never inserted.',
      'The ATS score and Job Match are local heuristics, not a real applicant tracking system and not a recruiter decision.',
    ],
  };
};

const briefKeyword = (k) => ({
  term: k.term,
  display: k.display || k.term,
  status: k.status || '',
  priority: k.priority || '',
  category: k.category || '',
  source: k.source || '',
  mentions: num(k.mentions),
  resumeTerm: k.resumeTerm || '',
  locations: k.locations || null,
});

/* ------------------------------------------------------------------ formats */

export const reportToJson = (report) => JSON.stringify(report, null, 2);

const MD_SECTIONS = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
};

export const reportToMarkdown = (report) => {
  const L = [];
  const { meta, scores } = report;

  L.push(`# ${meta.app} - Analysis Report`, '');
  L.push(`_${meta.tagline}_`, '');
  L.push(`**Generated:** ${meta.generatedAtLabel}  `);
  L.push(`**Source document:** ${meta.sourceFileName}  `);
  L.push(`**Target role:** ${report.target.role}  `);
  L.push(`**Style:** ${meta.styleName}${meta.edited ? ' (manually edited)' : ''}  `);
  if (meta.jdProvided) L.push(`**Job description:** analysed locally from the pasted posting.`);
  L.push('');

  L.push('## Headline', '', report.headline || '-', '');

  L.push('## Scores at a glance', '');
  L.push('| Metric | Before | After | Change |', '| --- | --- | --- | --- |');
  L.push(`| **Job Match %** | ${scores.jobMatch.before}% | ${scores.jobMatch.after}% | ${signed(scores.jobMatch.delta)} |`);
  L.push(`| **ATS Score** | ${scores.ats.before}% | ${scores.ats.after}% | ${signed(scores.ats.delta)} |`);
  L.push('');

  for (const key of ['jobMatch', 'ats']) {
    const s = scores[key];
    L.push(`### ${s.label} - before and after`, '');
    L.push('| Component | Before | After | Change |', '| --- | --- | --- | --- |');
    for (const c of s.components) L.push(`| ${c.label} | ${c.before}% | ${c.after}% | ${signed(c.delta)} |`);
    L.push('');
    const stuck = s.components.filter((c) => c.delta === 0 && c.lockedReason);
    if (stuck.length) {
      L.push(`**Why ${stuck.length} of these did not move**`, '');
      for (const c of stuck) {
        L.push(`- **${c.label}** (${c.movable === 'conditional' ? 'evidence-limited' : 'locked'}) - ${c.lockedReason}`);
      }
      L.push('');
    }
    if (s.verdict) L.push(`> ${s.verdict}`, '');
  }

  L.push('## SWOT analysis', '', report.swot.disclaimer, '');
  for (const [key, title] of Object.entries(MD_SECTIONS)) {
    L.push(`### ${title}`);
    const items = report.swot[key];
    if (!items.length) L.push('- Nothing detected by the local rules.');
    else for (const i of items) L.push(`- **${i.title}** (${i.severity}) - ${i.detail}`);
    L.push('');
  }

  L.push('## Keyword analysis', '');
  L.push(`- Coverage: **${report.keywords.coverage}%** (${report.keywords.targetsConsidered} targets considered)`);
  L.push(`- Matched: ${report.keywords.matched.length} | Synonym aligned: ${report.keywords.synonyms.length} | Missing: ${report.keywords.missing.length} | Repeated: ${report.keywords.repeated.length}`);
  L.push('');
  if (report.keywords.missing.length) {
    L.push('### MISSING - NOT FOUND IN SOURCE RESUME', '');
    for (const k of report.keywords.missing) L.push(`- ${k.display} (${k.priority || 'n/a'}) - not added to your resume`);
    L.push('');
  }

  if (report.recommendations.length) {
    L.push('## Recommendations', '');
    for (const r of report.recommendations) L.push(`- **[${r.level}]** ${r.title}${r.detail ? ` - ${r.detail}` : ''}${r.note ? ` _${r.note}_` : ''}`);
    L.push('');
  }

  if (report.guard) {
    L.push('## Fact guard', '');
    L.push(`Status: **${report.guard.passed ? 'passed' : `${report.guard.blockedCount} item(s) blocked`}**`, '');
    if (report.guard.guarantee) L.push(report.guard.guarantee, '');
  }

  if (report.changeLog.length) {
    L.push('## Changes applied', '');
    for (const c of report.changeLog) L.push(`- [${c.kind}] ${c.section ? `${c.section}: ` : ''}${c.detail}`);
    L.push('');
  }

  L.push('## Honesty and privacy', '');
  for (const h of report.honesty) L.push(`- ${h}`);
  L.push('');
  return L.join('\n');
};

export const reportToText = (report) => {
  const rule = '='.repeat(72);
  const thin = '-'.repeat(72);
  const L = [];
  const { meta, candidate, scores } = report;

  L.push(rule);
  L.push(`${meta.app.toUpperCase()} - ANALYSIS REPORT`);
  L.push(rule, '');
  L.push(`Candidate      : ${candidate.name}${candidate.title ? ` (${candidate.title})` : ''}`);
  L.push(`Target role    : ${report.target.role}`);
  L.push(`Source document: ${meta.sourceFileName}`);
  L.push(`Style          : ${meta.styleName}${meta.edited ? ' (manually edited)' : ''}`);
  L.push(`Generated      : ${meta.generatedAtLabel}`);
  L.push(`Rewrite time   : ${meta.rewriteMs} ms (local)`);
  L.push('');

  L.push('SCORES AT A GLANCE', thin);
  L.push(`Job Match %    : before ${scores.jobMatch.before}%  ->  after ${scores.jobMatch.after}%  (${signed(scores.jobMatch.delta)})`);
  L.push(`ATS Score      : before ${scores.ats.before}%  ->  after ${scores.ats.after}%  (${signed(scores.ats.delta)})`);
  L.push('');

  for (const key of ['jobMatch', 'ats']) {
    const s = scores[key];
    L.push(`${s.label.toUpperCase()} - BEFORE AND AFTER`, thin);
    for (const c of s.components) {
      L.push(`  ${c.label.padEnd(28)} ${String(`${c.before}%`).padStart(5)} -> ${String(`${c.after}%`).padStart(5)}  (${signed(c.delta)})`);
    }
    L.push('');
    const stuck = s.components.filter((c) => c.delta === 0 && c.lockedReason);
    if (stuck.length) {
      L.push(`WHY ${stuck.length} OF THESE DID NOT MOVE`, thin);
      for (const c of stuck) {
        L.push(`  [${(c.movable === 'conditional' ? 'EVIDENCE-LIMITED' : 'LOCKED')}] ${c.label}\n      ${c.lockedReason}`);
      }
      L.push('');
    }
  }

  L.push('SWOT ANALYSIS', thin, report.swot.disclaimer, '');
  for (const [key, title] of Object.entries(MD_SECTIONS)) {
    L.push(`${title.toUpperCase()}`);
    const items = report.swot[key];
    if (!items.length) L.push('  Nothing detected by the local rules.');
    else for (const i of items) L.push(`  [${i.severity}] ${i.title}\n      ${i.detail}`);
    L.push('');
  }

  L.push('KEYWORD ANALYSIS', thin);
  L.push(`Coverage ${report.keywords.coverage}% of ${report.keywords.targetsConsidered} targets considered`);
  L.push(`Matched ${report.keywords.matched.length} | Synonym aligned ${report.keywords.synonyms.length} | Missing ${report.keywords.missing.length} | Repeated ${report.keywords.repeated.length}`);
  L.push('');
  if (report.keywords.missing.length) {
    L.push('MISSING - NOT FOUND IN SOURCE RESUME (reported, never added):');
    for (const k of report.keywords.missing) L.push(`  - ${k.display} (${k.priority || 'n/a'})`);
    L.push('');
  }

  if (report.recommendations.length) {
    L.push('RECOMMENDATIONS', thin);
    for (const r of report.recommendations) {
      L.push(`  [${r.level}] ${r.title}`);
      if (r.detail) L.push(`      ${r.detail}`);
      if (r.note) L.push(`      note: ${r.note}`);
    }
    L.push('');
  }

  if (report.guard) {
    L.push('FACT GUARD', thin);
    L.push(`Status: ${report.guard.passed ? 'PASSED' : `${report.guard.blockedCount} item(s) blocked`}`);
    if (report.guard.guarantee) L.push(report.guard.guarantee);
    L.push('');
  }

  if (report.changeLog.length) {
    L.push('CHANGES APPLIED', thin);
    for (const c of report.changeLog) L.push(`  [${c.kind}] ${c.section ? `${c.section}: ` : ''}${c.detail}`);
    L.push('');
  }

  L.push('HONESTY AND PRIVACY', thin);
  for (const h of report.honesty) L.push(`  - ${h}`);
  L.push('', rule);
  return L.join('\n');
};

/** Self-contained printable HTML. No external CSS, no fonts, no scripts. */
export const reportToHtml = (report) => {
  const { meta, candidate, scores, swot } = report;

  const bar = (value) => {
    const v = Math.max(0, Math.min(100, num(value)));
    const tone = v >= 80 ? 'ok' : v >= 60 ? 'mid' : v >= 42 ? 'warn' : 'bad';
    return `<div class="bar" role="img" aria-label="${v} percent"><span class="bar__fill bar__fill--${tone}" style="width:${v}%"></span></div>`;
  };

  const scoreCard = (s) => `
    <section class="card">
      <h3>${esc(s.label)}</h3>
      <div class="score">
        <div class="score__pair">
          <div class="score__cell">
            <span class="score__cap">Before</span>
            <span class="score__num">${s.before}%</span>
            ${bar(s.before)}
          </div>
          <span class="score__arrow" aria-hidden="true">&rarr;</span>
          <div class="score__cell">
            <span class="score__cap">After</span>
            <span class="score__num score__num--after">${s.after}%</span>
            ${bar(s.after)}
          </div>
          <div class="score__delta ${num(s.delta) >= 0 ? 'is-up' : 'is-down'}">${signed(s.delta)} pts</div>
        </div>
        ${s.verdict ? `<p class="verdict">${esc(s.verdict)}</p>` : ''}
        <table class="tbl">
          <thead><tr><th>Component</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
          <tbody>${s.components.map((c) => `
            <tr>
              <td>${esc(c.label)}<span class="hint">${esc(c.hint)}</span>${
  c.delta === 0 && c.lockedReason
    ? `<span class="tag">${c.movable === 'conditional' ? 'Evidence-limited' : 'Locked'}</span><span class="why">${esc(c.lockedReason)}</span>`
    : ''}</td>
              <td class="num">${c.before}%</td>
              <td class="num num--after">${c.after}%</td>
              <td class="num ${num(c.delta) >= 0 ? 'is-up' : 'is-down'}">${signed(c.delta)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </section>`;

  const swotBlock = (items, tone, label) => `
    <div class="quadrant quadrant--${tone}">
      <h4>${esc(label)} <span class="count">${items.length}</span></h4>
      ${items.length
        ? `<ul>${items.map((i) => `<li><strong>${esc(i.title)}</strong><span class="tag tag--${esc(i.severity)}">${esc(i.severity)}</span><p>${esc(i.detail)}</p></li>`).join('')}</ul>`
        : '<p class="empty">Nothing detected by the local rules.</p>'}
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(meta.app)} - Analysis Report - ${esc(candidate.name)}</title>
<style>
  :root {
    --ink:#0f172a; --ink-2:#334155; --muted:#64748b; --line:#e2e8f0; --bg:#f8fafc; --panel:#fff;
    --ok:#15803d; --warn:#b45309; --danger:#b91c1c; --info:#0369a1; --brand:#1d4ed8;
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding:32px 20px 56px; background:var(--bg); color:var(--ink);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  .sheet { max-width: 940px; margin:0 auto; background:var(--panel); border:1px solid var(--line);
           border-radius:16px; padding:36px 34px; box-shadow:0 4px 14px rgba(15,23,42,.07); }
  header.rpt { border-bottom:2px solid var(--ink); padding-bottom:18px; margin-bottom:22px; }
  header.rpt h1 { margin:0 0 4px; font-size:25px; letter-spacing:-.02em; }
  header.rpt p { margin:0; color:var(--muted); font-size:13.5px; }
  .meta { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px 22px; margin-top:16px; font-size:13px; }
  .meta div span { display:block; color:var(--muted); font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; }
  .meta div strong { font-weight:600; }
  h2 { font-size:17px; margin:30px 0 12px; padding-bottom:7px; border-bottom:1px solid var(--line); }
  h3 { font-size:15px; margin:0 0 12px; }
  h4 { font-size:13.5px; margin:0 0 10px; display:flex; align-items:center; gap:8px;
       text-transform:uppercase; letter-spacing:.05em; }
  .card { border:1px solid var(--line); border-radius:12px; padding:18px; margin-bottom:14px; }
  .score__pair { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .score__cell { flex:1 1 190px; min-width:170px; }
  .score__cap { display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.06em; }
  .score__num { display:block; font-size:30px; font-weight:700; letter-spacing:-.02em; line-height:1.2; }
  .score__num--after { color:var(--ok); }
  .score__arrow { font-size:22px; color:var(--muted); }
  .score__delta { font-size:13px; font-weight:700; padding:5px 11px; border-radius:999px; }
  .score__delta.is-up { background:#ecfdf5; color:var(--ok); }
  .score__delta.is-down { background:#fef2f2; color:var(--danger); }
  .bar { height:7px; border-radius:999px; background:#f1f5f9; overflow:hidden; margin-top:6px; }
  .bar__fill { display:block; height:100%; border-radius:999px; }
  .bar__fill--ok { background:#16a34a; } .bar__fill--mid { background:#65a30d; }
  .bar__fill--warn { background:#d97706; } .bar__fill--bad { background:#dc2626; }
  .verdict { margin:14px 0 0; padding:10px 13px; background:var(--bg); border-left:3px solid var(--brand);
             border-radius:0 8px 8px 0; font-size:13.5px; }
  table.tbl { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
  table.tbl th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.05em;
                 color:var(--muted); border-bottom:1px solid var(--line); padding:7px 8px; }
  table.tbl td { padding:8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  table.tbl td.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .num--after { font-weight:700; }
  .is-up { color:var(--ok); } .is-down { color:var(--danger); }
  .hint { display:block; color:var(--muted); font-size:11.5px; margin-top:2px; }
.why { display:block; color:var(--muted-2); font-size:11.5px; margin-top:3px; line-height:1.5; }
.tag {
  display:inline-block; margin-top:5px; padding:1px 6px; border:1px solid var(--line);
  border-radius:999px; background:#f8fafc; color:var(--muted);
  font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
}
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .quadrant { border:1px solid var(--line); border-top-width:3px; border-radius:12px; padding:15px 16px; }
  .quadrant--s { border-top-color:#16a34a; background:#f0fdf4; }
  .quadrant--w { border-top-color:#d97706; background:#fffbeb; }
  .quadrant--o { border-top-color:#1d4ed8; background:#eff6ff; }
  .quadrant--t { border-top-color:#dc2626; background:#fef2f2; }
  .quadrant ul { list-style:none; margin:0; padding:0; }
  .quadrant li { padding:9px 0; border-bottom:1px solid rgba(15,23,42,.06); }
  .quadrant li:last-child { border-bottom:0; padding-bottom:0; }
  .quadrant li p { margin:4px 0 0; font-size:12.8px; color:var(--ink-2); }
  .count { font-size:11px; background:rgba(15,23,42,.08); border-radius:999px; padding:1px 8px; }
  .tag { font-size:10px; text-transform:uppercase; letter-spacing:.05em; border-radius:4px; padding:1px 6px; margin-left:6px; }
  .tag--high { background:#fee2e2; color:#b91c1c; } .tag--medium { background:#fef3c7; color:#b45309; }
  .tag--low { background:#e2e8f0; color:#475569; }
  .empty { color:var(--muted); font-size:12.8px; margin:0; }
  .klist { list-style:none; margin:0; padding:0; columns:2; column-gap:26px; font-size:13px; }
  .klist li { padding:3px 0; break-inside:avoid; }
  .missing li { color:var(--danger); }
  .recs { list-style:none; margin:0; padding:0; }
  .recs li { padding:10px 0; border-bottom:1px solid #f1f5f9; }
  .recs li:last-child { border-bottom:0; }
  .recs p { margin:3px 0 0; font-size:12.8px; color:var(--ink-2); }
  .lvl { font-size:10px; text-transform:uppercase; letter-spacing:.05em; padding:1px 6px; border-radius:4px; margin-right:7px; }
  .lvl--warning { background:#fef3c7; color:#b45309; } .lvl--success { background:#dcfce7; color:#15803d; }
  .lvl--info { background:#e0f2fe; color:#0369a1; }
  .honesty { background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
  .honesty ul { margin:0; padding-left:20px; font-size:13px; color:var(--ink-2); }
  .honesty li { margin-bottom:6px; }
  .disclaimer { font-size:12.5px; color:var(--muted); font-style:italic; margin:0 0 14px; }
  .guard { border-radius:12px; padding:14px 16px; border:1px solid var(--line); background:#f0fdf4; }
  .guard--bad { background:#fef2f2; }
  footer.rpt { margin-top:28px; padding-top:16px; border-top:1px solid var(--line);
               font-size:12px; color:var(--muted); }
  @media (max-width:640px) { .grid2 { grid-template-columns:1fr; } .klist { columns:1; } }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { border:0; box-shadow:none; border-radius:0; padding:0; max-width:none; }
    .card, .quadrant, .honesty, .guard { break-inside:avoid; }
    h2 { break-after:avoid; }
  }
</style>
</head>
<body>
<main class="sheet">
  <header class="rpt">
    <h1>${esc(meta.app)} - Analysis Report</h1>
    <p>${esc(meta.tagline)}</p>
    <div class="meta">
      <div><span>Candidate</span><strong>${esc(candidate.name)}</strong></div>
      <div><span>Target role</span><strong>${esc(report.target.role)}</strong></div>
      <div><span>Source document</span><strong>${esc(meta.sourceFileName)}</strong></div>
      <div><span>Generated</span><strong>${esc(meta.generatedAtLabel)}</strong></div>
      <div><span>Style</span><strong>${esc(meta.styleName)}${meta.edited ? ' (edited)' : ''}</strong></div>
      <div><span>Rewrite time</span><strong>${meta.rewriteMs} ms, local</strong></div>
    </div>
  </header>

  <h2>Headline</h2>
  <p>${esc(report.headline || '-')}</p>

  <h2>Scores - before and after</h2>
  ${scoreCard(scores.jobMatch)}
  ${scoreCard(scores.ats)}
  <p class="disclaimer">${esc(scores.ats.disclaimer)}</p>

  <h2>SWOT analysis</h2>
  <p class="disclaimer">${esc(swot.disclaimer)}</p>
  <div class="grid2">
    ${swotBlock(swot.strengths, 's', 'Strengths')}
    ${swotBlock(swot.weaknesses, 'w', 'Weaknesses')}
    ${swotBlock(swot.opportunities, 'o', 'Opportunities')}
    ${swotBlock(swot.threats, 't', 'Threats')}
  </div>

  <h2>Keyword analysis</h2>
  <p><strong>Coverage ${report.keywords.coverage}%</strong> of ${report.keywords.targetsConsidered} targets considered. Matched ${report.keywords.matched.length}, synonym aligned ${report.keywords.synonyms.length}, missing ${report.keywords.missing.length}, repeated ${report.keywords.repeated.length}.</p>
  ${report.keywords.matched.length ? `<h4>Matched</h4><ul class="klist">${report.keywords.matched.map((k) => `<li>${esc(k.display)}</li>`).join('')}</ul>` : ''}
  ${report.keywords.missing.length ? `<h4>Missing - not found in source resume (never added)</h4><ul class="klist missing">${report.keywords.missing.map((k) => `<li>${esc(k.display)} <em>(${esc(k.priority || 'n/a')})</em></li>`).join('')}</ul>` : ''}

  ${report.recommendations.length ? `<h2>Recommendations</h2><ul class="recs">${report.recommendations.map((r) => `<li><span class="lvl lvl--${esc(r.level)}">${esc(r.level)}</span><strong>${esc(r.title)}</strong>${r.detail ? `<p>${esc(r.detail)}</p>` : ''}${r.note ? `<p>${esc(r.note)}</p>` : ''}</li>`).join('')}</ul>` : ''}

  ${report.guard ? `<h2>Fact guard</h2><div class="guard ${report.guard.passed ? '' : 'guard--bad'}"><strong>${report.guard.passed ? 'Passed' : `${report.guard.blockedCount} item(s) blocked`}</strong>${report.guard.guarantee ? `<p>${esc(report.guard.guarantee)}</p>` : ''}</div>` : ''}

  ${report.changeLog.length ? `<h2>Changes applied (${report.changeLog.length})</h2><ul class="klist">${report.changeLog.map((c) => `<li>[${esc(c.kind)}] ${esc(c.section ? `${c.section}: ` : '')}${esc(c.detail)}</li>`).join('')}</ul>` : ''}

  <h2>Honesty and privacy</h2>
  <div class="honesty"><ul>${report.honesty.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>

  <footer class="rpt">
    ${esc(meta.app)} - ${esc(meta.schema)} - generated ${esc(meta.generatedAt)} entirely in the browser.
    No resume data left this device.
  </footer>
</main>
</body>
</html>`;
};

export const REPORT_FORMATS = [
  {
    id: 'pdf',
    label: 'Report PDF',
    ext: 'pdf',
    mime: 'application/pdf',
    hint: 'Print-ready A4 analysis document with both score sets and the SWOT grid.',
  },
  {
    id: 'html',
    label: 'Report HTML',
    ext: 'html',
    mime: 'text/html;charset=utf-8',
    hint: 'Self-contained styled page you can open, print or archive offline.',
  },
  {
    id: 'md',
    label: 'Report Markdown',
    ext: 'md',
    mime: 'text/markdown;charset=utf-8',
    hint: 'Plain-text report for notes, email or a pull request.',
  },
  {
    id: 'json',
    label: 'Report JSON',
    ext: 'json',
    mime: 'application/json',
    hint: 'Every number in the report as structured data.',
  },
];

export default buildReport;
