/**
 * End-to-end check with real uploaded files (not the demo).
 *
 *   npm run test:upload
 *
 * Builds a 2-page A4 resume PDF with jsPDF, uploads it through the UI, rewrites
 * it, and verifies:
 *  - the PDF text is really parsed (name, contact, roles, metrics),
 *  - the rewrite keeps every company and metric and invents nothing,
 *  - every exported PDF page is a real page of content (not blank / grey),
 *  - an image-only PDF is reported as scanned instead of showing a blank page.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { jsPDF } from 'jspdf';
import { chromium } from 'playwright';

const PORT = 4331;
const WORK = mkdtempSync(join(tmpdir(), 'rsp-up-'));
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;
const check = (label, cond, extra = '') => {
  if (cond) console.log(`  PASS  ${label}${extra ? ` - ${extra}` : ''}`);
  else { failures += 1; console.log(`  FAIL  ${label}${extra ? ` - ${extra}` : ''}`); }
};

/** A realistic 2-page resume, written with jsPDF so the app has to parse it. */
const buildSourcePdf = (path) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  let y = 20;
  const line = (text, size = 10, style = 'normal', gap = 5) => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.text(text, 18, y);
    y += gap;
  };
  const heading = (text) => {
    if (y > 265) { doc.addPage(); y = 20; }
    y += 3;
    line(text.toUpperCase(), 11, 'bold', 6);
    doc.setDrawColor(180);
    doc.line(18, y - 4, W - 18, y - 4);
  };

  line('Priya Raman', 20, 'bold', 8);
  line('Senior Data Engineer', 12, 'bold', 5);
  line('Bengaluru, India  |  +91 98860 11223  |  priya.raman@example.org  |  linkedin.com/in/priyaraman', 9);
  heading('Professional summary');
  line('Data engineer with eight years building batch and streaming pipelines on internal data platforms, focused on', 9.5, 'normal', 5);
  line('reliable ingestion, data quality checks and query performance for analytics teams.', 9.5, 'normal', 5);
  heading('Experience');

  const roles = [
    ['Lead Data Engineer', 'Helio Analytics', '2021 - Present', 'Bengaluru, India', [
      'Owned the ingestion platform serving 40+ internal dashboards, cutting nightly job failures from 12% to 0.4%.',
      'Rebuilt the Airflow scheduling layer with dynamic task groups, reducing end-to-end runtime by 38%.',
      'Introduced Great Expectations checks on 22 tables, which caught 60+ schema drift issues before downstream impact.',
      'Mentored three engineers through onboarding and first production ownership.',
      'Cut monthly warehouse spend by 22% by retiring unused models and resizing clusters.',
    ]],
    ['Data Engineer', 'Northgate Retail', '2018 - 2021', 'Pune, India', [
      'Built Spark batch jobs processing 1.2 TB of clickstream data daily into Snowflake.',
      'Rewrote the sessionisation model in SQL, improving attribution accuracy by 14%.',
      'Automated dbt documentation, saving roughly 6 hours per release cycle.',
      'Partnered with finance on a reconciliation job that removed a 3-day month-end close delay.',
    ]],
    ['Analytics Engineer', 'Cobalt Retail Labs', '2016 - 2018', 'Hyderabad, India', [
      'Designed Tableau dashboards for merchandising teams covering 9 regions.',
      'Wrote Python ETL scripts for CRM and order management extracts.',
      'Published a weekly sales quality report used by 3 regional directors.',
    ]],
    ['Data Analyst Intern', 'Vertex Retail', '2015 - 2016', 'Chennai, India', [
      'Built the first Excel and SQL reporting pack for store-level margin tracking.',
    ]],
  ];

  for (const [role, company, dates, loc, bullets] of roles) {
    line(role, 10.5, 'bold', 4.6);
    line(`${company}  |  ${loc}  |  ${dates}`, 9, 'normal', 4.6);
    for (const b of bullets) line(`- ${b}`, 9.5, 'normal', 4.4);
    y += 2;
  }

  heading('Projects');
  line('Customer 360 platform', 10.5, 'bold', 4.6);
  line('Kaggle Analytics  |  2022', 9, 'normal', 4.6);
  line('- Unified 11 source systems into one profile store serving 4 downstream applications.', 9.5, 'normal', 4.4);
  line('Streaming quality monitor', 10.5, 'bold', 4.6);
  line('Open source  |  2023', 9, 'normal', 4.6);
  line('- Wrote a lag and null-rate monitor that pages the on-call engineer after 3 failed checks.', 9.5, 'normal', 4.4);
  y += 2;

  heading('Skills');
  line('Languages: Python, SQL, Scala', 9.5, 'normal', 4.6);
  line('Platforms: Airflow, Spark, Snowflake, dbt, Kafka, Docker, AWS', 9.5, 'normal', 4.6);
  line('Practices: data quality, schema governance, cost optimisation, incident response', 9.5, 'normal', 4.6);

  heading('Education');
  line('B.Tech, Computer Science - Anna University, 2016', 9.5, 'normal', 4.6);
  heading('Certifications');
  line('- AWS Certified Data Analytics - 2022', 9.5, 'normal', 4.6);
  line('- Databricks Certified Data Engineer Associate - 2023', 9.5, 'normal', 4.6);
  heading('Languages');
  line('English (fluent), Tamil (native), Hindi (fluent)', 9.5, 'normal', 4.6);
  heading('Interests');
  line('- Long distance running, technical writing, open source contributions', 9.5, 'normal', 4.6);

  doc.save(path);
  return doc.getNumberOfPages();
};

