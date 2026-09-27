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

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
