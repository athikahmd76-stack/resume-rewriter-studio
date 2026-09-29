import { memo } from 'react';
import { Sparkles, ShieldCheck, Pencil } from 'lucide-react';
import { Empty, Notice, Badge } from './ui.jsx';
import ResumeRenderer from '../templates/ResumeRenderer.jsx';
import { A4 } from '../utils/formattingUtils.js';

/**
 * OptimizedPreview - the A4 document as shown in the workspace.
 * The element that gets rasterised / printed lives in App's export stage, so
 * exports keep working from any tab and while the editor is open.
 */
const OptimizedPreview = memo(function OptimizedPreview({
  resume, theme, pagination, loading, guard, changeLog, styleName, onEdit, isEdited,
}) {
  if (loading) {
    return (
      <div className="stack" style={{ padding: 18 }} aria-busy="true" aria-label="Generating optimized resume">
        <div className="skeleton" style={{ height: 26, width: '46%' }} />
        <div className="skeleton" style={{ height: 12, width: '32%' }} />
        <div className="divider" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton" style={{ height: 12, width: `${92 - (i % 3) * 16}%`, marginLeft: 14 }} />
        ))}
      </div>
    );
  }

  if (!resume) {
    return (
      <Empty
        icon={Sparkles}
        title="No optimized resume yet"
        actions={onEdit ? null : null}
      >
        Upload your resume, paste a job description, then press
        {' '}
        <strong>Rewrite Resume</strong>
        {' '}
        to generate a keyword-aligned, ATS-friendly version. Every change is shown in the Comparison tab.
      </Empty>
    );
  }

  const pageCount = pagination?.pageCount || 1;

  return (
    <div className="stack stack--sm">
      <div className="row row--between" style={{ padding: '0 2px' }}>
        <div className="row" style={{ gap: 7 }}>
          <Badge tone="brand">{styleName}</Badge>
          <Badge tone="neutral">A4 &middot; {pagination?.page?.widthMm || '210'} &times; {pagination?.page?.heightMm || '297'} mm</Badge>
          <Badge tone="info">{pageCount} page{pageCount > 1 ? 's' : ''}</Badge>
          {isEdited ? <Badge tone="warn">edited by you</Badge> : null}
        </div>
        {onEdit ? (
          <button type="button" className="btn btn--sm btn--subtle" onClick={onEdit}>
            <Pencil size={13} aria-hidden="true" /> Edit resume
          </button>
        ) : null}
      </div>

      {guard && guard.blocked.length > 0 ? (
        <Notice tone="danger" title="Fact guard blocked unsupported content.">
          {guard.blocked.length} item(s) were removed because they were not present in your source resume. Review the
          Comparison tab before downloading.
        </Notice>
      ) : null}

      <div className="preview-pages">
        <ResumeRenderer resume={resume} theme={theme} pages={pagination?.pages} />
      </div>

      <p className="text-xs text-muted" style={{ padding: '0 2px' }}>
        <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} aria-hidden="true" />
        Rendered from structured data using the detected A4 page geometry
        {' '}
        ({A4.widthMm} &times; {A4.heightMm} mm reference)
        {changeLog?.length ? ` \u00b7 ${changeLog.filter((c) => !c.advice).length} applied change${changeLog.filter((c) => !c.advice).length === 1 ? '' : 's'}` : ''}
        . Headings are kept with their content, experience entries are kept together where they fit, and metric-bearing
        bullets are surfaced first.
      </p>
    </div>
  );
});

export default OptimizedPreview;