/** An image-only PDF - what a scanner or a screenshot produces. */
const buildScannedPdf = (path, jpegBase64) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addImage(jpegBase64, 'JPEG', 12, 20, 186, 250);
  doc.save(path);
};

const extractJpegs = (buf) => {
  const out = [];
  const SOI = Buffer.from([0xff, 0xd8, 0xff]);
  const EOI = Buffer.from([0xff, 0xd9]);
  let i = 0;
  while (i < buf.length - 3) {
    const start = buf.indexOf(SOI, i);
    if (start < 0) break;
    const end = buf.indexOf(EOI, start + 3);
    if (end < 0) break;
    out.push(buf.subarray(start, end + 2));
    i = end + 2;
  }
  return out;
};

const measure = async (page, bytes) => page.evaluate(async (b64) => {
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
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 > 245) white += 1;
    else ink += 1;
  }
  const total = data.length / 4;
  return { white: white / total, ink: ink / total };
}, bytes.toString('base64'));

/** Draw a fake "scanned" page in the browser and return it as a JPEG. */
const makeScannedJpeg = (page) => page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = '34px sans-serif';
  ['MARCUS REED', 'STAFF ENGINEER', 'EXPERIENCE', 'Built the billing platform.', 'Cut latency by 45%.', 'EDUCATION', 'BSc Computer Science, 2014']
    .forEach((text, i) => ctx.fillText(text, 80, 160 + i * 90));
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
});

