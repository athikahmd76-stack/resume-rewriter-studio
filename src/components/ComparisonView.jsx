import { memo } from 'react';
import { Columns2, Plus, Minus, ArrowUp, ArrowDown } from 'lucide-react';
import { Empty, Badge, Notice } from './ui.jsx';

const Spans = memo(function Spans({ spans }) {
  if (!spans || !spans.length) return null;
  return spans.map((s, i) => (
    <span key={i} className={`d-${s.type}`}>{s.text}</span>
  ));
});

const Row = memo(function Row({ row }) {
  if (!row.changed) return null;
  return (
    <div className="cmp__row">
      <span className="cmp__rowlabel">{row.label}</span>
      <span className="cmp__rowvalue"><Spans spans={row.spans} /></span>
    </div>
  );
});

const BulletPair = memo(function BulletPair({ pair, side }) {
  if (side === 'from') {
    if (pair.kind === 'added') {
      return (
        <div className="cmp__bullet" style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>
          (not in original)
        </div>
      );
    }
    return (
      <div className="cmp__bullet">
        {pair.kind === 'rewritten' ? <Spans spans={pair.spans.filter((s) => s.type !== 'added')} /> : pair.from}
      </div>
    );
  }
  if (pair.kind === 'removed') {
    return (
      <div className="cmp__bullet" style={{ color: 'var(--muted-2)', fontStyle: 'italic' }}>
        (removed by the engine)
      </div>
    );
  }
  return (
    <div className="cmp__bullet">
      {pair.kind === 'rewritten' ? <Spans spans={pair.spans.filter((s) => s.type !== 'removed')} /> : pair.to}
    </div>
  );
});

const Entries = memo(function Entries({ entries, side }) {
  if (!entries?.length) return null;
  return entries.map((entry) => (
    <div key={entry.key} className="cmp__entry">
      <p className="cmp__entry-head">{entry.label}</p>
      {entry.sublabel ? <p className="cmp__entry-sub">{entry.sublabel}</p> : null}
      {side === 'to' && entry.headerChanges?.length ? (
        <div className="stack stack--xs" style={{ marginBottom: 7 }}>
          {entry.headerChanges.map((r) => <Row key={r.key} row={r} />)}
        </div>
      ) : null}
      {entry.bulletPairs.map((pair) => (
        <BulletPair key={pair.key} pair={pair} side={side} />
      ))}
    </div>
  ));
});

/**
 * ComparisonView - side-by-side original vs optimized with word-level diff
 * highlighting.
 */
const ComparisonView = memo(function ComparisonView({ comparison, changeLog, loading, onRevertAll }) {
  if (loading) {
    return (
      <div className="stack" style={{ padding: 18 }} aria-busy="true">
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 160 }} />
      </div>
    );
  }
  if (!comparison) {
    return (
      <Empty icon={Columns2} title="No comparison yet">
        Generate the rewrite and every changed word will be highlighted here - green for added wording, red for removed
        wording.
      </Empty>
    );
  }

  const { sections, totals } = comparison;

  return (
    <div className="stack">
      <div className="row row--between">
        <div className="row" style={{ gap: 8 }}>
          <Badge tone="ok">+{totals.addedWords} words added</Badge>
          <Badge tone="danger">-{totals.removedWords} words removed</Badge>
          <Badge tone="info">{totals.changedBlocks} blocks changed</Badge>
        </div>
        {onRevertAll ? (
          <button type="button" className="btn btn--sm btn--subtle" onClick={onRevertAll}>
            <ArrowDown size={13} aria-hidden="true" /> Restore original wording
          </button>
        ) : null}
      </div>

      <div className="cmp">
        <div className="cmp__col">
          <div className="cmp__head cmp__head--from">
            <ArrowUp size={13} aria-hidden="true" /> Original
          </div>
          <div className="cmp__body">
            {sections.map((section) => (
              <div key={section.id} className="cmp__section">
                <p className="cmp__section-title">{section.label}</p>
                {section.rows?.length ? section.rows.map((r) => (
                  <div key={`${section.id}-${r.key}`} className="cmp__row">
                    <span className="cmp__rowlabel">{r.label}</span>
                    <span className="cmp__rowvalue d-equal">{r.from || <span className="text-muted">(empty)</span>}</span>
                  </div>
                )) : null}
                {section.entries?.length ? <Entries entries={section.entries} side="from" /> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="cmp__col">
          <div className="cmp__head cmp__head--to">
            <Plus size={13} aria-hidden="true" /> Optimized
          </div>
          <div className="cmp__body">
            {sections.map((section) => (
              <div key={section.id} className="cmp__section">
                <p className="cmp__section-title">{section.label}</p>
                {section.note ? <Notice tone="warn">{section.note}</Notice> : null}
                {section.rows?.length ? section.rows.map((r) => (
                  <div key={`${section.id}-${r.key}`} className="cmp__row">
                    <span className="cmp__rowlabel">{r.label}</span>
                    <span className="cmp__rowvalue"><Spans spans={r.spans} /></span>
                  </div>
                )) : null}
                {section.entries?.length ? <Entries entries={section.entries} side="to" /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack stack--xs">
        <div className="cmp__legend">
          <span><span className="cmp__key" style={{ background: '#dcfce7', border: '1px solid #86efac' }} /> added wording</span>
          <span><span className="cmp__key" style={{ background: '#fee2e2', border: '1px solid #fca5a5' }} /> removed wording</span>
          <span><span className="cmp__key" style={{ background: '#f1f5f9', border: '1px solid #cbd5e1' }} /> unchanged</span>
        </div>
      </div>

      {changeLog?.length ? (
        <details className="card" style={{ boxShadow: 'none' }}>
          <summary className="card__head" style={{ cursor: 'pointer', listStyle: 'revert' }}>
            <span className="card__icon" aria-hidden="true"><Columns2 size={15} /></span>
            <div className="grow">
              <h3 className="card__title">Change log ({changeLog.length})</h3>
              <p className="card__hint">Every transformation the local engine applied, in order.</p>
            </div>
          </summary>
          <div className="card__body" style={{ paddingTop: 8 }}>
            <div className="kw-list">
              {changeLog.map((c, i) => (
                <div key={`${c.type}-${i}`} className="kw" style={{ alignItems: 'flex-start' }}>
                  <span className="badge badge--neutral nowrap" style={{ marginTop: 1 }}>{c.type}</span>
                  <div className="grow">
                    <p className="kw__name" style={{ fontWeight: 560 }}>{c.label}</p>
                    {c.from && c.to && c.from !== c.to ? (
                      <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                        <span className="d-removed">{c.from}</span>{' '}
                        <ArrowUp size={10} style={{ verticalAlign: -1 }} aria-hidden="true" />{' '}
                        <span className="d-added">{c.to}</span>
                      </p>
                    ) : null}
                    <p className="text-xs text-muted mono" style={{ marginTop: 2 }}>{c.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : (
        <Notice tone="info">No changes were needed - your resume already matched the job description well.</Notice>
      )}
    </div>
  );
});

export default ComparisonView;
