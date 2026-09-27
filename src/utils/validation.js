/** Input validation and human-readable error messages. */

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MIN_FILE_BYTES = 24;
export const MAX_JD_CHARS = 40000;
export const MAX_PDF_PAGES = 60;

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx'];
export const SUPPORTED_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream', // some browsers/OS report this for .docx
  'application/zip',
  'application/x-pdf',
];

export const getExtension = (filename) => {
  const name = String(filename || '');
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
};

export const isPdf = (file) => getExtension(file?.name) === 'pdf' || file?.type === 'application/pdf';
export const isDocx = (file) => getExtension(file?.name) === 'docx' || String(file?.type || '').includes('wordprocessingml');

export class ValidationError extends Error {
  constructor(message, code = 'invalid') {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
  }
}

const PDF_MAGIC = '%PDF-';
const ZIP_MAGIC = 'PK\u0003\u0004';
const OLE_MAGIC = '\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1';

const readMagic = async (file, length = 8) => {
  const slice = file.slice(0, length);
  const buf = await slice.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
};

/**
 * Validate an uploaded file. Returns { ok: true, kind } or
 * { ok: false, message, code } with a human-readable message.
 */
export const validateResumeFile = async (file) => {
  if (!file) {
    return { ok: false, code: 'no-file', message: 'No file selected. Choose a PDF or DOCX resume to continue.' };
  }
  const ext = getExtension(file.name);
  const size = file.size;

  if (ext === 'doc' || ext === 'rtf' || ext === 'odt' || ext === 'txt' || ext === 'pages') {
    return {
      ok: false,
      code: 'unsupported-format',
      message: `"${ext.toUpperCase()}" files are not supported. Please export your resume as a PDF or DOCX and try again.`,
    };
  }
  if (!SUPPORTED_EXTENSIONS.includes(ext) && !SUPPORTED_MIME.includes(file.type)) {
    return {
      ok: false,
      code: 'unsupported-format',
      message: `Unsupported file type${ext ? ` (".${ext}")` : ''}. Upload a PDF or DOCX resume.`,
    };
  }
  if (size === 0) {
    return { ok: false, code: 'empty-file', message: 'That file is empty (0 bytes). Please upload a resume that contains text.' };
  }
  if (size < MIN_FILE_BYTES) {
    return {
      ok: false,
      code: 'file-too-small',
      message: 'That file is too small to be a resume. Please check you exported the full document.',
    };
  }
  if (size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'file-too-large',
      message: `That file is ${(size / (1024 * 1024)).toFixed(1)} MB. The browser-only limit is 15 MB. Export a lighter PDF or compress the DOCX.`,
    };
  }

  // magic-number check
  try {
    const magic = await readMagic(file, 8);
    const isPdfSig = magic.startsWith(PDF_MAGIC);
    const isZipSig = magic.startsWith(ZIP_MAGIC);
    const isOleSig = magic.startsWith(OLE_MAGIC);

    if (ext === 'pdf' && !isPdfSig) {
      if (isZipSig) {
        return { ok: false, code: 'wrong-format', message: 'This file is a ZIP archive, not a PDF. Please upload a real PDF or a DOCX.' };
      }
      return { ok: false, code: 'corrupt-pdf', message: 'This file does not start with a valid PDF header. It may be corrupt - try re-exporting it.' };
    }
    if (ext === 'docx' && isPdfSig) {
      return { ok: false, code: 'wrong-format', message: 'This file is a PDF with a .docx name. Rename it to .pdf or upload the DOCX version.' };
    }
    if (ext === 'docx' && isOleSig) {
      return {
        ok: false,
        code: 'legacy-doc',
        message: 'This is a legacy Word 97-2003 (.doc) file, not a DOCX. Open it in Word and "Save As" a .docx file, or export a PDF.',
      };
    }
    if (ext === 'docx' && !isZipSig && !isOleSig) {
      return { ok: false, code: 'corrupt-docx', message: 'This file is not a valid DOCX package. It may be corrupt - try re-saving it from Word.' };
    }
  } catch {
    return { ok: false, code: 'read-failed', message: 'The file could not be read from disk. Please try selecting it again.' };
  }

  return { ok: true, kind: ext === 'pdf' ? 'pdf' : 'docx', ext, size };
};

export const validateJobDescription = (jd) => {
  const text = String(jd || '').trim();
  if (!text) {
    return { ok: false, code: 'empty-jd', message: 'No job description found. Paste a job description so the engine can target the rewrite.' };
  }
  if (text.length < 120) {
    return {
      ok: false,
      code: 'short-jd',
      message: 'The job description is very short. Paste the full posting (including requirements) for a useful rewrite.',
    };
  }
  if (text.length > MAX_JD_CHARS) {
    return { ok: false, code: 'jd-too-long', message: `The job description is too long (${text.length} characters). Trim it to the role requirements section.` };
  }
  return { ok: true, length: text.length };
};

export const extractPasswordError = (err) => {
  const name = String(err?.name || '');
  const msg = String(err?.message || '');
  if (name === 'PasswordException' || /password/i.test(msg)) {
    return 'This PDF is password protected. Remove the password, then export an unlocked copy and upload it again.';
  }
  if (name === 'InvalidPDFException' || /invalid pdf|structure/i.test(msg)) {
    return 'This PDF is corrupt or malformed. Try re-exporting it from your word processor.';
  }
  if (name === 'MissingPDFException') {
    return 'That file is not a readable PDF. Please make sure the file is not truncated by your browser download.';
  }
  if (/xref|stream|endobj/i.test(msg)) {
    return 'This PDF appears to be damaged (broken internal structure). Try re-exporting or re-printing it to PDF.';
  }
  return null;
};

export const extractDocxError = (err) => {
  const msg = String(err?.message || '');
  if (/zip|end of central directory|crc|not a valid/i.test(msg)) {
    return 'This DOCX package is corrupt or incomplete. Re-save it from Word (or Google Docs "Download as .docx") and try again.';
  }
  if (/password|encrypted/i.test(msg)) {
    return 'This DOCX is encrypted or password protected. Remove the protection and upload an unlocked copy.';
  }
  if (/not found|ENOENT/i.test(msg)) {
    return 'The DOCX could not be opened. The file may be damaged or renamed incorrectly.';
  }
  return null;
};

export const scannedPdfMessage =
  'This PDF appears to contain scanned images rather than selectable text. Browser-only processing cannot reliably extract text from it. Please upload a text-based PDF or a DOCX, or enable "Run OCR for scanned PDFs" below.';

export const emptyDocumentMessage =
  'No selectable text was found in this document. It may be a scanned image, an empty template, or a drawing-only file. Upload a text-based PDF or DOCX, or enable OCR for scanned PDFs.';

export default {
  MAX_FILE_BYTES,
  validateResumeFile,
  validateJobDescription,
  extractPasswordError,
  extractDocxError,
  isPdf,
  isDocx,
};