const root = fileURLToPath(new URL('..', import.meta.url));
const built = await preview({
  previewServer: { port: PORT, strictPort: true, host: '127.0.0.1' },
  root,
  configFile: join(root, 'vite.config.js'),
  logLevel: 'error',
});
const base = new URL(built.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') console.log('  [warn]', m.text()); });

try {
  // ---- 1. text PDF upload, rewrite, export -------------------------------
  console.log('\n[1/2] text PDF upload');
  const srcPdf = join(WORK, 'priya-raman-resume.pdf');
  const srcPages = buildSourcePdf(srcPdf);
  console.log(`  source PDF: ${(readFileSync(srcPdf).length / 1024).toFixed(1)} kB, ${srcPages} pages`);
  check('source fixture really is 2 pages', srcPages === 2, `${srcPages} pages`);

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type="file"]', srcPdf);
  await page.waitForSelector('#panel-original .rsp-page', { timeout: 60000 });
  const originalPages = await page.locator('#panel-original .rsp-page').count();
  const original = await page.locator('#panel-original').innerText();
  check('uploaded PDF is parsed into pages', originalPages >= 1, `${originalPages} page(s)`);
  check('candidate name detected', original.includes('Priya Raman'));
  check('contact line detected', /98860 11223/.test(original) && /Bengaluru/.test(original));
  check('all four companies detected', ['Helio Analytics', 'Northgate Retail', 'Cobalt Retail Labs', 'Vertex Retail'].every((c) => original.includes(c)));
  check('metrics survive parsing', original.includes('0.4%') && original.includes('1.2 TB'));

  await page.fill('textarea', 'Hiring a senior data engineer strong in Airflow, Spark, Snowflake and dbt, plus Kafka and Terraform for infrastructure. You will own data quality and cost optimisation.');
  await page.click('button:has-text("Rewrite Resume")');
  await page.waitForSelector('#panel-optimized .rsp-page', { timeout: 60000 });
  const optimizedPages = await page.locator('#panel-optimized .rsp-page').count();
  const optimized = await page.locator('#panel-optimized').innerText();
  check('rewrite produced pages', optimizedPages >= 1, `${optimizedPages} page(s)`);
  check('all companies kept', ['Helio Analytics', 'Northgate Retail', 'Cobalt Retail Labs', 'Vertex Retail'].every((c) => optimized.includes(c)));
  check('original metric kept', optimized.includes('0.4%'));
  check('unsupported JD term is not invented', !optimized.includes('Terraform'), 'Terraform stays out of the resume');
  const emptyPages = await page.evaluate(() => [...document.querySelectorAll('#rsp-export-root .rsp-page')]
    .map((p, i) => ({ i, chars: (p.innerText || '').trim().length })));
  check('no empty page in the export stage', emptyPages.every((p) => p.chars > 40),
    emptyPages.map((p) => `#${p.i + 1}:${p.chars}ch`).join(' '));

  const dl = page.waitForEvent('download', { timeout: 120000 });
  await page.click('button:has-text("PDF (visual match)")');
  const out = join(WORK, 'optimized.pdf');
  await (await dl).saveAs(out);
  const bytes = readFileSync(out);
  check('optimized PDF written', bytes.subarray(0, 4).toString() === '%PDF', `${(bytes.length / 1024).toFixed(1)} kB`);
  const jpegs = extractJpegs(bytes);
  check('every rendered page is embedded as an image', jpegs.length === optimizedPages, `${jpegs.length} image(s) for ${optimizedPages} page(s)`);
  for (let i = 0; i < jpegs.length; i += 1) {
    const cov = await measure(page, jpegs[i]);
    check(`page ${i + 1} is white, not a grey sheet`, cov.white > 0.6, `${(cov.white * 100).toFixed(1)}% white`);
    check(`page ${i + 1} has content`, cov.ink > 0.004, `${(cov.ink * 100).toFixed(2)}% ink`);
  }

  // ---- 2. image-only PDF must not silently produce a blank resume ---------
  console.log('\n[2/2] image-only PDF');
  const scannedPdf = join(WORK, 'scanned-resume.pdf');
  buildScannedPdf(scannedPdf, await makeScannedJpeg(page));
  await page.reload({ waitUntil: 'networkidle' });
  await page.setInputFiles('input[type="file"]', scannedPdf);
  const settled = await page.waitForFunction(() => {
    if (document.querySelector('#panel-original .rsp-page')) return true;
    // Only these two titles come from the error notice, never from static copy.
    return /Scanned PDF detected|Could not read that file/.test(document.body.innerText);
  }, null, { timeout: 60000 }).then(() => true).catch(() => false);
  check('image-only PDF finished processing', settled);
  const scannedBody = await page.locator('body').innerText();
  const scannedNotice = (scannedBody.match(/[^\n]*selectable text[^\n]*/) || ['no notice found'])[0];
  check('image-only PDF is reported as scanned', /Scanned PDF detected|selectable text/.test(scannedBody), scannedNotice.slice(0, 100));
  const scannedRendered = await page.locator('#panel-original .rsp-page').count();
  const scannedText = scannedRendered ? await page.locator('#panel-original').innerText() : '';
  check('image-only PDF never shows a blank resume', scannedRendered === 0 || scannedText.trim().length > 40,
    scannedRendered ? `${scannedText.trim().length} chars` : 'no page rendered');

  check('no console errors during the whole flow', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  await built.httpServer.close();
}

console.log(`\n${failures === 0 ? 'UPLOAD CHECKS PASSED' : `${failures} UPLOAD CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
