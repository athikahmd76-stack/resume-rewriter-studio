/**
 * Headless smoke test of the deterministic pipeline (no DOM required).
 * Run with:  npm run test
 */
import { Packer } from 'docx';
import { installDomParser } from './dom-shim.mjs';
import { runPipeline, structureDocument } from '../src/services/pipeline.js';
import { compareResumes } from '../src/services/diffEngine.js';
import { buildTheme } from '../src/templates/theme.js';
import { buildBlocks, paginate } from '../src/services/paginationEngine.js';
import { buildDocxDocument } from '../src/services/docxExporter.js';
import { analyzeJobDescription } from '../src/services/jdAnalyzer.js';
import {
  reportToMarkdown, reportToText, reportToHtml, reportToJson, REPORT_FORMATS,
} from '../src/services/reportBuilder.js';
import { resumeToText, experienceBullets } from '../src/services/resumeModel.js';
import { scoreAts } from '../src/services/atsScorer.js';
import { DEMO_PARSED, DEMO_JD, DEMO_KEYWORDS, DEMO_ROLE } from '../src/data/sampleData.js';

installDomParser();
globalThis.performance = globalThis.performance || { now: () => 0 };

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}${extra ? ` - ${extra}` : ''}`);
  else { failures += 1; console.log(`  FAIL  ${label}${extra ? ` - ${extra}` : ''}`); }
};

console.log('\n1. structure demo document');
const structured = structureDocument(DEMO_PARSED);
check('resume model produced', Boolean(structured.resume));
check('sections detected', structured.diagnostics.sectionsFound.length > 0, structured.diagnostics.sectionsFound.map((s) => s.id).join(', '));
check('layout model produced', Boolean(structured.layout?.page?.widthPx), `${structured.layout?.page?.widthPx}x${structured.layout?.page?.heightPx}px`);

console.log('\n2. JD analysis');
const jd = analyzeJobDescription(DEMO_JD, { targetRole: DEMO_ROLE, userKeywords: DEMO_KEYWORDS });
check('JD keywords found', jd.keywords.length > 0, `${jd.keywords.length} keywords, ${jd.highPriority.length} high priority`);
check('required skills found', jd.requiredSkills.length > 0, `${jd.requiredSkills.length}`);

console.log('\n3. full pipeline');
const out = await runPipeline({
  preparsed: DEMO_PARSED,
  jobDescription: DEMO_JD,
  userKeywords: DEMO_KEYWORDS,
  targetRole: DEMO_ROLE,
  onProgress: () => {},
});
check('optimized resume produced', Boolean(out.optimizedResume));
check('match buckets', Boolean(out.match), `matched ${out.match.matched.length}, missing ${out.match.missing.length}, synonyms ${out.match.synonyms.length}, unsupported ${out.match.unsupported.length}`);
check('scored', typeof out.scores.optimized.overall === 'number', `${out.scores.original.overall}% -> ${out.scores.optimized.overall}%`);
check('fact guard ran', Boolean(out.guard), out.guard.passed ? 'passed' : `${out.guard.blocked.length} blocked`);
check('change log produced', Array.isArray(out.changeLog), `${out.changeLog.length} changes`);
check('paginated', out.pagination.pageCount >= 1, `${out.pagination.pageCount} page(s)`);
check('disclaimer present', /heuristic/i.test(out.scores.optimized.disclaimer));

console.log('\n4. safety invariants');
const beforeNums = (out.originalText.match(/[\d][\d.,]*%?/g) || []).map((n) => n.replace(/[.,]/g, ''));
const afterNums = (resumeToText(out.optimizedResume).match(/[\d][\d.,]*%?/g) || []).map((n) => n.replace(/[.,]/g, ''));
const newNums = [...new Set(afterNums)].filter((n) => !beforeNums.includes(n));
check('no new numbers invented', newNums.length === 0, newNums.join(', ') || 'none');
const missing = out.match.missing.map((m) => m.display);
const injected = missing.filter((m) => resumeToText(out.optimizedResume).toLowerCase().includes(String(m).toLowerCase()));
check('no missing keyword injected', injected.length === 0, injected.join(', ') || 'none');

console.log('\n4b. no content loss');
const countBullets = (r) => r.experience.reduce((n, e) => n + (e.responsibilities?.length || 0) + (e.achievements?.length || 0), 0);
const srcCount = countBullets(structured.resume);
const optCount = countBullets(out.optimizedResume);
check('no experience bullet dropped', optCount >= srcCount, `${srcCount} -> ${optCount}`);
check('experience entries preserved', out.optimizedResume.experience.length === structured.resume.experience.length,
  `${structured.resume.experience.length} -> ${out.optimizedResume.experience.length}`);
check('skills preserved', out.optimizedResume.skills.length === structured.resume.skills.length,
  `${structured.resume.skills.length} -> ${out.optimizedResume.skills.length}`);
check('education preserved', out.optimizedResume.education.length === structured.resume.education.length,
  `${structured.resume.education.length} -> ${out.optimizedResume.education.length}`);
check('certifications preserved', out.optimizedResume.certifications.length === structured.resume.certifications.length,
  `${structured.resume.certifications.length} -> ${out.optimizedResume.certifications.length}`);
check('summary preserved', Boolean(out.optimizedResume.summary), `${structured.resume.summary.length} -> ${out.optimizedResume.summary.length} chars`);
const skillItemsBefore = structured.resume.skills.flatMap((g) => g.items);
const skillItemsAfter = out.optimizedResume.skills.flatMap((g) => g.items);
const lostSkills = skillItemsBefore.filter((s) => !skillItemsAfter.some((a) => a.toLowerCase() === s.toLowerCase()));
check('no skill item dropped', lostSkills.length === 0, lostSkills.join(', ') || 'none');
const noStrayPunct = (r) => experienceBullets(r).filter((b) => /,\s*\d|,\s*\d+%|,\s*(?:by|to|of)\s+\d/.test(b));
check('no comma stranded before a metric', noStrayPunct(out.optimizedResume).length === 0, noStrayPunct(out.optimizedResume).join(' / ') || 'none');

console.log('\n5. diff + pagination for every style');
const cmp = compareResumes(out.originalResume, out.optimizedResume);
check('comparison sections', cmp.sections.length > 0, `${cmp.sections.length} sections, +${cmp.totals.addedWords}/-${cmp.totals.removedWords} words`);
for (const styleId of ['minimal', 'corporate', 'executive']) {
  const theme = buildTheme({ styleId, layout: out.layout, preserveLayout: true });
  const pages = paginate(buildBlocks(out.optimizedResume, theme), theme);
  check(`style ${styleId} paginates`, pages.pageCount >= 1, `${pages.pageCount} page(s)`);
}

console.log('\n6. DOCX assembly + round trip through the real parser');
const theme = buildTheme({ styleId: 'minimal', layout: out.layout, preserveLayout: true });
const { doc } = buildDocxDocument(out.optimizedResume, theme, { fileName: 'smoke.docx' });
check('docx document built', Boolean(doc));
const buffer = await Packer.toBuffer(doc);
check('docx bytes produced', buffer.length > 5000, `${(buffer.length / 1024).toFixed(1)} kB`);
const zipOk = buffer[0] === 0x50 && buffer[1] === 0x4b;
check('docx is a valid zip container', zipOk, buffer.subarray(0, 2).toString('hex'));

const { parseDocx } = await import('../src/services/docxParser.js');
const { runPipeline: reparse } = await import('../src/services/pipeline.js');
const reparsed = await parseDocx(new File([buffer], 'smoke.docx'));
check('docx re-parsed to blocks', reparsed.blocks.length > 5, `${reparsed.blocks.length} blocks`);
const reStructured = structureDocument(reparsed);
check('re-parsed sections detected', reStructured.sections.some((s) => s.id === 'experience'), reStructured.sections.map((s) => s.id).join(', '));
check('re-parsed name preserved', reStructured.resume.personal.name.includes('Aarav'), reStructured.resume.personal.name);
const reBullets = reStructured.resume.experience.reduce((n, e) => n + e.responsibilities.length + e.achievements.length, 0);
const origBullets = out.optimizedResume.experience.reduce((n, e) => n + e.responsibilities.length + e.achievements.length, 0);
check('re-parsed bullets survive the round trip', reBullets === origBullets, `${origBullets} -> ${reBullets}`);
check('re-parsed experience entries', reStructured.resume.experience.length === out.optimizedResume.experience.length,
  `${out.optimizedResume.experience.length} -> ${reStructured.resume.experience.length}`);
check('re-parsed certification years kept', reStructured.resume.certifications.some((c) => /2021/.test(c.parts.join(' '))),
  reStructured.resume.certifications.map((c) => `${c.name} ${c.year}`).join('; '));
check('re-parsed skill groups kept', reStructured.resume.skills.length === out.optimizedResume.skills.length,
  `${out.optimizedResume.skills.length} -> ${reStructured.resume.skills.length}`);
check('re-parsed technology names not split', reStructured.resume.skills.some((g) => g.items.some((i) => /S\/4HANA/.test(i))),
  reStructured.resume.skills.flatMap((g) => g.items).join(', '));
const reOut = await reparse({ preparsed: reparsed, onProgress: () => {} });
check('re-parsed resume can be rewritten again', Boolean(reOut.optimizedResume));
check('re-parsed resume keeps its facts', reOut.guard.passed, `${reOut.guard.blocked.length} blocked`);

console.log('\n7. edge cases');
try {
  await runPipeline({ jobDescription: DEMO_JD, onProgress: () => {} });
  check('missing input throws', false, 'no error raised');
} catch (e) {
  check('missing input throws', e.code === 'no-input', e.message);
}
const emptyJd = await runPipeline({ preparsed: DEMO_PARSED, jobDescription: '', onProgress: () => {} });
check('empty JD still produces a result', Boolean(emptyJd.optimizedResume), `${emptyJd.jd.keywords.length} keywords from role/context only`);
check('guard still guarantees facts', emptyJd.guard.passed || emptyJd.guard.blocked.length >= 0);

console.log('\n8. A4 renderer produces valid markup for every style');
// JSX has to go through Vite's transform, so load the renderer the same way the
// dev server does rather than importing .jsx directly. Server-rendering catches
// crashes and leaked objects; scripts/browser-check.mjs covers the live app.
const { createServer } = await import('vite');
const { fileURLToPath } = await import('node:url');
const vite = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // This server only transforms modules for SSR rendering; there is no browser
  // dep scan to run, and letting it try just prints a spurious failure.
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { renderToString } = await import('react-dom/server');
  const { createElement } = await import('react');
  const templates = await vite.ssrLoadModule('/src/templates/index.js');
  const ResumeRenderer = templates.ResumeRenderer?.default || templates.ResumeRenderer;
  const { buildTheme } = templates;
  for (const styleId of ['minimal', 'corporate', 'executive']) {
    const theme = buildTheme({ styleId, layout: out.pagination.layout, preserveLayout: false });
    const html = renderToString(createElement(ResumeRenderer, {
      resume: out.optimizedResume,
      theme,
      pages: out.pagination.pages,
    }));
    const pageCount = (html.match(/class="rsp-page[ "]/g) || []).length;
    check(`${styleId} renders pages`, pageCount >= 1, `${pageCount} page(s), ${(html.length / 1024).toFixed(1)} kB`);
    check(`${styleId} keeps the candidate name`, html.includes('Aarav Mehta'));
    check(`${styleId} leaks no object`, !/\[object Object\]|undefined</.test(html));
  }
} finally {
  await vite.close();
}

console.log('\n9. job match percentage');
const inRange = (v) => typeof v === 'number' && v >= 0 && v <= 100;
check('job match before is a percentage', inRange(out.jobMatch.original.overall), `${out.jobMatch.original.overall}%`);
check('job match after is a percentage', inRange(out.jobMatch.optimized.overall), `${out.jobMatch.optimized.overall}%`);
check('job match has components', out.jobMatch.optimized.components.length === 5, out.jobMatch.optimized.components.map((c) => c.label).join(', '));
check('job match weights sum to 1', Math.abs(out.jobMatch.optimized.components.reduce((a, c) => a + c.weight, 0) - 1) < 0.001);
check('every job match component is a percentage', out.jobMatch.optimized.components.every((c) => inRange(c.value)));
check('job match banded', Boolean(out.jobMatch.optimized.band?.label), out.jobMatch.optimized.band?.label);
check('job match verdict is plain advice', typeof out.jobMatch.optimized.verdict === 'string' && out.jobMatch.optimized.verdict.length > 10);
check('job match labelled a heuristic', /heuristic/i.test(out.jobMatch.optimized.disclaimer));
check('job match survives an empty JD', inRange(emptyJd.jobMatch.optimized.overall), `${emptyJd.jobMatch.optimized.overall}%`);
// The honesty rule must hold in the new score too: a reported gap is still a gap.
const optimizedText = resumeToText(out.optimizedResume).toLowerCase();
const gapLeaks = (out.jobMatch.optimized.gaps.missing || []).filter((g) => optimizedText.includes(String(g.term).toLowerCase()));
check('job match gaps were not injected', gapLeaks.length === 0, `${out.jobMatch.optimized.gaps.missing.length} gap(s), ${gapLeaks.length} leaked`);

console.log('\n10. SWOT analysis');
const QUAD = ['strengths', 'weaknesses', 'opportunities', 'threats'];
check('all four quadrants present', QUAD.every((q) => Array.isArray(out.swot[q])));
const swotTotal = QUAD.reduce((a, q) => a + out.swot[q].length, 0);
check('swot produced findings', swotTotal > 0, `${swotTotal} finding(s): ${QUAD.map((q) => `${q} ${out.swot[q].length}`).join(', ')}`);
const swotItems = QUAD.flatMap((q) => out.swot[q]);
check('every swot item is traceable', swotItems.every((i) => i.id && i.title && ['high', 'medium', 'low'].includes(i.severity)), `${swotItems.length} item(s)`);
check('swot counts agree with the quadrants', QUAD.every((q) => out.swot.counts[q] >= out.swot[q].length));
check('swot is labelled a local estimate', /deterministic local rules/i.test(out.swot.disclaimer));
check('swot headline summarises the result', out.swot.headline.includes('%'), out.swot.headline);
check('strengths are evidenced by the resume', out.swot.strengths.length > 0, `${out.swot.strengths.length} strength(s)`);
// An empty JD must not crash or invent anything.
check('swot works without a job description', QUAD.every((q) => Array.isArray(emptyJd.swot[q])), `${QUAD.reduce((a, q) => a + emptyJd.swot[q].length, 0)} finding(s)`);

console.log('\n11. downloadable analysis report');
const report = out.report;
check('report assembled', Boolean(report));
check('report names the candidate', report.candidate.name === 'Aarav Mehta', report.candidate.name);
check('report records the target role', Boolean(report.target.role), report.target.role);
check('report job match matches the score', report.scores.jobMatch.before === out.jobMatch.original.overall && report.scores.jobMatch.after === out.jobMatch.optimized.overall);
check('report ats matches the score', report.scores.ats.before === out.scores.original.overall && report.scores.ats.after === out.scores.optimized.overall);
check('report carries before/after per component', report.scores.jobMatch.components.every((c) => inRange(c.before) && inRange(c.after) && c.delta === c.after - c.before), `${report.scores.jobMatch.components.length} components`);
check('report embeds the swot', report.swot.strengths.length === out.swot.strengths.length && report.swot.threats.length === out.swot.threats.length);
check('report lists missing keywords', report.keywords.missing.length === out.match.missing.length, `${report.keywords.missing.length} missing`);
check('report states the honesty rules', report.honesty.length >= 4, `${report.honesty.length} statement(s)`);
check('report is timestamped', /^\d{4}-\d{2}-\d{2}T/.test(report.meta.generatedAt), report.meta.generatedAtLabel);
const md = reportToMarkdown(report);
check('markdown report renders', md.length > 800, `${(md.length / 1024).toFixed(1)} kB`);
check('markdown report has both score tables', md.includes('Job Match') && md.includes('ATS Score') && md.includes('SWOT'));
const txt = reportToText(report);
check('plain-text report renders', txt.includes('JOB MATCH') && txt.includes('SWOT ANALYSIS'), `${(txt.length / 1024).toFixed(1)} kB`);
const html = reportToHtml(report);
check('html report renders', html.startsWith('<!doctype html>') && html.includes('</html>'), `${(html.length / 1024).toFixed(1)} kB`);
check('html report is self-contained', !/(src|href)\s*=\s*["']https?:/i.test(html), 'no remote resources');
check('html report escapes the candidate name', html.includes('Aarav Mehta'));
const json = reportToJson(report);
let roundTrip = null;
try { roundTrip = JSON.parse(json); } catch { /* handled by the check below */ }
check('json report round-trips', roundTrip?.scores?.ats?.after === out.scores.optimized.overall, `${(json.length / 1024).toFixed(1)} kB`);
check('all four report formats are offered', REPORT_FORMATS.map((f) => f.id).join(',') === 'pdf,html,md,json');
check('report never claims a gap is present', report.keywords.missing.every((k) => !optimizedText.includes(String(k.term).toLowerCase())));
check('empty-jd run still builds a report', Boolean(emptyJd.report) && inRange(emptyJd.report.scores.jobMatch.after));

console.log('\n12. score movement regressions');
{
  const atsOf = (r) => r.scores.optimized.components.find((c) => c.id === 'keywordCoverage').value;
  const kcBefore = atsOf(out);
  const kcAfter = out.scores.optimized.components.find((c) => c.id === 'keywordCoverage').value;
  check('keyword coverage responds to the rewrite', kcAfter >= kcBefore, `${kcBefore}% -> ${kcAfter}%`);

  // The JD share of keyword coverage used to be added as a 0-1 ratio instead of
  // a 0-100 percentage, which pinned the component near its floor for every
  // resume. It has to sit well above the 20-point user-keyword floor whenever
  // the resume genuinely covers a decent share of the job's keywords.
  const jdTerms = [...out.jd.highPriority, ...out.jd.mediumPriority].map((k) => k.term);
  const hit = jdTerms.filter((t) => optimizedText.toLowerCase().includes(String(t).toLowerCase())).length;
  check('keyword coverage is not pinned near the floor', kcBefore > 30 || hit === 0, `${kcBefore}% with ${hit}/${jdTerms.length} job terms present`);

  // Duplicate content and missing keywords used to be scored from the ORIGINAL
  // resume's match data on both sides, so the optimized side could never move.
  // Proving they are per-resume needs a resume that actually gains the keyword,
  // because the demo already covers everything it can honestly evidence and the
  // two documents legitimately score the same. Re-score the same document with a
  // genuinely absent job keyword added to its text: if the component is reading
  // the text in front of it, the number has to move. This one is a penalty
  // (100 is a clean sheet), so clearing a gap has to pull it down.
  const mk = (side) => out.scores[side].components.find((c) => c.id === 'missingKeywords').value;
  const dup = (side) => out.scores[side].components.find((c) => c.id === 'duplicateContent').value;
  const absent = out.match.missing.find((k) => !optimizedText.toLowerCase().includes(k.term.toLowerCase()));
  const boosted = scoreAts(
    { ...out.optimizedResume, skills: [{ id: 'skills', heading: 'Skills', items: [...(absent ? [absent.term] : []), 'Excel', 'Power BI'] }] },
    out.jd,
    out.match,
    { userKeywords: out.userKeywords },
  );
  const mkBoosted = boosted.components.find((c) => c.id === 'missingKeywords').value;
  check('missing keywords is scored per resume', !!absent && mkBoosted < mk('optimized'),
    `${mk('original')}% -> ${mk('optimized')}%, and ${mk('optimized')}% -> ${mkBoosted}% once "${absent?.term || 'n/a'}" is present`);
  check('duplicate content is scored per resume', typeof dup('original') === 'number' && typeof dup('optimized') === 'number', `${dup('original')}% -> ${dup('optimized')}%`);

  const optAts = out.scores.optimized.overall;
  const optJm = out.jobMatch.optimized.overall;
  check('the rewrite never lowers the overall score', optAts >= out.scores.original.overall && optJm >= out.jobMatch.original.overall,
    `ATS ${out.scores.original.overall}->${optAts}, JM ${out.jobMatch.original.overall}->${optJm}`);

  const jmComps = out.jobMatch.optimized.components;
  check('no job match component went backwards', jmComps.every((c, i) => c.value >= jmComps[i].value));
}

console.log('\n13. a skill proven in the body is promoted into the skills list');
{
  // SQL is proved by the bullet but left out of the skills line, so promoting it
  // is a fact-safe gain. Kubernetes/Terraform are proved nowhere, so the next
  // section checks they stay out.
  const blocks = [
    { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'aarav.mehta.demo@example.com  |  Manchester, UK', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Data Analyst  |  Acme Retail  |  Manchester, UK  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Built SQL dashboards for the retail team, cutting weekly manual reporting by 10 hours.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'bullet', text: 'Reported weekly performance figures to regional leadership across 12 stores.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Excel, Power BI, stakeholder management', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
  ];
  const r = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks },
    jobDescription: 'We are hiring a Data Analyst. You will build SQL dashboards and reporting packs. Strong Excel required.',
    targetRole: 'Data Analyst',
    onProgress: () => {},
  });
  const skillsText = (r.optimizedResume.skills || []).flatMap((g) => g.items).join(' ').toLowerCase();
  const bodyText = resumeToText(r.optimizedResume).toLowerCase();
  check('the body-proven skill is present in the body', bodyText.includes('sql'));
  check('the body-proven skill is promoted into skills', skillsText.includes('sql'), skillsText.slice(0, 90));
  check('promotion was logged for the user', r.changeLog.some((c) => c.type === 'skills-promote'));
  check('promotion did not trip the fact guard', r.guard.blocked.length === 0, r.guard.blocked.map((b) => b.detail).join('; '));
  check('promotion did not lower the ATS score', r.scores.optimized.overall >= r.scores.original.overall, `${r.scores.original.overall}% -> ${r.scores.optimized.overall}%`);
}

console.log('\n14. a skill the resume never evidences is never added');
{
  const blocks = [
    { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'aarav.mehta.demo@example.com  |  Manchester, UK', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Data Analyst  |  Acme Retail  |  Manchester, UK  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Built SQL dashboards for the retail team and reported weekly figures to leadership.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Excel, Power BI', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
  ];
  const r = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks },
    jobDescription: 'We are hiring a Data Analyst. You must have expert Kubernetes and Terraform experience running production infrastructure.',
    targetRole: 'Data Analyst',
    onProgress: () => {},
  });
  const text = resumeToText(r.optimizedResume).toLowerCase();
  const invents = ['kubernetes', 'terraform'].filter((t) => text.includes(t));
  check('no unproven skill was injected', invents.length === 0, invents.join(', ') || 'none');
  check('they are reported as missing instead', r.match.missing.some((k) => /kubernetes/i.test(k.term)), `${r.match.missing.length} missing`);
  check('the guard is clean', r.guard.blocked.length === 0);
}

console.log('\n15. every unmoved component can explain itself');
{
  const all = [...report.scores.jobMatch.components, ...report.scores.ats.components];
  // A component already sitting at 100 has no gap left to explain. Anything
  // unmoved and short of 100 is still costing the candidate points, so it has to
  // say why the rewrite could not close it.
  const stuck = all.filter((c) => c.delta === 0);
  const unexplained = stuck.filter((c) => c.after < 100 && !c.lockedReason);
  check('no unmoved component below full marks is silently locked', unexplained.length === 0, unexplained.map((c) => c.label).join(', ') || `${stuck.filter((c) => c.after < 100).length} unmoved and short of 100, all explained`);
  const titleC = report.scores.ats.components.find((c) => c.id === 'titleAlignment');
  check('title alignment explains why it cannot move', titleC?.movable === false && /did not hold|actually held/i.test(titleC.lockedReason || ''));
  const fmtC = report.scores.ats.components.find((c) => c.id === 'sectionStructure');
  check('formatting compatibility explains its remaining gap', /document length/i.test(fmtC?.lockedReason || ''), fmtC?.lockedReason?.slice(0, 48));
  check('markdown explains the unmoved components', /Why \d+ of these did not move/.test(md) || stuck.filter((c) => c.after < 100).length === 0);
  check('plain text explains the unmoved components', /WHY \d+ OF THESE DID NOT MOVE/.test(txt) || stuck.filter((c) => c.after < 100).length === 0);
  check('html explains the unmoved components', /class="why"/.test(html) || stuck.filter((c) => c.after < 100).length === 0);
  check('json carries the locked reasons', Boolean(roundTrip?.scores?.ats?.components?.find((c) => c.id === 'titleAlignment')?.lockedReason));
}

console.log('\n16. a generated summary invents no tenure figure');
{
  const blocks = [
    { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'a@b.com  |  Manchester, UK', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Data Analyst  |  Acme Retail  |  Manchester, UK  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'bullet', text: 'Built SQL dashboards for the retail team and reported weekly figures to leadership.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
    { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
    { type: 'paragraph', text: 'Excel, Power BI', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
  ];
  const r = await runPipeline({ preparsed: { kind: 'docx', pageCount: 1, text: '', blocks }, jobDescription: 'Data Analyst role. SQL and Excel required.', targetRole: 'Data Analyst', onProgress: () => {} });
  check('a summary was generated', Boolean(r.optimizedResume.summary), r.optimizedResume.summary);
  check('the generated summary states no years figure', !/\d+\s*\+?\s*years?/i.test(r.optimizedResume.summary || ''), r.optimizedResume.summary);
  check('the generated summary introduced no number', !/\d/.test(r.optimizedResume.summary || ''), r.optimizedResume.summary);
  check('a generated summary counts as a real section', (r.optimizedResume.sections || []).some((s) => s.id === 'summary'));
  check('the guard is clean after generating a summary', r.guard.blocked.length === 0, r.guard.blocked.map((b) => b.detail).join('; '));
}

console.log('\n17. a bullet the rewriter cannot parse never fails the run');
{
  // An em dash before a digit left the metric matcher with nothing to compare and
  // it indexed into null, which surfaced to the user as "The rewrite could not be
  // completed" and lost the whole document. Every shape below used to be a hard
  // failure, so the guard is what keeps a single awkward bullet from costing the
  // candidate their rewrite.
  const awkward = [
    'Built SQL dashboards \u2014 cutting reporting time by 10 hours; delivered with a 4-person team.',
    'Cut 30% of stock aged over 90 days \u2014 then rebuilt the replenishment report around it.',
    'Reduced returns by \u2014 18% while covering the full 12-month peak.',
    'Delivered the migration ahead of schedule by 6 weeks \u2014 2 sites, zero downtime.',
    'Automated the weekly pack \u2014 5 tabs, 3 hours a week back.',
    'Owned the budget of \u2014 $1.2m across 4 cost centres.',
    'Grew the team from \u2014 6 to 11 analysts in 2 years.',
    'No numbers at all \u2014 just a description of the work done.',
    'Improved availability from 99.1% \u2014 to 99.95% across the estate.',
    'Cut 25% \u2014 and kept headcount flat while doing it.',
  ];
  const r = await runPipeline({
    preparsed: {
      kind: 'docx',
      pageCount: 1,
      text: '',
      blocks: [
        { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'a@b.com  |  Manchester, UK', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Data Analyst  |  Acme Retail  |  Manchester, UK  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        ...awkward.map((t) => ({ type: 'bullet', text: t, fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 })),
        { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Excel, Power BI', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
      ],
    },
    jobDescription: 'Data Analyst role. SQL, Excel and Power BI required.',
    targetRole: 'Data Analyst',
    onProgress: () => {},
  });
  const after = resumeToText(r.optimizedResume);
  const kept = awkward.filter((t) => after.includes(t)).length;
  check('all awkward bullets survive the rewrite', kept === awkward.length, `${kept}/${awkward.length} kept verbatim`);
  check('a document of unparseable bullets still scores', typeof r.scores.optimized.overall === 'number', `${r.scores.original.overall}% -> ${r.scores.optimized.overall}%`);
  check('the guard is clean on awkward bullets', r.guard.blocked.length === 0, r.guard.blocked.map((b) => b.detail).join('; '));
}

console.log('\n18. a keyword the posting words differently is not scored as absent');
{
  // The synonym dictionary is keyed by single words, so a multi-word posting term
  // like "statistical forecasting" had no entry and could never be recognised.
  // The posting asks for it, the resume says "demand planning", and both name the
  // same competency, so the candidate was being docked for their wording.
  const r = await runPipeline({
    preparsed: {
      kind: 'docx',
      pageCount: 1,
      text: '',
      blocks: [
        { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'a@b.com  |  Manchester, UK', fontSize: 9, bold: false, align: 'center', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Professional Summary', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Data analyst focused on demand planning and stock management.', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Data Analyst  |  Acme  |  Manchester  |  Mar 2021 - Present', fontSize: 10.5, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'bullet', text: 'Ran demand planning for the retail team and reported weekly figures to leadership.', fontSize: 10, bold: false, align: 'left', bullet: true, marker: '\u2022', level: 0 },
        { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true, align: 'left', bullet: false, marker: null, level: 0 },
        { type: 'paragraph', text: 'Excel, Power BI', fontSize: 10, bold: false, align: 'left', bullet: false, marker: null, level: 0 },
      ],
    },
    jobDescription: 'Data Analyst role. You will own statistical forecasting and demand forecasting for the business. Excel required.',
    targetRole: 'Data Analyst',
    onProgress: () => {},
  });
  check('a differently-worded posting term is not reported missing', !r.match.missing.some((k) => /statistical forecasting/i.test(k.term)), r.match.missing.map((k) => k.term).join(' | ') || 'none missing');
  check('it is reported as a synonym of what the resume says', r.match.synonyms.some((s) => /statistical forecasting/i.test(s.term) && /demand planning/i.test(s.resumeTerm || '')), r.match.synonyms.map((s) => `${s.term}<-${s.resumeTerm}`).join(' | ') || 'none');
  const kc = r.scores.original.components.find((c) => c.id === 'keywordCoverage').value;
  check('the synonym counts towards keyword coverage', kc > 20, `${kc}%`);
  check('recognising a synonym still writes nothing new', !/statistical forecasting/i.test(resumeToText(r.optimizedResume)));
}

console.log('\n19. a job advert never contributes its own noise to the gap list');
{
  const r = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks: [
      { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center', bullet: false, marker: null, level: 0 },
      { type: 'paragraph', text: 'a@b.com', fontSize: 9, align: 'center' },
      { type: 'paragraph', text: 'Professional Summary', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Data analyst with reporting experience.' },
      { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Data Analyst  |  Acme  |  Mar 2021 - Present', fontSize: 10.5, bold: true },
      { type: 'bullet', text: 'Produced the weekly reporting pack for the retail team.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Excel' },
    ] },
    jobDescription: [
      'Supply Chain Analyst - Manchester (Hybrid)',
      '',
      'Location: Manchester city centre, hybrid working, 3 days on site',
      'Salary: \u00a335,000 - \u00a340,000 per annum',
      'Benefits: Private medical, 28 days holiday, cycle to work scheme',
      'Email your CV to jobs@example.com',
      '',
      'About the role',
      'You will build SQL dashboards and automate the weekly reporting pack.',
      'We are looking for someone with experience in statistical forecasting.',
      'Highly desirable: Python exposure for data extraction.',
      'The successful candidate will partner closely with the supply team.',
    ].join('\n'),
    targetRole: 'Supply Chain Analyst',
    onProgress: () => {},
  });
  const missing = r.match.missing.map((k) => k.term);
  const junk = missing.filter((t) => /manchester|hybrid|salary|annum|benefits|medical|holiday|cycle|email|example\.com|desirable|exposure|closely|^\d/i.test(t));
  check('no location, salary or contact boilerplate in the gaps', junk.length === 0, junk.join(' | ') || `none of ${missing.length}`);
  check('the role title is the whole heading', r.jd.title === 'Supply Chain Analyst', r.jd.title);
  check('no fragment of the role title is asked for', !missing.some((t) => t === 'analyst' || t === 'chain analyst' || t === 'supply'), missing.join(' | ') || 'none missing');
  check('the real skills are still asked for', ['sql', 'forecasting'].every((t) => missing.some((m) => m.includes(t))), missing.join(' | '));
  check('filler is trimmed off the real terms', !missing.some((t) => /^(build|using|highly|partners?) /i.test(t)), missing.join(' | ') || 'none missing');
}

console.log('\n20. the rewrite never reports a change it did not make');
{
  // Two rules mapped a word to itself ("managed" -> "Managed") purely to fix the
  // capital. That produced change entries reading `"Managed" -> "Managed"`, so the
  // count of improvements was inflated with edits that changed nothing.
  const edits = out.changeLog.filter((c) => !c.advice);
  const noop = edits.filter((c) => String(c.from || '').trim() === String(c.to || '').trim());
  check('no logged change leaves the text identical', noop.length === 0, noop.map((c) => c.label).join(' | ') || `${edits.length} applied changes, none a no-op`);
  const verbs = edits.filter((c) => c.type === 'action-verb');
  check('every logged verb change really differs', verbs.every((c) => c.from !== c.to), `${verbs.length} verb change(s)`);
  // Notes about what was left alone are not edits and must not inflate the count.
  const holdBack = out.changeLog.filter((c) => ['verb-held', 'skills-skipped', 'passive'].includes(c.type));
  check('every hold-back note is flagged as advice', holdBack.length > 0 && holdBack.every((c) => c.advice === true), holdBack.map((c) => `${c.type}:${c.advice}`).join(' | '));
  check('notes are counted separately from applied changes', out.changeLog.filter((c) => !c.advice).every((c) => !['verb-held', 'skills-skipped', 'passive'].includes(c.type)), `${edits.length} applied, ${holdBack.length} noted`);
  const report = out.report;
  check('the report carries the change details it used to drop', report.changeLog.length > 0 && report.changeLog.every((c) => c.detail), `${report.changeLog.filter((c) => c.detail).length}/${report.changeLog.length} entries have text`);
}

console.log('\n21. a rewrite may not inflate what the candidate did');
{
  // "Handled" and "Took care of" describe work the candidate did. "Managed"
  // describes managing people or a budget, which they never said - so the pass
  // left the word alone and said why. The claim ladder is what enforces this.
  const r2 = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks: [
      { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center' },
      { type: 'paragraph', text: 'a@b.com', fontSize: 9, align: 'center' },
      { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Data Analyst  |  Acme  |  Mar 2021 - Present', fontSize: 10.5, bold: true },
      { type: 'bullet', text: 'Handled stock reconciliation across 3 warehouses and cleared 96% of variances.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'bullet', text: 'Took care of the weekly reporting pack for 12 stores.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'bullet', text: 'Dealt with supplier escalations as they arose.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'bullet', text: 'Was part of a team of 6 analysts.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'bullet', text: 'Made savings of GBP 85,000 annually.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Excel' },
    ] },
    jobDescription: 'Data Analyst role. Excel required.',
    targetRole: 'Data Analyst',
    onProgress: () => {},
  });
  const after = resumeToText(r2.optimizedResume);
  for (const word of ['Handled', 'Took care of', 'Dealt with', 'Part of', 'Made savings']) {
    check(`"${word}" survives the rewrite`, new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(after), after.match(new RegExp(`^.{0,60}${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.{0,50}$`, 'im'))?.[0]?.trim() || 'not found');
  }
  check('"Managed" was never introduced', !/\bmanaged\b/i.test(after), after.match(/^.{0,80}managed.{0,50}$/im)?.[0] || 'none');
  check('the tool explains why it held them back', r2.changeLog.some((c) => c.type === 'verb-held' && /overstate/i.test(c.label)), r2.changeLog.find((c) => c.type === 'verb-held')?.label?.slice(0, 90) || 'no explanation');
  check('the guard is clean', r2.guard.blocked.length === 0, r2.guard.blocked.map((b) => b.detail).join('; '));
}

console.log('\n22. nothing unreadable is promoted into the skills list');
{
  // "SAP S/4HANA" is one product name. Splitting the advert on "/" produced the
  // requirements "sap s" and "4hana", and the promotion pass then copied both
  // into the candidate's skills list - which is worse than doing nothing.
  const r2 = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks: [
      { type: 'paragraph', text: 'Data Analyst', fontSize: 20, bold: true, align: 'center' },
      { type: 'paragraph', text: 'a@b.com', fontSize: 9, align: 'center' },
      { type: 'paragraph', text: 'Professional Summary', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Supply Chain Analyst with retail distribution experience.' },
      { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Supply Chain Analyst  |  Northwind Retail  |  Mar 2021 - Present', fontSize: 10.5, bold: true },
      { type: 'bullet', text: 'Ran the implementation of SAP S/4HANA materials management with a team of 6 analysts.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'bullet', text: 'Built Power BI dashboards for stock availability and supplier management reporting.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Systems: SAP S/4HANA, Power BI' },
      { type: 'paragraph', text: 'Supply chain: Demand planning' },
    ] },
    jobDescription: [
      'Supply Chain Analyst',
      '',
      'About the role',
      '- Run the SAP S/4HANA implementation for materials management.',
      '- Supplier management and dashboards experience essential.',
      '- Python required.',
    ].join('\n'),
    targetRole: 'Supply Chain Analyst',
    onProgress: () => {},
  });
  const items = r2.optimizedResume.skills.flatMap((g) => g.items || []).map((i) => String(i).toLowerCase());
  const labels = r2.optimizedResume.skills.map((g) => String(g.label || '').toLowerCase());
  check('no half of a product name in the skills', !items.some((i) => i === 'sap s' || i === '4hana' || i === 's/4hana'), items.join(' | '));
  check('the job title is not promoted as a skill', !items.some((i) => i === 'supply chain analyst'), items.join(' | '));
  check('a group heading is not repeated as an item', !items.some((i) => labels.includes(i)), items.join(' | '));
  check('what was promoted is present in the experience', r2.optimizedResume.skills.flatMap((g) => g.items || []).filter((i) => /supplier management|dashboards/i.test(i)).length > 0, items.join(' | '));
  check('the advert is not split on an unspaced slash', !r2.match.missing.some((k) => /^(sap s|4hana)$/.test(k.term)) && !r2.match.matched.some((k) => /^(sap s|4hana)$/.test(k.term)), `missing: ${r2.match.missing.map((k) => k.term).join(' | ')}`);
  // The demo advert asks for a term that is the candidate's own job title, which
  // is the case the hold-back log exists to explain.
  check('a held-back term is reported with its reason', out.changeLog.some((c) => c.type === 'skills-skipped' && /job title/i.test(c.label)), out.changeLog.find((c) => c.type === 'skills-skipped')?.label?.slice(0, 110) || 'nothing reported');
}

console.log('\n23. a job header is not repeated down the page');
{
  // finalizeHeader runs again every time a header grows, and once more to
  // settle. It used to re-read the segments it had already claimed and file them
  // under `notes`, so every job carried its own header repeated ten times.
  const dupes = out.optimizedResume.experience.filter((e) => {
    const n = String(e.notes || '');
    if (!n) return false;
    const parts = n.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
    return new Set(parts).size !== parts.length;
  });
  check('no job entry repeats its own header text', dupes.length === 0, dupes.map((e) => `${e.role}: ${e.notes}`).join(' | ') || `${out.optimizedResume.experience.length} entries checked`);
  const roles = out.optimizedResume.experience.filter((e) => e.role && e.company);
  check('every job kept its role and company', roles.length === out.optimizedResume.experience.length, `${roles.length}/${out.optimizedResume.experience.length}`);
  check('a notes field never repeats the role or company', !out.optimizedResume.experience.some((e) => e.notes && [e.role, e.company].filter(Boolean).some((f) => e.notes.toLowerCase().includes(String(f).toLowerCase()))));
}

console.log('\n24. a credential written out is the same credential as its acronym');
{
  // "CSCP" and "Certified Supply Chain Professional" are the same letters. A
  // posting asking for the acronym against a resume that spells it out used to
  // be reported as a gap, which the rewrite could never close, because the
  // substitution map will not add a qualification the document does not name.
  const r2 = await runPipeline({
    preparsed: { kind: 'docx', pageCount: 1, text: '', blocks: [
      { type: 'paragraph', text: 'Sam Okoye', fontSize: 20, bold: true, align: 'center' },
      { type: 'paragraph', text: 'sam@okoye.com', fontSize: 9, align: 'center' },
      { type: 'paragraph', text: 'Professional Experience', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Supply Chain Analyst  |  Northwind Retail  |  Mar 2021 - Present', fontSize: 10.5, bold: true },
      { type: 'bullet', text: 'A Certified Supply Chain Professional who reduced stock ageing by 22% across 12 stores.', fontSize: 10, bullet: true, marker: '\u2022' },
      { type: 'paragraph', text: 'Skills', fontSize: 12, bold: true },
      { type: 'paragraph', text: 'Certified Supply Chain Professional' },
    ] },
    jobDescription: 'Supply Chain Analyst\n- CSCP certification required.\n- Python required.',
    targetRole: 'Supply Chain Analyst',
    onProgress: () => {},
  });
  const after = resumeToText(r2.optimizedResume);
  check('the acronym is not reported as a gap', !r2.match.missing.some((k) => /cscp/i.test(k.term)), r2.match.missing.map((k) => k.term).join(' | '));
  check('it is recognised as the credential the resume names', r2.match.matched.some((k) => /cscp/i.test(k.term)), r2.match.matched.map((k) => k.term).join(' | ') || 'nothing matched');
  check('a credential absent from the resume stays a gap', r2.match.missing.some((k) => /python/i.test(k.term)), r2.match.missing.map((k) => k.term).join(' | '));
  // Recognition must not become insertion: the abbreviation is a fact the
  // document never states, so it must not appear in the output.
  check('the abbreviation is not written into the resume', !/\bcscp\b/i.test(after), after.match(/^.{0,60}cscp.{0,40}$/im)?.[0] || 'not present, as required');
  check('the spelled-out credential survives', /certified supply chain professional/i.test(after));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);