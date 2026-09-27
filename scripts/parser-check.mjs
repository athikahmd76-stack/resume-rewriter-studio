/**
 * Layout-matrix parser check.
 *
 *   node scripts/parser-check.mjs
 *
 * Real resumes lay the same facts out in very different ways. This feeds the
 * real-world layouts through the real parsers - once as DOCX in Node, once as
 * PDF in Chrome - and asserts the model that comes out: the right number of
 * jobs, the right role/company/dates on each, wrapped bullet lines joined back
 * onto their bullet, and no section bleeding into another.
 *
 * It then runs the full rewrite on every fixture in both formats, because a job
 * that survives parsing but gets split during the rewrite is the same bug from
 * the user's side.
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { installDomParser } from './dom-shim.mjs';
import { createServer } from 'vite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { FIXTURES, JD, withSurrounds } from './fixtures/layouts.mjs';
import { runPipeline, structureDocument } from '../src/services/pipeline.js';
import { parseDocx } from '../src/services/docxParser.js';
import { resumeToText } from '../src/services/resumeModel.js';

installDomParser();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4333;
let failures = 0;
const fail = (msg) => { failures += 1; console.log(`  FAIL  ${msg}`); };

// ---------------------------------------------------------------------------
// DOCX half
// ---------------------------------------------------------------------------
const SIZE = { name: 40, title: 24, contact: 18, h: 26, sub: 21, role: 23, meta: 19, dates: 19, b: 19, cont: 19, plain: 19 };
const BOLD = new Set(['name', 'title', 'h', 'sub', 'role']);

const buildDocx = async (lines) => {
  const children = lines.map((line) => {
    const size = SIZE[line.t] ?? 19;
    const bold = BOLD.has(line.t);
    if (line.t === 'b') {
      return new Paragraph({ children: [new TextRun({ text: line.text, size })], bullet: { level: 0 } });
    }
    if (line.t === 'cont') {
      // a wrapped line: indented, no marker - exactly what a PDF looks like
      return new Paragraph({ children: [new TextRun({ text: line.text, size })], indent: { left: 720 } });
    }
    const heading = line.t === 'h' ? HeadingLevel.HEADING_2 : line.t === 'sub' ? HeadingLevel.HEADING_3 : undefined;
    return new Paragraph({
      ...(heading ? { heading } : {}),
      children: [new TextRun({ text: line.text, size, bold })],
    });
  });
  return Packer.toBuffer(new Document({ sections: [{ children }] }));
};

/** Compare a parsed model against a fixture's expectations. */
const verify = (label, fixture, resume) => {
  const prefix = `${label} / ${fixture.id}`;
  const expected = fixture.expect.experience;

  if (resume.personal?.name !== 'Priya Raman') fail(`${prefix} - candidate name, got "${resume.personal?.name}"`);
  if (!/98860 11223/.test(resume.personal?.phone || '')) fail(`${prefix} - phone missing, got "${resume.personal?.phone}"`);

  const got = resume.experience || [];
  if (got.length !== expected.length) {
    fail(`${prefix} - ${expected.length} job(s) expected, got ${got.length}: ${JSON.stringify(got.map((e) => `${e.role || '?'} @ ${e.company || '?'} (${e.dates || 'no dates'})`))}`);
  }

  expected.forEach((want, i) => {
    const entry = got[i];
    if (!entry) return;
    const label2 = `${prefix} - job ${i + 1}`;
    if (want.role) {
      const re = want.role instanceof RegExp ? want.role : new RegExp(`^\\s*${String(want.role).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
      if (!re.test(entry.role || '')) fail(`${label2} - role expected ${re} got "${entry.role}"`);
    }
    if (want.company !== undefined) {
      if (want.company === '') {
        if (entry.company) fail(`${label2} - expected no company, got "${entry.company}"`);
      } else {
        const re = want.company instanceof RegExp ? want.company : new RegExp(`\\b${String(want.company).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (!re.test(entry.company || '')) fail(`${label2} - company expected ${re} got "${entry.company}"`);
      }
    }
    if (want.dates !== undefined) {
      if (want.dates === '') {
        if (entry.dates) fail(`${label2} - expected no dates, got "${entry.dates}"`);
      } else if (!want.dates.test(entry.dates || '')) {
        fail(`${label2} - dates expected ${want.dates} got "${entry.dates}"`);
      }
    }
    const bullets = [...(entry.responsibilities || []), ...(entry.achievements || [])];
    if (want.bullets !== undefined && bullets.length !== want.bullets) {
      fail(`${label2} - ${want.bullets} bullet(s) expected, got ${bullets.length}: ${JSON.stringify(bullets.map((b) => b.slice(0, 60)))}`);
    }
  });

  const expText = got.map((e) => [...(e.responsibilities || []), ...(e.achievements || [])].join(' | ')).join(' | ');
  (fixture.expect.requireInExperience || []).forEach((needle) => {
    if (!expText.toLowerCase().includes(needle.toLowerCase())) fail(`${prefix} - wrapped text lost: "${needle}"`);
  });
  (fixture.expect.forbiddenInExperience || []).forEach((needle) => {
    if (expText.toLowerCase().includes(needle.toLowerCase())) fail(`${prefix} - foreign text in experience: "${needle}"`);
  });
  if (fixture.expect.projects !== undefined && (resume.projects || []).length !== fixture.expect.projects) {
    fail(`${prefix} - ${fixture.expect.projects} project(s) expected, got ${(resume.projects || []).length}`);
  }
  if (fixture.expect.skillsItems !== undefined) {
    const items = (resume.skills || []).reduce((n, g) => n + (g.items?.length || 0), 0);
    if (items !== fixture.expect.skillsItems) fail(`${prefix} - ${fixture.expect.skillsItems} skill item(s) expected, got ${items}`);
  }
};

const docxResults = [];
console.log('\nDOCX');
for (const fixture of FIXTURES) {
  const buffer = await buildDocx(withSurrounds(fixture.doc));
  const file = new File([new Uint8Array(buffer)], `${fixture.id}.docx`);
  const parsed = await parseDocx(file);
  const { resume } = structureDocument(parsed);
  const before = (resume.experience || []).length;
  verify('docx', fixture, resume);
  const out = await runPipeline({ preparsed: parsed, jobDescription: JD, onProgress: () => {} });
  const after = out.optimizedResume.experience.length;
  if (after !== before) fail(`docx / ${fixture.id} - rewrite changed the job count ${before} -> ${after}`);
  const companies = new Set((resume.experience || []).map((e) => (e.company || '').toLowerCase()).filter(Boolean));
  const outText = resumeToText(out.optimizedResume).toLowerCase();
  companies.forEach((c) => {
    if (!outText.includes(c)) fail(`docx / ${fixture.id} - company "${c}" lost in the rewrite`);
  });
  docxResults.push({ id: fixture.id, jobs: before, ok: true });
  console.log(`  ${before} job(s) - ${fixture.note}`);
}

// ---------------------------------------------------------------------------
// PDF half (same fixtures, real Chrome, real pdf.js)
// ---------------------------------------------------------------------------
console.log('\nPDF');
const server = await createServer({
  root,
  configFile: join(root, 'vite.config.js'),
  logLevel: 'error',
  server: { port: PORT, strictPort: true, host: '127.0.0.1' },
});
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/scripts/fixtures/pdf-probe.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.probeReady === true, null, { timeout: 30000 });
  const results = await page.evaluate(() => window.runAll());
  for (const result of results) {
    const fixture = FIXTURES.find((f) => f.id === result.id);
    if (result.error) {
      fail(`pdf / ${result.id} - threw: ${result.error}`);
      continue;
    }
    verify('pdf', fixture, {
      personal: result.personal,
      // the probe flattens both bullet lists into one; verify only needs the total
      experience: (result.experience || []).map((e) => ({ ...e, responsibilities: e.bullets, achievements: [] })),
      projects: result.projects ? Array.from({ length: result.projects }) : [],
      skills: result.skillsItems ? [{ items: Array.from({ length: result.skillsItems }) }] : [],
    });
    if (result.rewriteJobs !== result.experience.length) {
      fail(`pdf / ${fixture.id} - rewrite changed the job count ${result.experience.length} -> ${result.rewriteJobs}`);
    }
    (result.lostCompanies || []).forEach((c) => fail(`pdf / ${fixture.id} - company "${c}" lost in the rewrite`));
    console.log(`  ${result.experience.length} job(s) - ${fixture.note}`);
  }
  errors.forEach((e) => fail(`pdf probe page error - ${e}`));
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failures === 0 ? `ALL ${FIXTURES.length * 2} LAYOUTS PARSED CORRECTLY` : `${failures} PARSE FAILURE(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
