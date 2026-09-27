import { memo } from 'react';
import {
  Target, Gauge as GaugeIcon, TrendingUp, TrendingDown, Minus, Info, CheckCircle2, AlertTriangle, XCircle, ClipboardCheck,
} from 'lucide-react';
import { Card, Empty, Notice, Badge } from './ui.jsx';

const toneOf = (v) => (v >= 80 ? 'strong' : v >= 60 ? 'good' : v >= 42 ? 'fair' : 'weak');
const colorOf = (v) => (v >= 80 ? '#15803d' : v >= 60 ? '#65a30d' : v >= 42 ? '#d97706' : '#b91c1c');

const Delta = memo(function Delta({ delta, unit = 'pts' }) {
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta > 0 ? 'var(--ok)' : delta < 0 ? 'var(--danger)' : 'var(--muted)';
  return (
    <span className="delta" style={{ color }}>
      <DeltaIcon size={13} aria-hidden="true" />
      {delta > 0 ? '+' : ''}{delta} {unit}
    </span>
  );
});

const Bar = memo(function Bar({ value, label }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="ba-bar" title={`${label}: ${v}%`}>
      <span className="ba-bar__fill" style={{ width: `${v}%`, background: colorOf(v) }} />
    </div>
  );
});

/**
 * One before/after score. "Before" is always the parsed source document, so the
 * two numbers are directly comparable and never describe different documents.
 */
