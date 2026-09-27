# Resume Rewriter Studio

A browser-only studio that rewrites a resume for a specific job description **without changing your story**.

Everything - PDF/DOCX parsing, layout detection, keyword analysis, rewriting, ATS scoring, editing and
export - runs in your browser. There is no backend, no API key, no account, no analytics and no upload.
Your resume never leaves the device.

### Live site - no install needed

**https://athikahmd76-stack.github.io/resume-rewriter-studio/**

Open that link on any device with a modern browser. It is the same app, hosted as a static site on GitHub
Pages. There is no server, no database and no sign-in, and it is free. Your resume is parsed and rewritten
entirely inside the browser, so nothing is stored anywhere.

To deploy your own copy, see [Publishing the built app](#publishing-the-built-app) - every push to `main`
rebuilds and redeploys automatically.

> On the hosted site, text-based PDFs and DOCX files work out of the box. Scanned PDFs need the optional OCR
> assets, which are not deployed - run it locally if you need OCR.

---

## Contents

1. [Installation (step by step)](#installation-step-by-step)
2. [Using the app](#using-the-app)
3. [Job Match, ATS before/after, SWOT and the report](#job-match-ats-beforeafter-swot-and-the-report)
4. [Commands](#commands)
5. [Privacy and honesty guarantees](#privacy-and-honesty-guarantees)
6. [What the app does](#what-the-app-does)
7. [Editing](#editing)
8. [Scanned PDFs (OCR) - optional](#scanned-pdfs-ocr---optional)
9. [Publishing the built app](#publishing-the-built-app)
10. [Project layout](#project-layout)
11. [Tests](#tests)
12. [Troubleshooting](#troubleshooting)
13. [Known limits](#known-limits)
14. [License](#license)

---

## Installation (step by step)

### What you need first

| Requirement | Why | How to check |
| --- | --- | --- |
| **Node.js 20.19+ or 22.12+** | Vite 7 will not start on anything older | `node -v` |
| **npm** (comes with Node.js) | Installs the packages | `npm -v` |
| A modern browser | Chrome, Edge, Firefox or Safari | - |

If `node -v` is missing or reports an old version, install the **LTS** build from
<https://nodejs.org/en/download> and reopen your terminal. Everything else is handled for you.

### Option A - Windows, no terminal needed (recommended)

1. Download or clone this repository and unzip it somewhere permanent, e.g. `C:\Tools\resume-rewriter-studio`.
   Avoid putting it inside a `OneDrive` folder that syncs constantly, or inside `Program Files`, which needs
   administrator rights to write to.
2. Check the folder contains `Resume Rewriter Studio.bat`.
3. **Double-click `Resume Rewriter Studio.bat`.**
   - If Node.js is missing it opens the Node.js download page for you. Install it, then double-click again.
   - The first launch installs the dependencies and takes a minute. Later launches start in seconds.
4. Your browser opens the app automatically. If it does not, the black window prints a link - copy it into
   the address bar.
5. **Leave that black window open while you work.** Press `Ctrl+C` in it, or close it, to stop the app.

Want a desktop icon? Right-click `Resume Rewriter Studio.bat` -> **Show more options** -> **Send to** ->
**Desktop (create shortcut)**.

### Option B - macOS, Linux, or any terminal

1. Open a terminal and move into the project folder:

   ```bash
   cd path/to/resume-rewriter-studio
   ```

2. Install the dependencies once:

   ```bash
   npm install
   ```

3. Start the app and open it in your browser:

   ```bash
   npm start
   ```

4. Press `Ctrl+C` (macOS: `Ctrl+C`) to stop it. If the browser does not open, use the link the command prints.

### After either option

No configuration, no API key and no account are needed. Press **Load demo** to try the whole workflow
immediately, or drop in your own PDF/DOCX.

### Updating to a newer version

```bash
git pull              # if you cloned it
npm install            # in case dependencies changed
```

Then double-click the launcher again (or `npm start`).

---

## Using the app

1. **Upload** - drop in a PDF or DOCX resume, or press **Load demo**. PDF, DOCX and (with OCR assets)
   scanned PDFs are supported.
2. **Paste the job description** you are applying to.
3. **Choose a style** - Professional Minimal, Modern Corporate or Executive Clean. Source layout is preserved
   unless you change the style or turn off *Preserve source layout*.
4. **Press Rewrite Resume** - this parses, analyses, rewrites, checks for invented facts and scores both
   resumes.
5. **Review the tabs** - Comparison, ATS analysis, SWOT, edit, and the optimised preview.
6. **Edit anything** in the editor if you want to; your edits are what gets exported. The Job Match %, ATS score
   and SWOT all recompute as you type, so the before/after numbers always describe the resume you are about to export.
7. **Download the resume** as the visual PDF, a clean ATS-friendly DOCX, or print straight from the preview.
8. **Download the analysis** as a PDF, HTML, Markdown or JSON report, from the app bar, the ATS tab, the SWOT tab or
   the Download card. It contains both score pairs, the keyword tables, the full SWOT and the fact-guard results.

Anything the job description asks for that your resume does not prove is shown as
`MISSING - NOT FOUND IN SOURCE RESUME`. It is never quietly added to your resume.

---

## Job Match, ATS before/after, SWOT and the report

The analysis is a **deterministic local estimate**: fixed rules over your own text, with no model call and no
network request. The same resume and job description always produce the same numbers, and every one of them is
traceable to a term in the source.

**Job Match %** is a weighted breakdown across five components - demonstrated skills, seniority and scope,
role-relevant responsibility, impact and metrics, and keyword coverage - each shown with its own contribution so
the headline number can be checked rather than trusted.

**Before and after** is the point of the feature. Every score is shown as a pair:

| Score | Before | After |
| --- | --- | --- |
| Job Match | your source resume | the rewritten resume |
| ATS | your source resume | the rewritten resume |

"Before" is always scored from the file you supplied and "after" from the text you are about to export, including
any edits you make. The delta is shown in points, and a negative delta is displayed as a regression rather than
quietly dropped.

### Why a delta can be small, and what the app does about it

Not every score can move, and the app would rather tell you that than show you a number you cannot trust. Three
things are worth knowing.

**Some components are locked by design.** Job-title relevance and role alignment compare the titles you actually
held against the title you are applying for. Raising them would mean claiming a role you did not hold, so the
rewrite does not touch them. Unsupported-keyword scoring is held at 100 on purpose, because skills are only ever
promoted from evidence already in your resume. Whenever a component cannot move, the app prints the reason under it
- in the Job Match card, in the ATS tab, and in all four report formats.

**The rewrite only closes gaps your resume can actually close.** A skill you demonstrate in an experience bullet
but never repeated in your skills list gets hoisted into the list, because that is restructuring rather than
inventing. Anything the job asks for and your resume does not evidence is reported as a missing keyword and left
out. A low ceiling on keyword coverage therefore means a real gap, not a lazy rewrite.

**Synonym swaps are measured, not assumed.** Aligning your wording to the job's phrasing only helps if it actually
increases the number of job keywords your resume covers, and that is a property of the whole document rather than
of the one sentence the swap lands in. Every substitution is applied only if the covered-keyword count goes up as a
result, so the rewrite cannot trade one covered keyword for another and call it an improvement.

A resume that is already clean and well-matched can legitimately show a delta of zero. The app will tell you that
was the reason rather than leaving you to guess.

**SWOT** is derived from the same two passes, so it cannot contradict the scores: strengths are terms the rewrite
actually demonstrated, weaknesses are proven gaps, opportunities are job-description terms you already satisfy,
and threats are requirements with no evidence in the source. Every finding names the evidence behind it, and the
tab states plainly that it is a local estimate rather than an employer's ATS verdict.

**The report** is assembled by one serialiser, so all four formats carry identical numbers - the PDF, HTML,
Markdown and JSON files cannot disagree with each other or with the screen.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Installs if needed, starts the app and opens the browser (`node scripts/launch.mjs`) |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` and `scripts/` |
| `npm run test` | Headless pipeline/DOCX/renderer checks (`scripts/smoke.mjs`) |
| `npm run test:browser` | Builds, then drives the real UI in Chrome/Edge (`scripts/browser-check.mjs`) |
| `npm run test:parser` | Feeds every real-world layout through the real parsers as both DOCX and PDF and asserts the resulting job model (`scripts/parser-check.mjs`) |
| `npm run test:upload` | Builds, then uploads a generated 2-page PDF and an image-only PDF through the real UI (`scripts/upload-check.mjs`) |
| `npm run verify` | `lint` + `test` + `test:parser` + `test:browser` + `test:upload` |

The launcher also takes flags: `npm start -- --port 5200`, `--no-open` to skip opening a browser, and
`--preview` to serve an existing `dist/` build.

---

## Privacy and honesty guarantees

These are enforced by the code and covered by the test suites.

- **Nothing is uploaded.** `fetch` is used only to HEAD-check optional local OCR assets in `public/tesseract/`.
- **No fabrication.** Roles, employers, dates, metrics, skills, education and certifications can only be reordered,
  tightened or re-worded. The fact guard rejects any rewrite that introduces a number, keyword or claim that was not
  in the source document.
- **Missing keywords are labelled, not invented.** Anything the job description asks for that your resume does not
  prove is shown as `MISSING - NOT FOUND IN SOURCE RESUME` in the match tables. It is never added to the resume.
- **ATS scores are heuristics.** They are local keyword/structure/formatting heuristics, labelled as such in the UI.
  They are not an official ATS result.
- **Version history is in memory only** for the session. Nothing is written to disk or persisted.
- **No tracking, fonts or scripts from third parties.** The build pulls no remote assets at runtime.

---

## What the app does

1. **Parse** - `pdfjs-dist` extracts positioned text, font sizes, bold/italic, bullets, columns and page geometry.
   `mammoth` reads DOCX into the same shape. Scanned PDFs can go through optional local OCR.
2. **Structure** - `layoutAnalyzer` detects sections, margins, column count, fonts and A4/Letter geometry;
   `resumeParser` turns lines into a resume model (contact, summary, experience, skills, education, certifications,
   languages, other).
3. **Analyse the job** - `jdAnalyzer` extracts keywords with priority and required-skill weighting, trimming
   filler words off the front and back of an extracted phrase so a term like "sql" stays matchable when the posting
   says "build SQL dashboards". `keywordMatcher` classifies every keyword as matched, missing, or
   matched-via-synonym, and flags JD terms that the resume cannot support.
4. **Rewrite** - `resumeRewriter` tightens bullets, leads with action verbs, fixes grammar and keyword alignment
   using only vocabulary already present in the source, promotes skills that the experience already proves, and
   applies a synonym swap only when it measurably increases keyword coverage. A change log records every edit.
5. **Score** - `atsScorer` scores each resume independently for keywords, structure and formatting so you can see
   the delta, and marks any component that cannot move with the reason. `jobMatchScorer` adds a weighted Job Match %
   over five components, and `swotAnalyzer` derives a four-quadrant SWOT from the same two passes so the narrative
   cannot contradict the numbers.
6. **Report** - `reportBuilder` assembles one analysis model and serialises it to PDF, HTML, Markdown and JSON,
   so every format states the same scores. `reportExporter` writes them straight to your device.
7. **Preview and export** - the same `ResumeRenderer` output is used for the on-screen A4 page, the visual PDF
   (html2canvas + jsPDF), printing, and the DOCX exporter.

The detected page size, margins, font sizes, section order and column layout are preserved unless you change the
style or turn off *Preserve source layout*.

---

## Editing

The editor writes only what you type. The engine never fills a field for you. Edits update the preview, the exports,
the Job Match % and the ATS score immediately, and every applied change is stored in the in-memory version history
so you can restore an earlier state or revert the rewrite entirely.

---

## Scanned PDFs (OCR) - optional

OCR is **off by default** and only offered when a PDF has no usable text layer. It uses `tesseract.js` with
assets served from this app's own `public/tesseract/` folder. If those files are absent, the app says so plainly
and never falls back to a CDN.

The assets are not committed to this repository because of their size. To enable OCR, copy them from
`node_modules` after running `npm install`:

macOS / Linux / Git Bash:

```bash
mkdir -p public/tesseract
cp node_modules/tesseract.js/dist/worker.min.js           public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core.wasm.js  public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd.wasm.js public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js public/tesseract/
cp node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js public/tesseract/
curl -Lo public/tesseract/eng.traineddata.gz \
  https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force -Path public\tesseract | Out-Null
Copy-Item node_modules\tesseract.js\dist\worker.min.js                        public\tesseract\
Copy-Item node_modules\tesseract.js-core\tesseract-core.wasm.js               public\tesseract\
Copy-Item node_modules\tesseract.js-core\tesseract-core-simd.wasm.js          public\tesseract\
Copy-Item node_modules\tesseract.js-core\tesseract-core-lstm.wasm.js          public\tesseract\
Copy-Item node_modules\tesseract.js-core\tesseract-core-simd-lstm.wasm.js     public\tesseract\
Invoke-WebRequest -Uri https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0/eng.traineddata.gz -OutFile public\tesseract\eng.traineddata.gz
```

`src/services/ocrService.js` checks for `worker.min.js` and `eng.traineddata.gz` before starting; if either is
missing it reports exactly what to add. Add other languages the same way and register them in the worker call.

---

## Publishing the built app

The app is a fully static site, so it can be hosted anywhere for free. It uses a relative base path, so the
same build works from a sub-path host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, a plain file server).

### GitHub Pages (already set up for this repo)

`.github/workflows/pages.yml` runs on every push to `main`: it installs dependencies, lints, builds `dist/`,
fails the deploy if the build came out empty, and publishes the result. The workflow also has
`workflow_dispatch`, so you can redeploy without a commit from the **Actions** tab.

**https://athikahmd76-stack.github.io/resume-rewriter-studio/**

To point Pages at a different branch or turn the deploy off, edit **Settings -> Pages**.

### Build it yourself

```bash
npm run build          # -> dist/
npm run preview        # serve dist/ locally at http://localhost:4173
```

To try the production build through the launcher, run `npm run build` first and then run
`node scripts/launch.mjs --preview`.

---

## Project layout

```
.github/workflows/pages.yml   build + deploy dist/ to GitHub Pages on every push to main
ats_resume_analyzer.html     bonus single-file ATS + job-match checker; no install, but it
                             loads pdf.js, mammoth and jszip from cdnjs, so it needs internet
index.html                   Vite entry page
Resume Rewriter Studio.bat   one-click Windows launcher
src/
  App.jsx                    workflow state, upload, editing, tabs, export stage
  components/                uploader, JD input, settings, previews, comparison, ATS, editor, downloads
  services/
    pdfParser.js             positioned text extraction via pdfjs-dist
    docxParser.js            OOXML reader (mammoth + direct XML for geometry)
    zipReader.js             local DOCX package reader
    layoutAnalyzer.js        sections, margins, columns, fonts, page geometry
    resumeParser.js          lines -> resume model
    jdAnalyzer.js            job description -> weighted keywords
    keywordMatcher.js        matched / missing / synonym / unsupported
    resumeRewriter.js        deterministic rewrite + fact guard
    atsScorer.js             heuristic ATS scoring
    jobMatchScorer.js        weighted Job Match % over five components
    swotAnalyzer.js          evidence-backed four-quadrant SWOT
    reportBuilder.js         one analysis model -> PDF/HTML/Markdown/JSON serialisers
    reportExporter.js        local report file downloads
    paginationEngine.js      A4 page fitting and page breaks
    pdfExporter.js           visual PDF, print CSS, off-screen export stage
    docxExporter.js          styled DOCX generation
    ocrService.js            optional local OCR
    pipeline.js              parse -> analyse -> match -> rewrite -> guard -> score -> report
  templates/                 ResumeRenderer and the three themes
  utils/                     text, keyword, formatting and validation helpers
  data/                      stop words, synonyms, action verbs, section dictionary, demo data
scripts/
  launch.mjs                 one-click launcher: dependency check, dev server, browser
  smoke.mjs                  headless pipeline, safety, DOCX round-trip and renderer checks
  parser-check.mjs           layout matrix: every fixture as DOCX and PDF, model + rewrite assertions
  browser-check.mjs          real-browser UI, export, print, responsive and a11y checks
  upload-check.mjs           real uploaded PDF: parsing, fact safety, per-page export pixels, scanned-PDF guard
  dom-shim.mjs               minimal DOMParser for Node DOCX parsing tests
  fixtures/
    layouts.mjs              the resume layouts the parser must handle
    pdf-probe.html           in-browser half of the layout matrix (Vite serves it)
```

---

## Tests

```bash
npm run verify
```

That runs, in order: lint, the headless pipeline checks, the parser layout matrix, the browser UI checks and
the real upload/export regression.

`npm run test:parser` covers the layouts that break parsers: two-line and three-line job headers, company-above-role
headers, marker-less bullets, wrapped bullet lines, "ADDITIONAL" sub-headings inside a section, repeated section
headings, and sections that must not bleed into each other. Add a case to `scripts/fixtures/layouts.mjs` when a real
resume parses wrong.

`npm run test:browser`, `npm run test:parser` and `npm run test:upload` use Playwright with your **installed**
Chrome or Edge - no browser is downloaded.
The upload check opens the exported PDF, un-embeds every page image and asserts each page is mostly white with
real ink on it, so a blank or grey "successful" export fails the run. Override the binary if needed:

```bash
CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" npm run test:browser
```

To check a build that is already deployed instead of the local one, point the same suite at it and skip the build
entirely. This is the only way to verify the artifact users actually load rather than the copy in `dist/`:

```bash
BASE_URL=https://athikahmd76-stack.github.io/resume-rewriter-studio node scripts/browser-check.mjs
```

Keep the project path in `BASE_URL`. It is a full site URL, not a host, so a `github.io/<repo>/` deployment needs
the repository segment.

The analysis has its own coverage on both levels. `npm run test` asserts the scorers are deterministic, that the
weights sum to 1, that an empty job description still produces a defined score, that the four SWOT quadrants always
come back non-empty with evidence, and that no report format can state a number the others disagree with.
`npm run test:browser` then downloads all four report files through the real UI and checks the PDF's *inflated*
content streams for the score labels, the four quadrant names and the exact before/after percentages, so a report that
is a valid but empty PDF fails the run.

---

## Troubleshooting

**`node` is not recognised / Node is too old**
Install Node.js LTS from <https://nodejs.org/en/download>, close and reopen the terminal, then check `node -v`.
You need 20.19+ or 22.12+.

**`npm install` fails**
Usually a network or corporate proxy issue. Try `npm install --no-fund --no-audit`. Behind a proxy, set
`HTTP_PROXY`/`HTTPS_PROXY` first.

**The app does not open in a browser**
The command window prints the URL. Copy it into your browser. The port may be in use - run
`npm start -- --port 5200`.

**`EADDRINUSE` / port already in use**
Another copy of the app is still running. Close the other black window, or use a different port as above.

**The upload shows a blank or empty resume**
The PDF has no usable text layer - it is a scan or an image. The app says so and offers OCR once the assets
above are installed. Text-based PDFs and DOCX files work without them.

**Word cannot open the exported DOCX**
Close any open copy of the file first, then retry. The export is a clean rebuild, not a clone of the source.

**The exported PDF looks grey, blank, or has a dark background**
Your browser blocks canvas capture in private/incognito mode or with extensions such as a strict ad blocker.
Reload the page in a normal window and try again.

**Everything looks unstyled**
Run `npm install` again, then `npm run build` and `npm run preview`. A partial `node_modules` is the usual cause -
delete `node_modules` and reinstall if it persists.

---

## Known limits

- Exact visual reconstruction of an arbitrary PDF is not possible. Page geometry, section order, typography,
  spacing, bullets and columns are preserved where they can be detected; complex drawings, text boxes and
  multi-column tables are approximated.
- OCR quality depends entirely on the scan resolution. Very low-DPI scans are reported rather than silently
  producing a bad resume.
- The DOCX export is a clean, ATS-friendly rebuild of the same content, not a pixel clone of the source.
- The Job Match %, the ATS score and the SWOT are **local heuristics over keyword and structure evidence**, not an
  employer's ATS. They are deterministic and explainable, which is what makes them useful, but they cannot know
  things the resume does not say. A high score is not a prediction of an interview.
- A Job Match % is only as good as the job description. With an empty or vague JD the score falls back to a
  documented default rather than pretending to measure something.

---

## Bonus: the single-file analyzer

`ats_resume_analyzer.html` is a separate, self-contained ATS + job-match checker that you can open by
double-clicking it - no install, no build, no server. It is **not** part of the React app and nothing in `src/`
depends on it.

One difference worth knowing: it loads `pdf.js`, `mammoth` and `jszip` from cdnjs, so it needs an internet
connection to open. The main app has no such dependency - it bundles every dependency locally, so once
`npm install` has run it works with no network at all.

---

## License

MIT - see [LICENSE](LICENSE).
