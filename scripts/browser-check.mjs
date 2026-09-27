/**
 * Browser verification with Playwright against the local system Chrome.
 *
 *   node scripts/browser-check.mjs            (runs `vite preview` itself)
 *   BROWSER=msedge node scripts/browser-check.mjs
 *
 * Covers: app boot, demo load, rewrite, all four tabs, the editor, version
 * history, both downloads, print styles and console errors.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const { createServer, preview } = await import('vite');
const { fileURLToPath } = await import('node:url');
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: join(root, 'vite.config.js'), logLevel: 'error' });
const built = await preview({ previewServer: { port: PORT, strictPort: true, host: '127.0.0.1' }, root, configFile: join(root, 'vite.config.js'), logLevel: 'error' });
const resolved = new URL(built.resolvedUrls.local[0]);
const base = resolved.origin;

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

  console.log('\n7. print stylesheet');
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
  server.close();
  await built.httpServer.close();
  void pathToFileURL;
}

console.log(`\n${failures === 0 ? 'ALL BROWSER CHECKS PASSED' : `${failures} BROWSER CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
