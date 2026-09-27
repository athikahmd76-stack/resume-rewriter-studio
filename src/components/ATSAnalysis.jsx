import { memo, useMemo, useState } from 'react';
import {
  Gauge as GaugeIcon, CheckCircle2, AlertTriangle, XCircle, Info, ShieldCheck, Lightbulb, Target, Layers,
} from 'lucide-react';
import { Card, Empty, Notice, Badge, Kv, Progress } from './ui.jsx';

const scoreColor = (v) => (v >= 80 ? 'var(--ok)' : v >= 60 ? '#65a30d' : v >= 42 ? '#d97706' : 'var(--danger)');

const Gauge = memo(function Gauge({ value, band, delta }) {
  const size = 200;
  const stroke = 15;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="gauge">
      <svg width={size} height={size} role="img" aria-label={`Heuristic ATS match score ${pct} percent`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={band?.color || scoreColor(pct)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s var(--ease)' }}
        />
      </svg>
      <div className="gauge__center">
        <span className="gauge__value" style={{ color: band?.color || scoreColor(pct) }}>{pct}%</span>
        <span className="gauge__label" style={{ color: 'var(--muted)' }}>Heuristic</span>
        {delta ? (
          <span className="gauge__delta" style={{ color: delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : 'var(--muted)' }}>
            {delta > 0 ? `+${delta}` : delta} pts vs original
          </span>
        ) : null}
      </div>
    </div>
  );
});

const MetricRow = memo(function MetricRow({ component, originalValue }) {
  const delta = originalValue !== undefined ? component.value - originalValue : null;
  const stuck = delta === 0 && component.lockedReason;
  return (
    <div className="metric" title={component.hint}>
      <span className="metric__label">{component.label}</span>
      <span className="metric__value" style={{ color: scoreColor(component.value) }}>
        {component.value}%
        {delta !== null && Math.abs(delta) >= 1 ? (
          <span style={{ color: delta > 0 ? 'var(--ok)' : 'var(--danger)', fontSize: 11, marginLeft: 5 }}>
            {delta > 0 ? '+' : ''}{Math.round(delta)}
          </span>
        ) : null}
      </span>
      <span className="metric__bar">
        <span className="metric__fill" style={{ width: `${component.value}%`, background: scoreColor(component.value) }} />
      </span>
      {stuck ? (
        <span className="metric__why">
          <span className="ba-comp__whytag">{component.movable === 'conditional' ? 'Evidence-limited' : 'Locked'}</span>
          {component.lockedReason}
        </span>
      ) : null}
    </div>
  );
});

const KEYWORD_VIEWS = [
  { id: 'matched', label: 'Matched', tone: 'ok', icon: CheckCircle2 },
  { id: 'synonyms', label: 'Synonym aligned', tone: 'info', icon: Layers },
  { id: 'missing', label: 'Missing', tone: 'warn', icon: AlertTriangle },
  { id: 'repeated', label: 'Repeated', tone: 'danger', icon: XCircle },
];

const KeywordRow = memo(function KeywordRow({ item, kind }) {
  if (kind === 'missing') {
    return (
      <div className="kw" style={{ background: 'var(--warn-soft)', borderColor: '#fde68a' }}>
        <AlertTriangle size={14} style={{ color: 'var(--warn)', flex: 'none' }} aria-hidden="true" />
        <span className="kw__name">{item.display}</span>
        <span className="kw__meta">
          <Badge tone="warn">{item.source === 'user' ? 'your keyword' : item.priority}</Badge>
          <Badge tone="neutral">MISSING &mdash; NOT FOUND IN SOURCE RESUME</Badge>
        </span>
      </div>
    );
  }
  if (kind === 'synonyms') {
    return (
      <div className="kw" style={{ background: 'var(--info-soft)', borderColor: '#bae6fd' }}>
        <Layers size={14} style={{ color: 'var(--info)', flex: 'none' }} aria-hidden="true" />
        <span className="kw__name">{item.display}</span>
        <span className="kw__meta">
          <span className="text-xs">source: &ldquo;{item.resumeTerm}&rdquo;</span>
          <Badge tone={item.canInsert ? 'brand' : 'neutral'}>{item.canInsert ? 'terminology aligned' : 'left as-is'}</Badge>
        </span>
      </div>
    );
  }
  if (kind === 'repeated') {
    return (
      <div className="kw" style={{ background: 'var(--danger-soft)', borderColor: '#fecaca' }}>
        <XCircle size={14} style={{ color: 'var(--danger)', flex: 'none' }} aria-hidden="true" />
        <span className="kw__name">{item.term}</span>
        <span className="kw__meta"><Badge tone="danger">{item.mentions} mentions</Badge></span>
      </div>
    );
  }
  const where = Object.entries(item.locations || {}).filter(([, v]) => v).map(([k]) => k);
  return (
    <div className="kw" style={{ background: 'var(--ok-soft)', borderColor: '#bbf7d0' }}>
      <CheckCircle2 size={14} style={{ color: 'var(--ok)', flex: 'none' }} aria-hidden="true" />
      <span className="kw__name">{item.display}</span>
      <span className="kw__meta">
        {where.length ? <span className="text-xs">in {where.join(', ')}</span> : null}
        <Badge tone="ok">{item.mentions} mention{item.mentions > 1 ? 's' : ''}</Badge>
      </span>
    </div>
  );
});

/**
 * ATSAnalysis - a professional, fully local, deterministic analysis dashboard.
 */
const ATSAnalysis = memo(function ATSAnalysis({ scores, match, guard, jd, layout, diagnostics, loading }) {
  const [view, setView] = useState('matched');

  const keywordBuckets = useMemo(() => ({
    matched: (match?.matched || []).filter((m) => m.status === 'MATCHED'),
    synonyms: match?.synonyms || [],
    missing: match?.missing || [],
    repeated: match?.repeated || [],
  }), [match]);

  if (loading) {
    return (
      <div className="stack" style={{ padding: 18 }} aria-busy="true">
        <div className="skeleton" style={{ height: 190, borderRadius: 16 }} />
        <div className="skeleton" style={{ height: 150 }} />
      </div>
    );
  }
  if (!scores) {
    return (
      <Empty icon={GaugeIcon} title="No ATS analysis yet">
        Scores are produced by a deterministic local heuristic - not by a real applicant tracking system. Generate the
        rewrite to see keyword coverage, alignment and recommendations.
      </Empty>
    );
  }

  const opt = scores.optimized;
  const orig = scores.original;
  const delta = opt.overall - orig.overall;

  return (
    <div className="stack">
      <Notice tone="info" icon={Info} title="Local heuristic estimate.">
        {opt.disclaimer} Every number below is produced by fixed local rules in your browser - no external service was
        contacted and no resume data left this device.
      </Notice>

      <div className="card">
        <div className="card__body">
          <div className="gauge-grid">
            <div>
              <Gauge value={opt.overall} band={opt.band} delta={delta} />
              <p className="text-xs text-muted" style={{ textAlign: 'center', marginTop: 8 }}>
                Original scored {orig.overall}% &middot; Optimized {opt.overall}% ({delta > 0 ? '+' : ''}{delta} points)
              </p>
            </div>
            <div className="metric-list">
              {opt.components.map((c) => (
                <MetricRow key={c.id} component={c} originalValue={orig.components.find((o) => o.id === c.id)?.value} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <p className="stat__value">{opt.metrics.bulletCount}</p>
          <p className="stat__label">Experience bullets</p>
          <p className="stat__sub">avg {opt.metrics.avgBulletWords} words</p>
        </div>
        <div className="stat">
          <p className="stat__value">{opt.metrics.metricBullets}</p>
          <p className="stat__label">Bullets with metrics</p>
          <p className="stat__sub">{opt.metrics.bulletCount ? Math.round((opt.metrics.metricBullets / opt.metrics.bulletCount) * 100) : 0}% quantified</p>
        </div>
        <div className="stat">
          <p className="stat__value">{opt.metrics.skillCount}</p>
          <p className="stat__label">Skills detected</p>
          <p className="stat__sub">across {opt.metrics.sectionCount} sections</p>
        </div>
        <div className="stat">
          <p className="stat__value">{match?.summary?.coverage ?? 0}%</p>
          <p className="stat__label">Keyword coverage</p>
          <p className="stat__sub">{match?.summary?.matched ?? 0} of {match?.summary?.targetsConsidered ?? 0} targets</p>
        </div>
      </div>

      {/* ---------------- keyword panels ---------------- */}
      <Card
        id="ats-keywords"
        title="Keyword analysis"
        hint="Compared against the source resume, the job description and your target keywords."
        icon={Target}
      >
        <div className="subtabs" role="group" aria-label="Keyword category filter">
          {KEYWORD_VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="subtab"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label} ({keywordBuckets[v.id].length})
            </button>
          ))}
        </div>

        {keywordBuckets[view].length ? (
          <div className="kw-list">
            {keywordBuckets[view].slice(0, 60).map((item) => (
              <KeywordRow key={`${view}-${item.term || item.display}`} item={item} kind={view} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Nothing in this category.</p>
        )}

        {view === 'missing' && keywordBuckets.missing.length ? (
          <Notice tone="warn" title="These were not added.">
            The engine reports them and stops. A keyword that is not in your source resume must never appear as a skill
            you claim - add it yourself only if it is genuinely true.
          </Notice>
        ) : null}
      </Card>

      {/* ---------------- unsupported ---------------- */}
      {match?.unsupported?.length ? (
        <Card
          title={`Unsupported by your source resume (${match.unsupported.length})`}
          hint="Requested by the job description, absent from your resume. Never injected."
          icon={ShieldCheck}
        >
          <div className="kw-list">
            {match.unsupported.slice(0, 40).map((m) => (
              <div key={`uns-${m.term}`} className="kw" style={{ background: 'var(--panel-2)' }}>
                <XCircle size={14} style={{ color: 'var(--muted)', flex: 'none' }} aria-hidden="true" />
                <span className="kw__name">{m.display}</span>
                <span className="kw__meta">
                  <Badge tone="neutral">{m.category}</Badge>
                  <span className="text-xs">not added</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ---------------- recommendations ---------------- */}
      <Card title="Recommendations" hint="Deterministic rules, sorted by severity." icon={Lightbulb}>
        <div className="stack stack--sm">
          {opt.recommendations.map((rec) => (
            <div key={rec.id} className={`rec rec--${rec.level}`}>
              {rec.level === 'warning' ? (
                <AlertTriangle size={16} className="rec__icon" style={{ color: 'var(--warn)' }} aria-hidden="true" />
              ) : rec.level === 'success' ? (
                <CheckCircle2 size={16} className="rec__icon" style={{ color: 'var(--ok)' }} aria-hidden="true" />
              ) : (
                <Info size={16} className="rec__icon" style={{ color: 'var(--info)' }} aria-hidden="true" />
              )}
              <div className="grow">
                <p className="rec__title">{rec.title}</p>
                {rec.detail ? <p className="rec__detail">{rec.detail}</p> : null}
                {rec.note ? <p className="rec__note">{rec.note}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ---------------- fact guard ---------------- */}
      {guard ? (
        <Card
          title="Fact guard"
          hint="Post-rewrite verification that nothing unsupported was introduced."
          icon={ShieldCheck}
          iconTone={guard.passed ? 'ok' : 'danger'}
          actions={<Badge tone={guard.passed ? 'ok' : 'danger'}>{guard.passed ? 'passed' : `${guard.blocked.length} blocked`}</Badge>}
        >
          <Notice tone={guard.passed ? 'ok' : 'danger'}>
            {guard.guarantee}
          </Notice>
          {guard.issues.length ? (
            <div className="kw-list">
              {guard.issues.map((issue, i) => (
                <div key={`${issue.kind}-${i}`} className="kw" style={{ alignItems: 'flex-start' }}>
                  <Badge tone={issue.severity === 'critical' ? 'danger' : 'warn'}>{issue.kind}</Badge>
                  <span className="kw__name" style={{ fontWeight: 520 }}>{issue.detail}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              The deterministic guard found no new numbers, companies, roles, certifications, education entries or skills
              beyond the source resume.
            </p>
          )}
        </Card>
      ) : null}

      {/* ---------------- JD breakdown ---------------- */}
      {jd?.provided ? (
        <Card title="Job description analysis" hint="Extracted locally from the pasted posting." icon={Target}>
          <div className="grid-2">
            <Kv items={[
              ['Detected title', jd.title || 'not detected'],
              ['Target role', jd.targetRole || 'not set'],
              ['Years requested', jd.yearsOfExperience.length ? `${jd.yearsOfExperience[0].years}+ years` : 'not stated'],
              ['Required skills', String(jd.requiredSkills.length)],
              ['Preferred skills', String(jd.preferredSkills.length)],
              ['Tools / technologies', String(jd.tools.length)],
            ]} />
            <Kv items={[
              ['High priority keywords', String(jd.highPriority.length)],
              ['Medium priority keywords', String(jd.mediumPriority.length)],
              ['Low priority keywords', String(jd.lowPriority.length)],
              ['Soft skills', String(jd.softSkills.length)],
              ['Certifications requested', jd.certifications.length ? jd.certifications.map((c) => c.term).join(', ') : 'none'],
              ['Industries', jd.industries.length ? jd.industries.join(', ') : 'not detected'],
            ]} />
          </div>
          {jd.highPriority.length ? (
            <div className="chips" style={{ marginTop: 4 }}>
              {jd.highPriority.slice(0, 28).map((k) => <span key={`h-${k.term}`} className="chip chip--info">{k.term}</span>)}
            </div>
          ) : null}
        </Card>
      ) : (
        <Notice tone="warn" title="No job description.">
          Keyword matching is running against your target keywords only. Paste a job description to unlock JD alignment
          scoring.
        </Notice>
      )}

      {/* ---------------- layout model ---------------- */}
      {layout ? (
        <Card title="Detected layout model" hint="Reproduced as faithfully as a browser allows." icon={Layers}>
          <div className="grid-2">
            <Kv items={[
              ['Page size', layout.pageSize],
              ['Orientation', layout.orientation],
              ['Columns', String(layout.columns)],
              ['Base font', layout.fontSource ? `${layout.fontSource} (${layout.fontSizes.bodyPx}px)` : `${layout.fontSizes.bodyPx}px`],
              ['Heading size', `${layout.fontSizes.headingPx}px`],
              ['Name size', `${layout.fontSizes.namePx}px`],
            ]} />
            <Kv items={[
              ['Margins', `T${layout.margins.topMm} R${layout.margins.rightMm} B${layout.margins.bottomMm} L${layout.margins.leftMm} mm`],
              ['Line height', String(layout.spacing.lineHeight)],
              ['Section gap', `${layout.spacing.sectionGapPx}px`],
              ['Bullet style', layout.bulletStyle],
              ['Tables detected', String(layout.tables.length)],
              ['Section order', (layout.sections || []).map((s) => s.id).join(' \u2192 ') || 'n/a'],
            ]} />
          </div>
          <Notice tone="neutral" title="Fidelity note.">
            {layout.fidelity.note}
          </Notice>
        </Card>
      ) : null}

      {/* ---------------- parse diagnostics ---------------- */}
      {diagnostics?.warnings?.length ? (
        <Card title="Parse diagnostics" hint="What the local parser could and could not detect." icon={Info}>
          <div className="stack stack--xs">
            {diagnostics.warnings.map((w) => (
              <p key={w} className="text-sm text-muted">&bull; {w}</p>
            ))}
            <Progress
              value={100}
              label={`Sections detected: ${diagnostics.sectionsFound.map((s) => s.id).join(', ') || 'none'}`}
              detail={`${diagnostics.lineCount} lines`}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
});

export default ATSAnalysis;
