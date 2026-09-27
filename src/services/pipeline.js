/**
 * The local processing pipeline. Every step runs in the browser.
 *
 *   parse -> layout -> structure -> JD analysis -> keyword match
 *         -> rewrite -> fact guard -> paginate -> score
 */

import { analyzeLayout } from './layoutAnalyzer.js';
import { parseResume } from './resumeParser.js';
import { analyzeJobDescription } from './jdAnalyzer.js';
import { matchKeywords } from './keywordMatcher.js';
import { rewriteResume, DEFAULT_SETTINGS } from './resumeRewriter.js';
import { scoreComparison } from './atsScorer.js';
import { buildBlocks, paginate } from './paginationEngine.js';
import { buildTheme } from '../templates/theme.js';
import { isPdf, isDocx, validateResumeFile } from '../utils/validation.js';
import { resumeToText } from './resumeModel.js';

export const STEPS = [
  { id: 'uploading', label: 'Uploading' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'analyzing', label: 'Analyzing' },
  { id: 'matching', label: 'Matching' },
  { id: 'rewriting', label: 'Rewriting' },
  { id: 'rendering', label: 'Rendering' },
  { id: 'ready', label: 'Ready' },
];

const yieldToUi = () => new Promise((resolve) => setTimeout(resolve, 16));

/**
 * Parse an uploaded file into the intermediate document model.
 * The format-specific parsers are imported lazily so their heavy dependencies
 * (PDF.js worker, Mammoth) are only fetched when a matching file is opened.
 */
export const parseFile = async (file, onProgress = () => {}) => {
  const validation = await validateResumeFile(file);
  if (!validation.ok) {
    const error = new Error(validation.message);
    error.code = validation.code;
    throw error;
  }
  onProgress(4, `Reading ${validation.kind.toUpperCase()}`);
  await yieldToUi();
  if (isPdf(file)) {
    const { parsePdf, pdfToDocument } = await import('./pdfParser.js');
    // The resume/layout parsers read a flat `blocks` list, so the PDF has to be
    // flattened into the shared document shape here.
    return pdfToDocument(await parsePdf(file, onProgress));
  }
  if (isDocx(file)) {
    const { parseDocx } = await import('./docxParser.js');
    return parseDocx(file, onProgress);
  }
  const error = new Error('Unsupported file type. Upload a PDF or DOCX resume.');
  error.code = 'unsupported-format';
  throw error;
};

/** Build the structured model + layout model from a parsed document. */
export const structureDocument = (parsed) => {
  const { resume, sections, diagnostics, headerLines } = parseResume(parsed);
  const layout = analyzeLayout(parsed, sections.map((s) => s.id));
  return { resume, sections, diagnostics, layout, headerLines };
};

/**
 * Full local rewrite run.
 * @param {object} input
 * @param {File} input.file
 * @param {object} input.preparsed  already-parsed document (demo mode)
 * @param {string} input.jobDescription
 * @param {string[]} input.userKeywords
 * @param {string} input.targetRole
 * @param {object} input.settings
 * @param {(stepId:string, pct:number, label:string)=>void} input.onProgress
 */
export const runPipeline = async ({
  file = null,
  preparsed = null,
  structured = null,
  jobDescription = '',
  userKeywords = [],
  targetRole = '',
  settings = {},
  onProgress = () => {},
}) => {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  const startedAt = performance.now();

  onProgress('uploading', 2, 'Uploading');
  await yieldToUi();

  // ---- parse --------------------------------------------------------------
  let parsed = preparsed;
  let layout = null;
  let originalResume = null;
  let diagnostics = null;
  let sectionMeta = null;
  let fileInfo = null;

  if (structured) {
    ({ resume: originalResume, layout, diagnostics, sections: sectionMeta } = structured);
  } else if (parsed) {
    onProgress('parsing', 10, 'Structuring');
    const result = structureDocument(parsed);
    originalResume = result.resume;
    layout = result.layout;
    diagnostics = result.diagnostics;
    sectionMeta = result.sections;
  } else if (file) {
    onProgress('parsing', 6, 'Parsing document');
    parsed = await parseFile(file, (pct, label) => onProgress('parsing', 6 + (pct * 0.62), label));
    onProgress('parsing', 70, 'Structuring resume');
    await yieldToUi();
    const result = structureDocument(parsed);
    originalResume = result.resume;
    layout = result.layout;
    diagnostics = result.diagnostics;
    sectionMeta = result.sections;
    fileInfo = { name: file.name, size: file.size, type: file.type, kind: parsed.kind };
  } else {
    const error = new Error('No resume was provided. Upload a PDF or DOCX resume first.');
    error.code = 'no-input';
    throw error;
  }

  // ---- JD analysis --------------------------------------------------------
  onProgress('analyzing', 74, 'Analyzing job description');
  await yieldToUi();
  const jd = analyzeJobDescription(jobDescription, { targetRole, userKeywords });

  onProgress('matching', 80, 'Matching keywords');
  await yieldToUi();
  const match = matchKeywords(originalResume, jd, userKeywords);

  // ---- rewrite ------------------------------------------------------------
  onProgress('rewriting', 86, 'Rewriting content');
  await yieldToUi();
  const rewrite = rewriteResume({
    resume: originalResume,
    match,
    jd,
    userSettings: merged,
  });
  const optimizedResume = rewrite.resume;

  // ---- scoring ------------------------------------------------------------
  onProgress('rendering', 92, 'Scoring and paginating');
  await yieldToUi();
  const scores = scoreComparison(originalResume, optimizedResume, jd, match, layout);

  // ---- pagination ---------------------------------------------------------
  const buildPages = (resume, styleId) => {
    const theme = buildTheme({ styleId, layout, preserveLayout: merged.preserveLayout });
    const blocks = buildBlocks(resume, theme);
    const pagination = paginate(blocks, theme);
    return { theme, blocks, pagination };
  };

  const optimizedPages = buildPages(optimizedResume, 'minimal');
  const originalPages = buildPages(originalResume, 'minimal');

  onProgress('ready', 100, 'Ready');

  return {
    parsed,
    layout,
    originalResume,
    optimizedResume,
    sections: sectionMeta,
    diagnostics,
    jd,
    match,
    rewrite,
    changeLog: rewrite.changeLog,
    guard: rewrite.guard,
    settings: merged,
    scores,
    theme: optimizedPages.theme,
    pagination: optimizedPages.pagination,
    blocks: optimizedPages.blocks,
    originalPagination: originalPages.pagination,
    originalTheme: originalPages.theme,
    originalText: resumeToText(originalResume),
    fileInfo,
    durationMs: Math.round(performance.now() - startedAt),
  };
};

export default runPipeline;
