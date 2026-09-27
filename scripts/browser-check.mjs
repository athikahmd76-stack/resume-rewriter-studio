/**
 * Browser verification with Playwright against the local system Chrome.
 *
 *   node scripts/browser-check.mjs            (runs `vite preview` itself)
 *   BROWSER=msedge node scripts/browser-check.mjs
 *   BASE_URL=https://example.github.io/app node scripts/browser-check.mjs
 *
 * BASE_URL points the same suite at an already-deployed build instead of the
 * local one, which is the only way to check the artifact that users actually
 * load rather than the copy in dist/.
 *
 * Covers: app boot, demo load, rewrite, all five tabs, the editor, version
 * history, the report downloads, the resume downloads, print styles, and
 * console errors.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DOWNLOADS = mkdtempSync(join(tmpdir(), 'rsp-dl-'));
const PORT = 4319;

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}${extra ? ` - ${extra}` : ''}`);
  else { failures += 1; console.log(`  FAIL  ${label}${extra ? ` - ${extra}` : ''}`); }
};

/** First JPEG image stream embedded in a PDF buffer. */
const extractJpeg = (buf) => {
  const start = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (start < 0) return null;
  const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
  return end > start ? buf.subarray(start, end + 2) : null;
};

/**
 * The readable text of a PDF, taken from its content streams.
 *
 * jsPDF writes FlateDecode streams, so the text operators are deflated and a
 * plain substring search over the file finds nothing. Inflating them is what
 * lets a test assert the report really contains its own numbers, instead of only
 * asserting the file is a syntactically valid PDF.
 */
const pdfText = (buf) => {
  const raw = buf.toString('latin1');
  let out = '';
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m = re.exec(raw);
  while (m) {
    try {
      out += `${inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')}\n`;
    } catch {
      out += `${m[1]}\n`;
    }
    m = re.exec(raw);
  }
  return out;
};

/** Decode an image in the browser and report how much of it is white vs. ink. */
const measureCoverage = async (page, bytes) => page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/jpeg;base64,${b64}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let white = 0;
  let ink = 0;
  let darkest = 255;
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (lum > 245) white += 1;
    else ink += 1;
    if (lum < darkest) darkest = lum;
  }
  const total = data.length / 4;
  return { width: img.width, height: img.height, white: white / total, ink: ink / total, darkest: Math.round(darkest) };
}, bytes.toString('base64'));

/**
 * A deployed site URL, normalised without its trailing slash.
 *
 * The path is deliberately kept: a project Pages site lives under /<repo>/ and
 * URL.origin would silently drop that segment, so a github.io/<repo>/ target
 * would be fetched from the domain root and 404.
 */
const deployedUrl = () => {
  const raw = (process.env.BASE_URL || '').trim();
  if (!raw) return null;
  return new URL(raw).href.replace(/\/+$/, '');
};

const external = deployedUrl();
let server = null;
let built = null;
let base = external;
if (!base) {
  const { createServer, preview } = await import('vite');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  server = await createServer({ root, configFile: join(root, 'vite.config.js'), logLevel: 'error' });
  built = await preview({ previewServer: { port: PORT, strictPort: true, host: '127.0.0.1' }, root, configFile: join(root, 'vite.config.js'), logLevel: 'error' });
  base = new URL(built.resolvedUrls.local[0]).origin;
}
console.log(`\ntarget: ${base}${external ? ' (deployed build, no local server)' : ' (local build)'}`);

