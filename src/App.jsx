import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, Sparkles, Play, RotateCcw, Layers, Columns2, Gauge as GaugeIcon, FileText, Download,
  ChevronRight, WifiOff, Cpu, Keyboard, Info,
} from 'lucide-react';

import { Card, Notice, Progress, Empty } from './components/ui.jsx';
import { useToast } from './components/ToastProvider.jsx';
import ResumeUploader from './components/ResumeUploader.jsx';
import JobDescriptionInput from './components/JobDescriptionInput.jsx';
import KeywordInput from './components/KeywordInput.jsx';
import OptimizationSettings from './components/OptimizationSettings.jsx';
import StyleSelector from './components/StyleSelector.jsx';
import OriginalPreview from './components/OriginalPreview.jsx';
import OptimizedPreview from './components/OptimizedPreview.jsx';
import ComparisonView from './components/ComparisonView.jsx';
import ATSAnalysis from './components/ATSAnalysis.jsx';
import ResumeEditor from './components/ResumeEditor.jsx';
import DownloadPanel from './components/DownloadPanel.jsx';

import { runPipeline, parseFile, structureDocument, STEPS } from './services/pipeline.js';
import { compareResumes } from './services/diffEngine.js';
import { scoreComparison } from './services/atsScorer.js';
import { buildBlocks, paginate, measureAndReflow } from './services/paginationEngine.js';
import { buildTheme } from './templates/theme.js';
import ResumeRenderer from './templates/ResumeRenderer.jsx';
import { exportDocx } from './services/docxExporter.js';
import { exportPdf, printElement } from './services/pdfExporter.js';
import { ocrPdf, ocrAssetsMissingMessage } from './services/ocrService.js';
import { analyzeJobDescription } from './services/jdAnalyzer.js';
import { DEFAULT_SETTINGS } from './services/resumeRewriter.js';
import { dedupeKeywords } from './utils/keywordUtils.js';
import { BUILTIN_STYLES } from './utils/formattingUtils.js';
import { scannedPdfMessage } from './utils/validation.js';
import { DEMO_PARSED, DEMO_JD, DEMO_KEYWORDS, DEMO_ROLE, DEMO_FILE, DEMO_NOTICE } from './data/sampleData.js';

const PREF_KEY = 'rsp:prefs:v1';

const TABS = [
  { id: 'original', label: 'Original', icon: FileText },
  { id: 'optimized', label: 'Optimized', icon: Sparkles },
  { id: 'comparison', label: 'Comparison', icon: Columns2 },
  { id: 'ats', label: 'ATS Analysis', icon: GaugeIcon },
];

const ZOOMS = [0.5, 0.7, 0.85, 1, 1.2];

const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
};

const baseName = (name) => String(name || 'resume').replace(/\.(pdf|docx)$/i, '');

