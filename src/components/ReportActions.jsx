import { memo, useState } from 'react';
import {
  FileType, FileCode, FileJson, FileText, Loader2, Download, ShieldCheck, Info, ClipboardCheck,
} from 'lucide-react';
import { Notice, Badge } from './ui.jsx';
import { REPORT_FORMATS } from '../services/reportBuilder.js';

const ICONS = {
  pdf: FileType,
  html: FileCode,
  md: FileText,
  json: FileJson,
};

const TONES = {
  pdf: 'pdf',
  html: 'html',
  md: 'md',
  json: 'json',
};

/**
 * ReportActions - one download control for the analysis report, rendered in
 * every surface that needs it (app bar, download panel, analysis tab).
 *
 * `variant` controls density only; the formats and the wording are identical so
 * the report is described the same way wherever the user finds it.
 */
const ReportActions = memo(function ReportActions({
  onDownload,
  canDownload,
  busy,
  variant = 'panel',
  fileHint,
  lastFormat,
  compact = false,
}) {
  const [open, setOpen] = useState(false);

  if (!canDownload) {
    if (variant !== 'appbar') return null;
    return (
      <button type="button" className="btn btn--sm btn--ghost" disabled title="Generate the rewrite to download a report">
        <ClipboardCheck size={13} aria-hidden="true" /> Report
      </button>
    );
  }

  if (compact || variant === 'appbar') {
    return (
      <div className="report-dl">
        <button
          type="button"
          className="btn btn--sm btn--subtle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {busy ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <ClipboardCheck size={13} aria-hidden="true" />}
          Analysis report
        </button>
        {open ? (
          <div className="report-dl__menu" role="menu">
            {REPORT_FORMATS.map((f) => {
              const Icon = ICONS[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  role="menuitem"
                  className="report-dl__item"
                  disabled={Boolean(busy)}
                  onClick={() => onDownload(f.id)}
                >
                  <span className={`dl-card__icon dl-card__icon--${TONES[f.id]}`} aria-hidden="true">
                    {busy === f.id ? <Loader2 size={15} className="spin" /> : <Icon size={15} />}
                  </span>
                  <span className="grow">
                    <span className="report-dl__label">{f.label}</span>
                    <span className="report-dl__hint">{f.hint}</span>
                  </span>
                  <Download size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="stack stack--sm">
      <div className="report-dl__intro">
        <p className="report-dl__title">
          <ClipboardCheck size={15} aria-hidden="true" />
          Analysis report
        </p>
        <p className="report-dl__sub">
          Your Job Match %, ATS score before and after, the full SWOT and the keyword tables - as a single file.
        </p>
      </div>

      <div className="report-dl__grid">
        {REPORT_FORMATS.map((f) => {
          const Icon = ICONS[f.id];
          return (
            <button
              key={f.id}
              type="button"
              className="dl-card dl-card--btn"
              disabled={Boolean(busy)}
              onClick={() => onDownload(f.id)}
            >
              <span className={`dl-card__icon dl-card__icon--${TONES[f.id]}`} aria-hidden="true">
                {busy === f.id ? <Loader2 size={17} className="spin" /> : <Icon size={17} />}
              </span>
              <span className="dl-card__meta">
                <span className="dl-card__title">{f.label}</span>
                <span className="dl-card__sub">{f.hint}</span>
              </span>
              <Download size={15} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {busy ? (
        <Notice tone="info" icon={Info} title="Building the report in this tab.">
          Nothing is uploaded. The file is composed from the same numbers you see on screen and saved straight to your
          device.
        </Notice>
      ) : null}

      {lastFormat && !busy ? (
        <Notice tone="ok" icon={ShieldCheck} title="Report saved on this device.">
          {fileHint ? <>{fileHint} was written to your downloads folder. </> : null}
          It contains your own resume data only, so store it somewhere private.
        </Notice>
      ) : null}

      <p className="text-xs text-muted row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <ShieldCheck size={13} style={{ flex: 'none', marginTop: 1 }} aria-hidden="true" />
        The report repeats the same honesty rules as the tool: gaps are reported, never filled in.
        {!variant ? null : <Badge tone="neutral">local only</Badge>}
      </p>
    </div>
  );
});

export { ICONS as REPORT_ICONS };
export default ReportActions;