const ScoreBlock = memo(function ScoreBlock({ score, icon, tone, caption, disclaimer }) {
  const Icon = icon;
  const before = score?.before ?? 0;
  const after = score?.after ?? 0;
  const delta = score?.delta ?? 0;
  return (
    <div className={`ba-score ba-score--${tone}`}>
      <div className="ba-score__head">
        <span className="ba-score__icon" aria-hidden="true"><Icon size={16} /></span>
        <div className="grow">
          <p className="ba-score__title">{score?.label}</p>
          <p className="ba-score__caption">{caption}</p>
        </div>
        {score?.band?.label ? <Badge tone={toneOf(after) === 'strong' || toneOf(after) === 'good' ? 'ok' : 'warn'}>{score.band.label}</Badge> : null}
      </div>

      <div className="ba-compare">
        <div className="ba-compare__side">
          <span className="ba-compare__cap">Before - your source resume</span>
          <span className="ba-compare__num" style={{ color: colorOf(before) }}>{before}%</span>
          <Bar value={before} label="Before" />
        </div>

        <span className="ba-compare__arrow" aria-hidden="true">&rarr;</span>

        <div className="ba-compare__side">
          <span className="ba-compare__cap">After - the rewritten resume</span>
          <span className="ba-compare__num" style={{ color: colorOf(after) }}>{after}%</span>
          <Bar value={after} label="After" />
        </div>

        <div className="ba-compare__delta">
          <Delta delta={delta} />
        </div>
      </div>

      {score?.verdict ? <p className="ba-verdict">{score.verdict}</p> : null}

      {score?.components?.length ? (
        <div className="ba-components">
          {score.components.map((c) => (
            <div key={c.id} className="ba-comp" title={c.hint}>
              <span className="ba-comp__label">{c.label}</span>
              <span className="ba-comp__pair">
                <span className="ba-comp__was">{c.before}%</span>
                <span aria-hidden="true">&rarr;</span>
                <span className="ba-comp__now" style={{ color: colorOf(c.after) }}>{c.after}%</span>
              </span>
              <span className="ba-comp__delta" style={{ color: c.delta > 0 ? 'var(--ok)' : c.delta < 0 ? 'var(--danger)' : 'var(--muted)' }}>
                {c.delta > 0 ? '+' : ''}{c.delta}
              </span>
              <span className="ba-comp__bars">
                <Bar value={c.before} label={`${c.label} before`} />
                <Bar value={c.after} label={`${c.label} after`} />
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {disclaimer ? <p className="ba-disclaimer">{disclaimer}</p> : null}
    </div>
  );
});

/**
 * JobMatchCard - the headline numbers: Job Match % and the ATS score, each shown
 * as a before/after pair, with every component broken out underneath.
 */
const JobMatchCard = memo(function JobMatchCard({ report, loading }) {
  if (loading) {
    return (
      <Card title="Job match and ATS score" hint="Calculating locally." icon={Target}>
        <div className="skeleton" style={{ height: 150, borderRadius: 12 }} />
      </Card>
    );
  }

  if (!report?.scores) {
    return (
      <Empty icon={Target} title="No scores yet">
        Press <strong>Rewrite Resume</strong> to get a Job Match percentage and an ATS score, each shown before and
        after, plus a full SWOT breakdown. Everything is computed in this tab.
      </Empty>
    );
  }

  const { jobMatch, ats } = report.scores;
  const facts = jobMatch.facts || {};

  return (
    <Card
      id="job-match"
      title="Job match and ATS score"
      hint="Before is your original document. After is the rewritten one. Both are local heuristics."
      icon={Target}
      iconTone="brand"
    >
      <div className="stack">
        {report.headline ? (
          <p className="ba-headline">{report.headline}</p>
        ) : null}

        <ScoreBlock
          score={jobMatch}
          icon={Target}
          tone="match"
          caption="How much of what this job asks for your resume actually evidences."
        />

        <ScoreBlock
          score={ats}
          icon={GaugeIcon}
          tone="ats"
          caption="How well the document is structured for a machine to read."
          disclaimer={ats.disclaimer}
        />

        {facts.jdProvided === false ? (
          <Notice tone="warn" title="No job description was analysed." icon={AlertTriangle}>
            The Job Match % is currently measured against your target keywords and role only. Paste a job description to
            score the resume against the actual posting.
          </Notice>
        ) : null}

        {jobMatch.gaps?.missing?.length || jobMatch.gaps?.absentRequired?.length ? (
          <div className="ba-gaps">
            <p className="ba-gaps__title">
              <ClipboardCheck size={14} aria-hidden="true" />
              Gaps holding the Job Match % down
            </p>
            {jobMatch.gaps.missing.length ? (
              <div className="ba-gaps__row">
                <Badge tone="danger">Missing keywords</Badge>
                <span className="chips">
                  {jobMatch.gaps.missing.slice(0, 16).map((g) => (
                    <span key={`gm-${g.term}`} className="chip chip--danger" title="Not in your source resume. Not added.">
                      {g.display}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {jobMatch.gaps.absentRequired.length ? (
              <div className="ba-gaps__row">
                <Badge tone="warn">Required but absent</Badge>
                <span className="chips">
                  {jobMatch.gaps.absentRequired.slice(0, 16).map((g) => (
                    <span key={`gr-${g}`} className="chip chip--warn">{g}</span>
                  ))}
                </span>
              </div>
            ) : null}
            <Notice tone="neutral" icon={Info} title="Nothing here was inserted into your resume.">
              These are reported so you can decide. Add one yourself only if it is genuinely true - the engine will not
              add a claim on your behalf.
            </Notice>
          </div>
        ) : (
          <Notice tone="ok" icon={CheckCircle2} title="No keyword gaps are holding the match down.">
            {facts.targetsMatched ?? 0} of {facts.targetsConsidered ?? 0} targeted terms are evidenced in the resume.
          </Notice>
        )}

        {facts.layoutRisk ? (
          <Notice tone="warn" icon={XCircle} title="The source layout carries extraction risk.">
            Multi-column or table-based layouts scramble the text order in many parsers. The exported files are rebuilt
            single-column, so only the on-screen original still has this problem.
          </Notice>
        ) : null}
      </div>
    </Card>
  );
});

export { Delta, Bar, ScoreBlock };
export default JobMatchCard;