export default function App() {
  const toast = useToast();
  const prefs = useMemo(loadPrefs, []);

  // ---------------- inputs ----------------
  const [file, setFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadError, setUploadError] = useState(null);
  const [parsingLabel, setParsingLabel] = useState('');
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('idle');

  const [jd, setJd] = useState('');
  const [keywords, setKeywords] = useState(prefs.keywords || []);
  const [targetRole, setTargetRole] = useState(prefs.targetRole || '');
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS, ...(prefs.settings || {}) });
  const [styleId, setStyleId] = useState(prefs.styleId || 'minimal');

  // ---------------- results ----------------
  const [result, setResult] = useState(null);
  const [structured, setStructured] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState({ step: null, pct: 0, label: '' });
  const [tab, setTab] = useState('optimized');
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [versions, setVersions] = useState([]);
  const [exportBusy, setExportBusy] = useState(null);

  const exportRef = useRef(null);
  const previewRef = useRef(null);
  const structuredRef = useRef(null);
  const demoRef = useRef(null);

  // ---------------- preferences (local only) ----------------
  useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ keywords, targetRole, settings, styleId }));
    } catch {
      /* storage is optional */
    }
  }, [keywords, targetRole, settings, styleId]);

  // ---------------- derived ----------------
  const jdResult = useMemo(
    () => (jd.trim() ? analyzeJobDescription(jd, { targetRole, userKeywords: keywords }) : null),
    [jd, targetRole, keywords],
  );

  const matchedSet = useMemo(() => {
    if (!result?.match) return null;
    const map = new Map();
    for (const m of result.match.matched) map.set(m.display.toLowerCase(), m.status === 'SYNONYM' ? 'synonym' : 'matched');
    for (const m of result.match.missing) map.set(m.display.toLowerCase(), 'missing');
    return map;
  }, [result]);

  const liveResume = result?.optimizedResume || null;
  const originalResume = result?.originalResume || structured?.resume || null;

  const render = useMemo(() => {
    const layout = result?.layout || structured?.layout || null;
    const theme = buildTheme({ styleId, layout, preserveLayout: settings.preserveLayout });
    const originalTheme = buildTheme({ styleId: 'minimal', layout, preserveLayout: true });
    const originalPagination = originalResume
      ? paginate(buildBlocks(originalResume, originalTheme), originalTheme)
      : null;
    if (!liveResume) return { theme, originalTheme, originalPagination, pagination: null };
    const pagination = paginate(buildBlocks(liveResume, theme), theme);
    return { theme, originalTheme, originalPagination, pagination };
  }, [result, liveResume, originalResume, structured, styleId, settings.preserveLayout]);

  const comparison = useMemo(
    () => (result?.originalResume && liveResume ? compareResumes(result.originalResume, liveResume) : null),
    [result, liveResume],
  );

  const canGenerate = Boolean(structured || isDemo) && !busy;
  const styleName = BUILTIN_STYLES[styleId]?.name || 'Professional Minimal';
  const stepIndex = STEPS.findIndex((s) => s.id === progress.step);

  // ---------------- upload ----------------
  const ingest = useCallback(async (picked, { ocr = false } = {}) => {
    // Drop any previous document *before* reading the new one. If the new file
    // fails to parse there must be no leftover resume the user could rewrite.
    setStructured(null);
    setResult(null);
    setVersions([]);
    setIsEdited(false);
    setEditing(false);
    structuredRef.current = null;
    demoRef.current = null;

    setBusy('parsing');
    setProgress({ step: 'parsing', pct: 4, label: 'Reading file' });
    try {
      let parsed;
      if (ocr) {
        setOcrStatus('running');
        parsed = await ocrPdf(picked, (pct, label) => {
          setParsingLabel(label);
          setProgress({ step: 'parsing', pct, label });
        });
        setOcrStatus('done');
      } else {
        parsed = await parseFile(picked, (pct, label) => {
          setParsingLabel(label);
          setProgress({ step: 'parsing', pct, label });
        });
      }
      const structured_ = structureDocument(parsed);
      structuredRef.current = structured_;
      demoRef.current = null;
      setStructured(structured_);
      setResult(null);
      setIsDemo(false);
      setIsEdited(false);
      setVersions([]);
      setUploadStatus('ok');
      setUploadError(null);
      setTab('original');
      const found = structured_.diagnostics.sectionsFound.length;
      toast.success(
        `Parsed ${found} section${found === 1 ? '' : 's'} from ${picked.name}`,
        found
          ? 'Check the Original tab to confirm the parser read your document correctly.'
          : 'No standard section headings were detected - check the Original tab.',
      );
    } catch (err) {
      setUploadStatus('error');
      setOcrStatus('idle');
      const message = String(err?.message || 'That file could not be read.');
      setUploadError({
        message: err?.code === 'scanned-pdf' ? scannedPdfMessage : message,
        needsOcr: Boolean(err?.needsOcr),
        code: err?.code || 'parse-failed',
      });
      if (err?.code === 'ocr-assets-missing') toast.error('OCR assets are not bundled', ocrAssetsMissingMessage);
      else toast.error('Could not read that file', message);
    } finally {
      setBusy(null);
      setProgress({ step: null, pct: 0, label: '' });
      setParsingLabel('');
    }
  }, [toast]);

  const onFile = useCallback((picked) => {
    setFile(picked);
    setOcrEnabled(false);
    setOcrStatus('idle');
    setUploadError(null);
    setUploadStatus('idle');
    setIsDemo(false);
    ingest(picked);
  }, [ingest]);

  const onRemove = useCallback(() => {
    setFile(null);
    setStructured(null);
    setResult(null);
    setIsDemo(false);
    setIsEdited(false);
    setEditing(false);
    setUploadStatus('idle');
    setUploadError(null);
    setOcrStatus('idle');
    setVersions([]);
    structuredRef.current = null;
    demoRef.current = null;
  }, []);

  const onOcrToggle = useCallback(async (enable) => {
    setOcrEnabled(enable);
    if (enable && file) await ingest(file, { ocr: true });
  }, [file, ingest]);

  // ---------------- demo ----------------
  const loadDemo = useCallback(() => {
    const structured_ = structureDocument(DEMO_PARSED);
    setFile(DEMO_FILE);
    setOcrEnabled(false);
    setOcrStatus('idle');
    setUploadError(null);
    setUploadStatus('ok');
    setIsDemo(true);
    setStructured(structured_);
    structuredRef.current = structured_;
    demoRef.current = DEMO_PARSED;
    setResult(null);
    setIsEdited(false);
    setVersions([]);
    setJd(DEMO_JD);
    setKeywords(dedupeKeywords(DEMO_KEYWORDS));
    setTargetRole(DEMO_ROLE);
    setTab('original');
    toast.info('Demo loaded', DEMO_NOTICE);
  }, [toast]);

  // ---------------- generate ----------------
  const generate = useCallback(async () => {
    if (!structuredRef.current && !demoRef.current) {
      toast.error('Nothing to work on', 'Upload a PDF or DOCX resume, or load the demo, first.');
      return;
    }
    setBusy('pipeline');
    setEditing(false);
    setIsEdited(false);
    try {
      const out = await runPipeline({
        preparsed: demoRef.current || undefined,
        structured: demoRef.current ? undefined : structuredRef.current,
        jobDescription: jd,
        userKeywords: keywords,
        targetRole,
        settings,
        onProgress: (step, pct, label) => setProgress({ step, pct, label }),
      });
      setResult(out);
      setVersions((v) => [
        ...v.map((x) => ({ ...x, isCurrent: false })),
        {
          id: `v${Date.now()}`,
          at: Date.now(),
          resume: out.optimizedResume,
          label: 'Generated',
          summary: `${(out.optimizedResume.experience || []).length} roles · ${(out.optimizedResume.skills || []).length} skill groups`,
          isCurrent: true,
        },
      ].slice(-12));
      setTab('optimized');
      const delta = out.scores.optimized.overall - out.scores.original.overall;
      if (out.guard && !out.guard.passed) {
        toast.warn('Fact guard blocked some content', `${out.guard.blocked.length} unsupported item(s) were removed. Check the Comparison tab.`);
      } else {
        toast.success(
          'Rewrite complete',
          `Heuristic score ${out.scores.original.overall}% → ${out.scores.optimized.overall}% (${delta >= 0 ? '+' : ''}${delta}) in ${out.durationMs} ms.`,
        );
      }
    } catch (err) {
      toast.error('The rewrite could not be completed', String(err?.message || 'Unexpected error.'));
    } finally {
      setBusy(null);
      setProgress({ step: null, pct: 0, label: '' });
    }
  }, [jd, keywords, targetRole, settings, toast]);

  // ---------------- editing + versions ----------------
  /**
   * Apply a human edit to the optimized resume and re-score it, so the ATS tab
   * and the tab badge always describe what is actually on screen.
   */
  const applyEdit = useCallback((nextResume) => {
    setIsEdited(true);
    setResult((r) => {
      if (!r) return r;
      return {
        ...r,
        optimizedResume: nextResume,
        scores: scoreComparison(r.originalResume, nextResume, r.jd, r.match, r.layout),
      };
    });
  }, []);

  const saveVersion = useCallback((resume, kind = 'edited') => {
    setVersions((v) => [
      ...v.map((x) => ({ ...x, isCurrent: false })),
      {
        id: `v${Date.now()}`,
        at: Date.now(),
        resume,
        label: kind === 'restored' ? 'Restored' : 'Edited',
        summary: `${(resume.experience || []).length} roles · ${(resume.skills || []).length} skill groups`,
        isCurrent: true,
      },
    ].slice(-12));
  }, []);

  const onRestore = useCallback((version) => {
    applyEdit(version.resume);
    saveVersion(version.resume, 'restored');
    toast.info(`Restored the ${version.label.toLowerCase()} version`);
  }, [applyEdit, saveVersion, toast]);

  // ---------------- export ----------------
  const onExport = useCallback(async (format) => {
    if (!liveResume) return;
    setExportBusy(format);
    const name = `${baseName(file?.name || 'resume')}-optimized`;
    try {
      if (format === 'docx') {
        const out = await exportDocx(liveResume, render.theme, { fileName: `${name}.docx` });
        toast.success('DOCX saved', out.fileName);
      } else {
        const out = await exportPdf(exportRef.current, liveResume, render.theme, {
          fileName: `${name}.pdf`,
          onProgress: (pct, label) => setProgress({ step: 'export', pct, label }),
        });
        toast.success('PDF saved', out?.fileName || `${name}.pdf`);
      }
    } catch (err) {
      toast.error('Export failed', String(err?.message || 'Unexpected error while exporting.'));
    } finally {
      setExportBusy(null);
      setProgress({ step: null, pct: 0, label: '' });
    }
  }, [liveResume, render.theme, file, toast]);

  const onPrint = useCallback(() => {
    try {
      printElement(exportRef.current);
    } catch (err) {
      toast.error('Print failed', String(err?.message || 'Could not open the print dialog.'));
    }
  }, [toast]);

  // ---------------- keep measured pagination honest ----------------
  // The heuristic paginator cannot know real font metrics, so overflowing
  // content is moved to the next page once the browser has laid it out. The
  // export stage and the on-screen preview are reflowed the same way so what
  // you see is what gets exported.
  useEffect(() => {
    if (!liveResume) return undefined;
    const t = setTimeout(() => {
      for (const root of [exportRef.current, previewRef.current]) {
        if (!root) continue;
        try {
          measureAndReflow(root);
        } catch {
          /* measurement is best effort */
        }
      }
    }, 140);
    return () => clearTimeout(t);
  }, [liveResume, render.pagination, zoom, tab, editing]);

  const resetAll = () => {
    onRemove();
    setJd('');
    setKeywords([]);
    setTargetRole('');
    setSettings({ ...DEFAULT_SETTINGS });
    toast.info('Workspace reset');
  };

  return (
    <div className="app">
      <a className="skip-link" href="#resume-upload">Skip to uploader</a>

      {/* ============================ app bar ============================ */}
      <header className="appbar">
        <div className="appbar__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true"><Sparkles size={17} /></span>
            <div className="brand__text">
              <p className="brand__title">Resume Rewriter Studio</p>
              <p className="brand__sub">Local-only resume rewriting - no uploads, no fabrication</p>
            </div>
          </div>

          <span className="appbar__spacer" />

          <div className="appbar__actions">
            <span className="privacy-pill">
              <ShieldCheck size={13} aria-hidden="true" /> 100% in your browser
            </span>
            <a className="btn btn--sm btn--ghost" href="#job-description">Job description</a>
            <a className="btn btn--sm btn--ghost" href="#keywords">Keywords</a>
            <a className="btn btn--sm btn--ghost" href="#preview">Preview</a>
            <a className="btn btn--sm btn--ghost" href="#download">Download</a>
            <button type="button" className="btn btn--sm btn--subtle" onClick={loadDemo}>
              <Play size={13} aria-hidden="true" /> Load demo
            </button>
            <button type="button" className="btn btn--sm btn--subtle" onClick={resetAll}>
              <RotateCcw size={13} aria-hidden="true" /> Reset
            </button>
          </div>
        </div>
      </header>

      <div className="shell">
        {/* ============================ inputs ============================ */}
        <div className="panel-col">
          <Notice tone="ok" icon={ShieldCheck} title="Everything happens in this browser tab.">
            Your resume, job description and exports are processed locally with deterministic rules. There is no backend,
            no analytics and no network request while you work. Reloading the page clears the workspace.
          </Notice>

          <ResumeUploader
            file={file}
            onFile={onFile}
            onRemove={onRemove}
            status={uploadStatus}
            error={uploadError}
            parsingLabel={parsingLabel}
            ocrEnabled={ocrEnabled}
            onOcrToggle={onOcrToggle}
            ocrStatus={ocrStatus}
            isBusy={busy === 'parsing'}
          />

          {isDemo ? <Notice tone="info" icon={Info} title="Demo mode.">{DEMO_NOTICE}</Notice> : null}

          <JobDescriptionInput value={jd} onChange={setJd} disabled={busy === 'pipeline'} jdResult={jdResult} />

          <KeywordInput
            keywords={keywords}
            onKeywordsChange={(next) => setKeywords(dedupeKeywords(next))}
            targetRole={targetRole}
            onTargetRoleChange={setTargetRole}
            disabled={busy === 'pipeline'}
            matchedSet={matchedSet}
          />

          <OptimizationSettings
            settings={settings}
            onChange={setSettings}
            onReset={() => setSettings({ ...DEFAULT_SETTINGS })}
            disabled={busy === 'pipeline'}
          />

          <StyleSelector
            styleId={styleId}
            onStyleChange={setStyleId}
            preserveLayout={settings.preserveLayout}
            onPreserveLayoutChange={(v) => setSettings((s) => ({ ...s, preserveLayout: v }))}
            disabled={busy === 'pipeline'}
          />

          <Card>
            <button type="button" className="btn btn--primary btn--block btn--lg" onClick={generate} disabled={!canGenerate}>
              <Sparkles size={16} aria-hidden="true" /> {result ? 'Rewrite again' : 'Rewrite Resume'}
            </button>
            <p className="text-xs text-muted" style={{ textAlign: 'center' }}>
              {structured || isDemo
                ? 'Local rules only: action verbs, grammar, keyword alignment, date normalisation, dedupe.'
                : 'Upload a resume or load the demo to enable the rewrite.'}
            </p>
          </Card>
        </div>

        {/* ============================ workspace ============================ */}
        <div className="preview-col stack">
          {busy === 'pipeline' ? (
            <Card title="Processing locally" icon={Cpu}>
              <Progress value={progress.pct} label={progress.label} detail={`step ${Math.max(1, stepIndex + 1)} of ${STEPS.length}`} />
              <ol className="steps">
                {STEPS.map((s, i) => (
                  <li
                    key={s.id}
                    className={i < stepIndex ? 'step step--done' : i === stepIndex ? 'step step--active' : 'step'}
                  >
                    {s.label}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          <Card
            id="preview"
            title={result ? 'Preview' : 'Resume'}
            hint={result ? `rewritten in ${result.durationMs} ms, entirely locally` : 'Upload a resume to preview it here'}
            icon={Layers}
            actions={result ? (
              <button
                type="button"
                className="btn btn--sm btn--subtle"
                onClick={() => setEditing((v) => !v)}
                aria-expanded={editing}
              >
                {editing ? 'Hide editor' : 'Edit resume'}
              </button>
            ) : null}
          >
            <div className="preview-toolbar">
              <div className="tabs" role="tablist" aria-label="Preview views">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    className="tab"
                    aria-selected={tab === t.id}
                    aria-controls={`panel-${t.id}`}
                    onClick={() => setTab(t.id)}
                  >
                    <t.icon size={14} aria-hidden="true" /> {t.label}
                    {t.id === 'ats' && result ? (
                      <span className="tab__count">{result.scores.optimized.overall}</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <span className="appbar__spacer" />
              <div className="scale-picker" role="group" aria-label="Preview zoom">
                {ZOOMS.map((z) => (
                  <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
            </div>

            {editing && liveResume ? (
              <div id="panel-editor" role="tabpanel">
                <ResumeEditor
                  resume={liveResume}
                  onChange={applyEdit}
                  versions={versions}
                  onSaveVersion={saveVersion}
                  onRestore={onRestore}
                  onClose={() => setEditing(false)}
                  isEdited={isEdited}
                />
              </div>
            ) : (
              <div className="preview-shell">
                <div className="preview-scroll">
                  <div className="zoom-frame" style={{ transform: `scale(${zoom})` }}>
                    {tab === 'original' ? (
                      <div id="panel-original" role="tabpanel">
                        <OriginalPreview
                          theme={render.originalTheme}
                          resume={originalResume}
                          pagination={render.originalPagination}
                          loading={busy === 'parsing'}
                        />
                        {structured && !result ? (
                          <Empty icon={FileText} title="Parsed and ready">
                            Press <strong>Rewrite Resume</strong> to generate the optimized version. This tab shows how
                            the parser read your document so you can verify it before rewriting.
                          </Empty>
                        ) : null}
                      </div>
                    ) : null}

                    {tab === 'optimized' ? (
                      <div id="panel-optimized" role="tabpanel" ref={previewRef}>
                        <OptimizedPreview
                          resume={liveResume}
                          theme={render.theme}
                          pagination={render.pagination}
                          loading={busy === 'pipeline'}
                          guard={result?.guard}
                          changeLog={result?.changeLog}
                          styleName={styleName}
                          isEdited={isEdited}
                          onEdit={() => setEditing(true)}
                        />
                      </div>
                    ) : null}

                    {tab === 'comparison' ? (
                      <div id="panel-comparison" role="tabpanel">
                        <ComparisonView
                          comparison={comparison}
                          changeLog={result?.changeLog}
                          loading={busy === 'pipeline'}
                          onRevertAll={() => {
                            if (!result) return;
                            applyEdit(result.originalResume);
                            toast.info('Restored the original wording', 'Your changes were replaced by the parsed original.');
                          }}
                        />
                      </div>
                    ) : null}

                    {tab === 'ats' ? (
                      <div id="panel-ats" role="tabpanel">
                        <ATSAnalysis
                          scores={result?.scores}
                          match={result?.match}
                          guard={result?.guard}
                          jd={result?.jd}
                          layout={result?.layout}
                          diagnostics={result?.diagnostics}
                          loading={busy === 'pipeline'}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card id="download" title="Download" hint="Built locally, saved straight to your device." icon={Download}>
            <DownloadPanel
              onExport={onExport}
              onPrint={onPrint}
              canExport={Boolean(liveResume)}
              busy={exportBusy}
              pageCount={render.pagination?.pageCount}
              fileHint={`${baseName(file?.name || 'resume')}-optimized`}
            />
          </Card>

          <Card title="How this tool behaves" icon={Info}>
            <div className="stack stack--xs">
              <p className="text-sm"><strong>Nothing is invented.</strong> Missing skills are reported as <span className="mono">MISSING &mdash; NOT FOUND IN SOURCE RESUME</span> and are never inserted.</p>
              <p className="text-sm"><strong>Terminology is only aligned</strong> when your resume already supports the meaning, and every substitution is listed in the change log.</p>
              <p className="text-sm"><strong>Numbers are never created.</strong> Metric-bearing bullets are surfaced first, and a post-rewrite fact guard re-checks every figure, company, role, date and credential.</p>
              <p className="text-sm"><strong>Layout is reproduced</strong> from the detected A4 geometry, typography scale, spacing, bullets and section order - the closest a browser can get.</p>
              <p className="text-sm"><strong>ATS scores are a local heuristic</strong> computed by fixed rules, not a real applicant tracking system.</p>
            </div>
          </Card>
        </div>
      </div>

      <footer className="footer">
        <div className="footer__inner">
          <p className="footer__text">
            Resume Rewriter Studio - a static, client-side app. No backend, no accounts, no telemetry. Your documents are
            held in memory for this session only.
          </p>
          <div className="footer__links">
            <span className="row" style={{ gap: 5 }}><WifiOff size={12} aria-hidden="true" /> Works offline after first load</span>
            <span className="row" style={{ gap: 5 }}><Keyboard size={12} aria-hidden="true" /> Keyboard accessible</span>
            <a href="#resume-upload" className="row" style={{ gap: 3 }}>
              Back to top <ChevronRight size={12} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>

      {/*
        Export root. Kept mounted for the whole session (just moved off-screen)
        so PDF rasterisation and printing work from any tab, including while the
        editor is open. It holds only the A4 pages - none of the preview chrome.
      */}
      {liveResume ? (
        <div className="export-stage" aria-hidden="true">
          <div ref={exportRef} id="rsp-export-root" className="export-root">
            <ResumeRenderer resume={liveResume} theme={render.theme} pages={render.pagination?.pages} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
