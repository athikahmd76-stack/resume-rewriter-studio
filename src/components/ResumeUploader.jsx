import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Upload, X, RefreshCw, AlertTriangle, ScanLine, Loader2, FileCheck2, CheckCircle2,
} from 'lucide-react';
import { Card, Notice, Badge } from './ui.jsx';
import { isPdf, MAX_FILE_BYTES } from '../utils/validation.js';
import { formatBytes } from '../utils/textUtils.js';

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const statusMeta = {
  idle: { tone: 'neutral', label: 'Waiting for file' },
  reading: { tone: 'info', label: 'Reading' },
  ok: { tone: 'ok', label: 'Parsed' },
  error: { tone: 'danger', label: 'Failed' },
  warning: { tone: 'warn', label: 'Needs attention' },
};

/**
 * ResumeUploader
 * - drag & drop with animated state
 * - file metadata (name, size, type, status)
 * - replace / remove
 * - optional OCR toggle for scanned PDFs
 */
const ResumeUploader = memo(function ResumeUploader({
  file, onFile, onRemove, status = 'idle', error, parsingLabel, ocrEnabled, onOcrToggle, ocrStatus, isBusy,
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleFiles = useCallback((list) => {
    const picked = Array.from(list || []);
    if (!picked.length) return;
    onFile(picked[0]);
  }, [onFile]);

  useEffect(() => {
    const prevent = (e) => { e.preventDefault(); };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    handleFiles(e.dataTransfer?.files);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const meta = statusMeta[status] || statusMeta.idle;
  const kind = file ? (isPdf(file) ? 'pdf' : 'docx') : null;

  return (
    <Card
      id="resume-upload"
      title="Resume upload"
      hint="Your file never leaves this device."
      icon={FileText}
      actions={file ? (
        <div className="row" style={{ gap: 5 }}>
          <button type="button" className="btn btn--sm btn--subtle" onClick={openPicker} disabled={isBusy}>
            <RefreshCw size={13} aria-hidden="true" /> Replace
          </button>
          <button type="button" className="btn btn--sm btn--danger" onClick={onRemove} disabled={isBusy}>
            <X size={13} aria-hidden="true" /> Remove
          </button>
        </div>
      ) : null}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        aria-label="Upload resume PDF or DOCX"
      />

      {!file ? (
        <div
          className={`dropzone${dragging ? ' dropzone--active' : ''}${error ? ' dropzone--error' : ''}`}
          onDragEnter={(e) => { e.preventDefault(); dragDepth.current += 1; setDragging(true); }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => { e.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }}
          onDrop={onDrop}
          onClick={openPicker}
          onKeyDown={onKeyDown}
          role="button"
          tabIndex={0}
          aria-label="Drop your resume here, or press Enter to browse for a PDF or DOCX file"
        >
          <Upload size={26} style={{ color: 'var(--brand)' }} aria-hidden="true" />
          <p className="dropzone__title">Drop your resume here</p>
          <p className="dropzone__hint">or click to browse &middot; nothing is uploaded to a server</p>
          <div className="dropzone__formats">
            <Badge tone="danger">PDF</Badge>
            <Badge tone="brand">DOCX</Badge>
            <Badge tone="neutral">max {formatBytes(MAX_FILE_BYTES)}</Badge>
          </div>
        </div>
      ) : (
        <div className="stack stack--sm">
          <div className="filelist">
            <span className={`filelist__icon filelist__icon--${kind}`} aria-hidden="true">
              {kind === 'pdf' ? 'PDF' : 'DOCX'}
            </span>
            <div className="filelist__meta">
              <p className="filelist__name" title={file.name}>{file.name}</p>
              <p className="filelist__sub">
                <span>{formatBytes(file.size)}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{kind === 'pdf' ? 'PDF document' : 'Word document'}</span>
                <span aria-hidden="true">&middot;</span>
                <span>{file.type || 'unknown type'}</span>
              </p>
            </div>
            <Badge tone={meta.tone}>
              {status === 'reading' ? <Loader2 size={11} className="spin" aria-hidden="true" /> : null}
              {meta.label}
            </Badge>
          </div>

          {status === 'reading' ? (
            <div className="row text-sm text-muted">
              <Loader2 size={14} className="spin" aria-hidden="true" />
              <span>{parsingLabel || 'Parsing document locally...'}</span>
            </div>
          ) : null}

          {status === 'ok' ? (
            <div className="row text-sm" style={{ color: 'var(--ok)' }}>
              <CheckCircle2 size={14} aria-hidden="true" />
              <span>Document parsed in your browser. Content is held in memory only.</span>
            </div>
          ) : null}

          {error ? (
            <Notice
              tone={error.needsOcr ? 'warn' : 'danger'}
              icon={error.needsOcr ? ScanLine : AlertTriangle}
              title={error.needsOcr ? 'Scanned PDF detected' : 'Could not read that file'}
              actions={error.needsOcr ? (
                <button
                  type="button"
                  className="btn btn--sm btn--subtle"
                  onClick={() => onOcrToggle?.(true)}
                  disabled={isBusy || ocrStatus === 'running'}
                >
                  <ScanLine size={13} aria-hidden="true" /> Enable OCR for scanned PDF
                </button>
              ) : (
                <button type="button" className="btn btn--sm btn--subtle" onClick={openPicker}>
                  <RefreshCw size={13} aria-hidden="true" /> Try another file
                </button>
              )}
            >
              {error.message}
            </Notice>
          ) : null}

          {ocrEnabled ? (
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="text-sm text-muted">
                {ocrStatus === 'running'
                  ? 'Running OCR in the browser...'
                  : ocrStatus === 'done'
                    ? 'OCR finished - text extracted from the scanned pages.'
                    : 'OCR enabled - text will be extracted in your browser. This can be slow for large scans.'}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--subtle"
                onClick={() => onOcrToggle?.(false)}
                disabled={ocrStatus === 'running'}
              >
                Disable OCR
              </button>
            </div>
          ) : null}
        </div>
      )}

      {file && status === 'ok' ? (
        <p className="text-xs text-muted row" style={{ gap: 6 }}>
          <FileCheck2 size={13} aria-hidden="true" />
          Section structure, fonts, spacing and bullet style were read from the original and will be preserved.
        </p>
      ) : null}
    </Card>
  );
});

export default ResumeUploader;
