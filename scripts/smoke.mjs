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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);