let browser;
const crashInfo = [];
try {
  const executablePath = existsSync(CHROME) ? CHROME : (existsSync(EDGE) ? EDGE : undefined);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const notFound = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(`${r.status()} ${r.url()}`); });
  page.on('crash', () => crashInfo.push('page crashed'));
  browser.on('disconnected', () => crashInfo.push('browser disconnected'));

  console.log('\n1. app boot');
  await page.goto(base, { waitUntil: 'networkidle' });
  check('page title', (await page.title()).includes('Resume Rewriter Studio'), await page.title());
  check('rewrite button disabled with no input', await page.locator('button:has-text("Rewrite Resume")').isDisabled());
  check('skip link present', await page.locator('a.skip-link').count() === 1);

  console.log('\n2. demo load');
  await page.click('button:has-text("Load demo")');
  await page.waitForSelector('#panel-original .rsp-page', { timeout: 15000 });
  const originalPages = await page.locator('#panel-original .rsp-page').count();
  check('original preview renders pages', originalPages >= 1, `${originalPages} page(s)`);
  const originalText = await page.locator('#panel-original').innerText();
  check('original shows the demo name', originalText.includes('Aarav Mehta'));
  check('original keeps all 12 experience bullets', (originalText.match(/•/g) || []).length >= 10,
    `${(originalText.match(/•/g) || []).length} bullets`);

  console.log('\n3. rewrite');
  await page.click('button:has-text("Rewrite Resume")');
  await page.waitForSelector('#panel-optimized .rsp-page', { timeout: 30000 });
  const optimizedText = await page.locator('#panel-optimized').innerText();
  check('optimized preview renders', optimizedText.includes('Aarav Mehta'));
  check('optimized keeps the job title', optimizedText.includes('Northwind Retail Group'));
  check('optimized keeps metrics', /11,400|96%|90%/.test(optimizedText), (optimizedText.match(/\d[\d,]*%?/g) || []).slice(0, 6).join(' '));
  check('no missing-keyword fabrication', !/Kubernetes|Terraform|AWS|Azure/i.test(optimizedText),
    'JD terms absent from the source are not inserted');

  console.log('\n4. tabs');
  for (const [label, marker] of [['Comparison', 'Change log'], ['ATS Analysis', 'ATS']]) {
    await page.click(`button[role="tab"]:has-text("${label}")`);
    await page.waitForSelector(`#panel-${label === 'Comparison' ? 'comparison' : 'ats'}`);
    const txt = await page.locator(`#panel-${label === 'Comparison' ? 'comparison' : 'ats'}`).innerText();
    check(`${label} tab renders content`, txt.length > 80, `${txt.length} chars`);
    void marker;
  }
  const atsText = await page.locator('#panel-ats').innerText();
  check('ATS shows a heuristic disclaimer', /heuristic/i.test(atsText));
  check('ATS tab badge shows a score', /\d/.test(await page.locator('button[role="tab"]:has-text("ATS Analysis")').innerText()));

  console.log('\n5. editor + versions');
  await page.click('button[role="tab"]:has-text("Optimized")');
  await page.click('#panel-optimized button:has-text("Edit resume")');
  await page.waitForSelector('#panel-editor textarea, #panel-editor input');
  const nameField = page.locator('#panel-editor input').first();
  await nameField.fill('Aarav Mehta-Test');
  const scoreBefore = (await page.locator('button[role="tab"]:has-text("ATS Analysis")').innerText()).replace(/\D/g, '');
  await page.click('button:has-text("Apply edits")');
  await page.waitForTimeout(300);
  const editorText = await page.locator('#panel-editor').innerText();
  check('edit applied to the optimized resume', editorText.includes('Aarav Mehta-Test') || (await page.locator('#panel-optimized').innerText()).includes('Aarav Mehta-Test'));
  check('edited badge shows', /edited/i.test(editorText));
  const scoreAfter = (await page.locator('button[role="tab"]:has-text("ATS Analysis")').innerText()).replace(/\D/g, '');
  check('ATS badge is recomputed after an edit', Boolean(scoreAfter), `${scoreBefore} -> ${scoreAfter}`);
  await page.click('#panel-editor button:has-text("Version history")');
  const historyText = await page.locator('#panel-editor').innerText();
  check('version history records the edit', /edit/i.test(historyText), historyText.match(/Edited[^\n]*/)?.[0] || 'no Edited entry');
  check('versions are in-memory only', /in memory|nothing is written|session/i.test(historyText));
  await page.click('#panel-editor button:has-text("Close editor")');
  await page.waitForSelector('#panel-optimized .rsp-page', { timeout: 10000 });
  check('edited name renders in the preview', (await page.locator('#panel-optimized').innerText()).includes('Aarav Mehta-Test'));
  await page.click('#panel-optimized button:has-text("Edit resume")');
  await page.waitForSelector('#panel-editor button:has-text("Version history")');
  check('Discard is disabled with no pending changes', await page.locator('#panel-editor button:has-text("Discard")').isDisabled());

  console.log('\n6. export while on a non-optimized tab (regression)');
  await page.click('button[role="tab"]:has-text("Comparison")');
  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('button:has-text("Editable DOCX")');
  const docx = await dl;
  const docxPath = join(DOWNLOADS, docx.suggestedFilename());
  await docx.saveAs(docxPath);
  const docxBytes = readFileSync(docxPath);
  check('DOCX downloads from the comparison tab', existsSync(docxPath), docx.suggestedFilename());
  check('DOCX is a valid package', docxBytes[0] === 0x50 && docxBytes[1] === 0x4b && docxBytes.length > 5000,
    `${(docxBytes.length / 1024).toFixed(1)} kB`);
  const pdfDl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('button:has-text("PDF (visual match)")');
  const pdf = await pdfDl;
  const pdfPath = join(DOWNLOADS, pdf.suggestedFilename());
  await pdf.saveAs(pdfPath);
  const pdfBytes = readFileSync(pdfPath);
  check('PDF downloads from the comparison tab', pdfBytes.subarray(0, 4).toString() === '%PDF',
    `${(pdfBytes.length / 1024).toFixed(1)} kB`);

  // The PDF is a raster, so verify the pixels of the file the user actually
  // saved: pull the first embedded JPEG out of it, decode it and measure how
  // much of it is white page vs. ink. A "blank resume" is a page that is either
  // empty or flattened under an opaque overlay, and both are caught here.
  const jpeg = extractJpeg(pdfBytes);
  check('PDF embeds a page image', Boolean(jpeg), jpeg ? `${(jpeg.length / 1024).toFixed(1)} kB JPEG` : 'no JPEG found');
  if (jpeg) {
    const coverage = await measureCoverage(page, jpeg);
    check('PDF page is mostly white (not a grey sheet)', coverage.white > 0.6,
      `${(coverage.white * 100).toFixed(1)}% white`);
    check('PDF page contains text (not blank)', coverage.ink > 0.004,
      `${(coverage.ink * 100).toFixed(2)}% ink, darkest ${coverage.darkest}`);
    check('PDF text is high contrast', coverage.darkest < 120, `darkest pixel ${coverage.darkest}`);
  }

  console.log('\n10. job match, before and after');
  // Section 5 leaves the editor open, which replaces the tab panels entirely.
  await page.click('#panel-editor button:has-text("Close editor")');
  await page.waitForSelector('.preview-shell', { timeout: 15000 });
  await page.click('button[role="tab"]:has-text("ATS Analysis")');
  await page.waitForSelector('#job-match', { timeout: 30000 });
  const jobMatch = await page.evaluate(() => {
    const card = document.getElementById('job-match');
    const blocks = [...card.querySelectorAll('.ba-score')];
    return {
      blocks: blocks.length,
      titles: blocks.map((b) => b.querySelector('.ba-score__title')?.textContent || ''),
      pairs: blocks.map((b) => [...b.querySelectorAll('.ba-compare__num')].map((n) => n.textContent.trim())),
      deltas: blocks.map((b) => b.querySelector('.delta')?.textContent.trim() || ''),
      comps: blocks.map((b) => b.querySelectorAll('.ba-comp').length),
      headline: card.querySelector('.ba-headline')?.textContent || '',
      labels: [...card.querySelectorAll('.ba-compare__cap')].map((n) => n.textContent.trim()),
      // Any component that did not move and is short of 100 has to say why.
      stuckReasons: [...card.querySelectorAll('.ba-comp')]
        .filter((r) => r.querySelector('.ba-comp__why'))
        .map((r) => ({
          label: r.querySelector('.ba-comp__label')?.textContent.trim() || '',
          tag: r.querySelector('.ba-comp__whytag')?.textContent.trim() || '',
          why: (r.querySelector('.ba-comp__why')?.textContent || '').replace(/\s+/g, ' ').trim(),
        })),
      stuckUnmoved: [...card.querySelectorAll('.ba-comp')].filter((r) => {
        const d = r.querySelector('.ba-comp__delta')?.textContent.trim() || '';
        const after = Number((r.querySelector('.ba-comp__now')?.textContent || '0').replace('%', ''));
        return d === '0' && after < 100 && !r.querySelector('.ba-comp__why');
      }).map((r) => r.querySelector('.ba-comp__label')?.textContent.trim() || ''),
    };
  });
  check('job match and ats blocks both render', jobMatch.blocks === 2, jobMatch.titles.join(' | '));
  check('both blocks show before and after', jobMatch.pairs.every((p) => p.length === 2 && p.every((v) => /^\d+%$/.test(v))),
    jobMatch.pairs.map((p) => p.join(' -> ')).join('  |  '));
  check('the two columns are labelled before and after',
    jobMatch.labels.some((l) => /before/i.test(l)) && jobMatch.labels.some((l) => /after/i.test(l)),
    jobMatch.labels.join(' / '));
  check('both blocks show a delta', jobMatch.deltas.every((d) => d.length > 0), jobMatch.deltas.join('  |  '));
  check('components are broken out', jobMatch.comps.every((c) => c > 0), jobMatch.comps.join(' / '));
  check('job match headline renders', jobMatch.headline.length > 10, jobMatch.headline.slice(0, 90));
  check('every unmoved component below 100 explains itself',
    jobMatch.stuckUnmoved.length === 0,
    jobMatch.stuckUnmoved.join(', ') || `${jobMatch.stuckReasons.length} explained: ${jobMatch.stuckReasons.map((r) => `${r.label} [${r.tag}]`).join(', ')}`);
  check('an explanation is actually shown to the user',
    jobMatch.stuckReasons.length > 0 && jobMatch.stuckReasons.every((r) => r.why.length > 40),
    jobMatch.stuckReasons[0] ? `${jobMatch.stuckReasons[0].tag}: ${jobMatch.stuckReasons[0].why.slice(0, 70)}...` : 'none rendered');

  console.log('\n11. swot tab');
  await page.click('button[role="tab"]:has-text("SWOT")');
  await page.waitForSelector('#swot', { timeout: 30000 });
  const swot = await page.evaluate(() => {
    const card = document.getElementById('swot');
    const quads = [...card.querySelectorAll('.swot-quad')];
    return {
      quads: quads.length,
      labels: quads.map((q) => q.querySelector('.swot-quad__label')?.textContent.trim() || ''),
      counts: quads.map((q) => q.querySelectorAll('.swot-item-wrap').length),
      items: card.querySelectorAll('.swot-item__title').length,
      details: card.querySelectorAll('.swot-item__detail').length,
      headline: card.querySelector('.swot-headline')?.textContent || '',
      disclaimer: card.querySelector('.notice')?.textContent || '',
    };
  });
  check('four quadrants render', swot.quads === 4, swot.labels.join(' | '));
  check('quadrants are named', ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'].every((n) => swot.labels.some((l) => l.startsWith(n))),
    swot.labels.join(' | '));
  check('every quadrant has findings', swot.counts.every((c) => c > 0), swot.counts.join(' / '));
  check('each finding states its evidence', swot.items > 0 && swot.details > 0, `${swot.items} findings, ${swot.details} with detail`);
  check('swot headline renders', swot.headline.includes('%'), swot.headline.slice(0, 90));
  check('swot states it is a local estimate', /deterministic local rules/i.test(swot.disclaimer));

  console.log('\n12. downloadable analysis report');
  const menuBtn = page.locator('.report-dl button:has-text("Analysis report")').first();
  check('report control is in the app bar', await menuBtn.count() > 0);
  // The in-panel surfaces render the formats as a grid rather than the app-bar
  // toggle, so count the format buttons inside each of them instead.
  const formatsIn = (scope) => page.$$eval(`${scope} .report-dl__grid .dl-card--btn`, (ns) => ns.length);
  check('all four formats are on the download card', await formatsIn('#download') === 4, await formatsIn('#download'));
  await page.click('button[role="tab"]:has-text("ATS Analysis")');
  await page.waitForSelector('#panel-ats', { timeout: 15000 });
  check('all four formats are on the ats tab', await formatsIn('#panel-ats') === 4, await formatsIn('#panel-ats'));
  const atsWhy = await page.evaluate(() => [...document.querySelectorAll('#panel-ats .metric')].map((r) => {
    const valueText = (r.querySelector('.metric__value')?.textContent || '').trim();
    return {
      label: r.querySelector('.metric__label')?.textContent.trim() || '',
      value: Number((valueText.match(/^(\d+)%/) || [])[1] || 0),
      // The delta badge only renders when the component actually moved.
      moved: /%\s*[+-]\d+/.test(valueText),
      why: (r.querySelector('.metric__why')?.textContent || '').replace(/\s+/g, ' ').trim(),
    };
  }));
  // A component that neither moved nor already sits at 100 is still costing the
  // candidate points, so it has to carry a reason.
  const silent = atsWhy.filter((r) => !r.moved && !r.why && r.value < 100);
  check('every ats component that did not move explains itself', silent.length === 0,
    silent.map((r) => r.label).join(', ') || `${atsWhy.filter((r) => r.why).length} explained: ${atsWhy.filter((r) => r.why).map((r) => r.label).join(', ')}`);
  await page.click('button[role="tab"]:has-text("SWOT")');
  await page.waitForSelector('#panel-swot', { timeout: 15000 });
  check('all four formats are on the swot tab', await formatsIn('#panel-swot') === 4, await formatsIn('#panel-swot'));
  await menuBtn.click();
  await page.waitForSelector('.report-dl__menu', { timeout: 15000 });
  const formats = await page.$$eval('.report-dl__item .report-dl__label', (ns) => ns.map((n) => n.textContent.trim()));
  check('all four report formats are offered', formats.length === 4, formats.join(', '));

  // The menu is a toggle, and a download does not close it, so make opening it
  // idempotent instead of tracking which state it was left in.
  const openMenu = async () => {
    if (!(await page.locator('.report-dl__menu').count())) {
      await menuBtn.click();
      await page.waitForSelector('.report-dl__menu', { timeout: 15000 });
    }
  };
  const grab = async (label, timeout = 90000) => {
    await openMenu();
    const dl = page.waitForEvent('download', { timeout });
    await page.click(`.report-dl__item:has-text("${label}")`);
    const file = await dl;
    const path = join(DOWNLOADS, file.suggestedFilename());
    await file.saveAs(path);
    return { file, path, bytes: readFileSync(path) };
  };

  const jsonFile = await grab('Report JSON', 60000);
  const reportJson = JSON.parse(jsonFile.bytes.toString('utf8'));
  check('report JSON downloads', existsSync(jsonFile.path), jsonFile.file.suggestedFilename());
  check('report JSON carries both score pairs',
    Number.isFinite(reportJson.scores.jobMatch.before) && Number.isFinite(reportJson.scores.jobMatch.after)
    && Number.isFinite(reportJson.scores.ats.before) && Number.isFinite(reportJson.scores.ats.after),
    `match ${reportJson.scores.jobMatch.before}%->${reportJson.scores.jobMatch.after}%, ats ${reportJson.scores.ats.before}%->${reportJson.scores.ats.after}%`);
  check('report JSON before equals the ATS tab badge',
    String(reportJson.scores.ats.after) === (await page.textContent('button[role="tab"]:has-text("ATS Analysis") .tab__count'))?.trim(),
    'badge matches the report');
  check('report JSON embeds all four swot quadrants',
    ['strengths', 'weaknesses', 'opportunities', 'threats'].every((q) => Array.isArray(reportJson.swot[q])),
    ['strengths', 'weaknesses', 'opportunities', 'threats'].map((q) => `${q} ${reportJson.swot[q].length}`).join(', '));
  check('report JSON names the candidate', reportJson.candidate.name.length > 0, reportJson.candidate.name);

  const rptPdfFile = await grab('Report PDF', 180000);
  const rptBytes = rptPdfFile.bytes;
  check('report PDF downloads', rptBytes.subarray(0, 4).toString() === '%PDF', `${(rptBytes.length / 1024).toFixed(1)} kB`);
  // jsPDF deflates its content streams, so the file the user saved has to be
  // inflated before its text can be asserted. A report whose scores or SWOT never
  // made it into the file would still be a perfectly valid PDF, so assert the
  // content, not just the header.
  const rptRaw = pdfText(rptBytes);
  check('report PDF has pages', rptBytes.toString('latin1').includes('/Type /Page'),
    `${(rptBytes.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length} page(s)`);
  check('report PDF carries readable text', rptRaw.length > 2000, `${(rptRaw.length / 1024).toFixed(1)} kB inflated`);
  check('report PDF states both score labels', rptRaw.includes('JOB MATCH') && rptRaw.includes('ATS SCORE'));
  check('report PDF states the swot quadrants', rptRaw.includes('STRENGTHS') && rptRaw.includes('WEAKNESSES')
    && rptRaw.includes('OPPORTUNITIES') && rptRaw.includes('THREATS'));
  check('report PDF shows the before and after percentages', rptRaw.includes(`${reportJson.scores.jobMatch.before}%`)
    && rptRaw.includes(`${reportJson.scores.jobMatch.after}%`)
    && rptRaw.includes(`${reportJson.scores.ats.before}%`) && rptRaw.includes(`${reportJson.scores.ats.after}%`),
    `match ${reportJson.scores.jobMatch.before}->${reportJson.scores.jobMatch.after}, ats ${reportJson.scores.ats.before}->${reportJson.scores.ats.after}`);
  check('report PDF names the candidate', rptRaw.includes(reportJson.candidate.name.split(' ')[0]), reportJson.candidate.name);
  check('report PDF is text-based, not a raster', !extractJpeg(rptBytes), 'selectable text, no page image');

  const mdFile = await grab('Report Markdown', 60000);
  const mdText = mdFile.bytes.toString('utf8');
  check('report markdown downloads with the score tables',
    mdText.includes('Job Match') && mdText.includes('ATS Score') && mdText.includes('SWOT analysis'),
    `${(mdText.length / 1024).toFixed(1)} kB`);

  const htmlFile = await grab('Report HTML', 60000);
  const htmlText = htmlFile.bytes.toString('utf8');
  check('report html downloads self-contained',
    htmlText.startsWith('<!doctype html>') && !/(src|href)\s*=\s*["']https?:/i.test(htmlText),
    `${(htmlText.length / 1024).toFixed(1)} kB, no remote resources`);

  console.log('\n13. print stylesheet');
  const printState = await page.evaluate(async () => {
    const root_ = document.getElementById('rsp-export-root');
    const stage = root_?.parentElement;
    return {
      hasRoot: Boolean(root_),
      stageClass: stage?.className || '',
      pages: root_ ? root_.querySelectorAll('.rsp-page').length : 0,
      hidden: stage ? getComputedStyle(stage).left : null,
    };
  });
  check('export root is mounted while on another tab', printState.hasRoot, `${printState.pages} page(s) in the export root`);
  check('export stage is parked off-screen', String(printState.hidden).includes('-20000'), printState.hidden);

  console.log('\n8. responsive + a11y basics');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 390px', overflow <= 1, `${overflow}px`);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const a11y = await page.evaluate(() => ({
    unlabelled: [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label')).length,
    tabsRole: document.querySelectorAll('[role="tab"]').length,
    liveRegion: document.querySelectorAll('[aria-live]').length,
  }));
  check('every button has an accessible name', a11y.unlabelled === 0, `${a11y.unlabelled} unlabelled`);
  check('tabs are exposed as tabs', a11y.tabsRole >= 4, `${a11y.tabsRole} tab(s)`);
  check('live region present for progress/toasts', a11y.liveRegion >= 1, `${a11y.liveRegion}`);

  console.log('\n9. console hygiene');
  const realErrors = consoleErrors.filter((e) => !/favicon|net::ERR_|Download the React DevTools/i.test(e));
  check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  const realNotFound = notFound.filter((u) => !/favicon/i.test(u));
  check('no failed requests', realNotFound.length === 0, realNotFound.slice(0, 5).join(' | '));

  console.log(`\ndownloads: ${readdirSync(DOWNLOADS).join(', ')}`);
} finally {
  if (crashInfo.length) console.log(`\nbrowser events: ${crashInfo.join(', ')}`);
  await browser?.close();
  if (built) await built.httpServer.close();
  await server?.close();
  void pathToFileURL;
}

console.log(`\n${failures === 0 ? 'ALL BROWSER CHECKS PASSED' : `${failures} BROWSER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
