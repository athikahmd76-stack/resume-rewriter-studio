import { memo, useState } from 'react';
import { Award, CircleAlert, Compass, ShieldAlert, Info, ChevronRight } from 'lucide-react';
import { Card, Empty, Notice, Badge, Skeleton } from './ui.jsx';

const QUADRANTS = [
  {
    id: 'strengths',
    label: 'Strengths',
    title: 'Internal, positive',
    blurb: 'What the resume already evidences. These are your selling points.',
    icon: Award,
    tone: 's',
  },
  {
    id: 'weaknesses',
    label: 'Weaknesses',
    title: 'Internal, negative',
    blurb: 'What the resume does not evidence or does badly. Fix these first.',
    icon: CircleAlert,
    tone: 'w',
  },
  {
    id: 'opportunities',
    label: 'Opportunities',
    title: 'External, positive',
    blurb: 'Changes you could make that would raise the match score.',
    icon: Compass,
    tone: 'o',
  },
  {
    id: 'threats',
    label: 'Threats',
    title: 'External, negative',
    blurb: 'Risks to this specific application that you cannot edit away.',
    icon: ShieldAlert,
    tone: 't',
  },
];

const SEVERITY_TONE = { high: 'danger', medium: 'warn', low: 'neutral' };

const Item = memo(function Item({ item }) {
  return (
    <li className="swot-item">
      <p className="swot-item__title">{item.title}</p>
      {item.detail ? <p className="swot-item__detail">{item.detail}</p> : null}
    </li>
  );
});

const Quadrant = memo(function Quadrant({ quadrant, items, open, onToggle }) {
  const Icon = quadrant.icon;
  return (
    <section className={`swot-quad swot-quad--${quadrant.tone}`}>
      <button
        type="button"
        className="swot-quad__head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="swot-quad__icon" aria-hidden="true"><Icon size={16} /></span>
        <span className="grow">
          <span className="swot-quad__label">
            {quadrant.label} <span className="swot-quad__count">{items.length}</span>
          </span>
          <span className="swot-quad__blurb">{quadrant.blurb}</span>
        </span>
        <ChevronRight size={16} className={`swot-quad__chev ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {open ? (
        items.length ? (
          <ul className="swot-quad__list">
            {items.map((i) => (
              <li key={`${quadrant.id}-${i.id}`} className="swot-item-wrap">
                <Item item={i} />
                <Badge tone={SEVERITY_TONE[i.severity] || 'neutral'}>{i.severity}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted swot-quad__empty">
            Nothing detected here by the local rules.
          </p>
        )
      ) : null}
    </section>
  );
});

/**
 * SwotAnalysis - a deterministic four-quadrant view of the resume against the
 * job. Every item is traceable to parsed content; nothing is invented.
 */
const SwotAnalysis = memo(function SwotAnalysis({ swot, loading }) {
  const [closed, setClosed] = useState(() => new Set());
  const toggle = (id) => setClosed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  if (loading) {
    return (
      <Card title="SWOT analysis" hint="Deriving quadrants locally." icon={Compass}>
        <div className="swot-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="swot-quad"><Skeleton height={132} radius={10} /></div>
          ))}
        </div>
      </Card>
    );
  }

  if (!swot) {
    return (
      <Empty icon={Compass} title="No SWOT analysis yet">
        Generate the rewrite to get a strengths / weaknesses / opportunities / threats breakdown. Every point cites the
        content it came from, and anything your resume does not prove is reported as a gap rather than a strength.
      </Empty>
    );
  }

  const counts = {
    strengths: swot.strengths?.length || 0,
    weaknesses: swot.weaknesses?.length || 0,
    opportunities: swot.opportunities?.length || 0,
    threats: swot.threats?.length || 0,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Card
      id="swot"
      title="SWOT analysis"
      hint="Strengths, weaknesses, opportunities and threats for this specific application."
      icon={Compass}
      iconTone="brand"
      actions={<Badge tone={total ? 'brand' : 'neutral'}>{total} finding{total === 1 ? '' : 's'}</Badge>}
    >
      {swot.headline ? <p className="swot-headline">{swot.headline}</p> : null}

      <div className="swot-grid">
        {QUADRANTS.map((q) => (
          <Quadrant
            key={q.id}
            quadrant={q}
            items={swot[q.id] || []}
            open={!closed.has(q.id)}
            onToggle={() => toggle(q.id)}
          />
        ))}
      </div>

      <Notice tone="info" icon={Info} title="How to read this.">
        {swot.disclaimer}
      </Notice>
    </Card>
  );
});

export { QUADRANTS };
export default SwotAnalysis;
