import { memo } from 'react';
import { AlertTriangle, Check, Info, ShieldCheck, XCircle } from 'lucide-react';

const ICONS = {
  info: Info,
  ok: Check,
  warn: AlertTriangle,
  danger: XCircle,
  shield: ShieldCheck,
};

/**
 * Small presentational primitives shared across panels.
 */

export const Card = memo(function Card({
  title, hint, icon: Icon, iconTone = 'brand', actions, children, bodyClass = '', headClass = '', id,
}) {
  return (
    <section className="card" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      {title ? (
        <header className={`card__head ${headClass}`.trim()}>
          {Icon ? (
            <span className={`card__icon card__icon--${iconTone}`} aria-hidden="true">
              <Icon size={15} />
            </span>
          ) : null}
          <div className="grow">
            <h2 className="card__title" id={id ? `${id}-title` : undefined}>{title}</h2>
            {hint ? <p className="card__hint">{hint}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={`card__body ${bodyClass}`.trim()}>{children}</div>
    </section>
  );
});

export const Notice = memo(function Notice({ tone = 'info', icon, title, children, actions }) {
  const Icon = icon || ICONS[tone] || Info;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon size={16} className="notice__icon" aria-hidden="true" />
      <div className="grow">
        {title ? <strong>{title}</strong> : null}
        {title && children ? ' ' : null}
        {children}
        {actions ? <div className="btn-row" style={{ marginTop: 9 }}>{actions}</div> : null}
      </div>
    </div>
  );
});

export const Field = memo(function Field({ label, htmlFor, hint, required, counter, children }) {
  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="req" aria-hidden="true">*</span> : null}
          {counter ? <span className="grow" /> : null}
          {counter || null}
        </label>
      ) : null}
      {children}
      {hint ? <span className="field__help">{hint}</span> : null}
    </div>
  );
});

export const Toggle = memo(function Toggle({ id, checked, onChange, label, hint, disabled }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__box" aria-hidden="true">
        <Check size={13} strokeWidth={3.2} style={{ opacity: checked ? 1 : 0 }} />
      </span>
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        {hint ? <span className="toggle__hint" style={{ display: 'block' }}>{hint}</span> : null}
      </span>
    </label>
  );
});

export const Badge = memo(function Badge({ tone = 'neutral', children, title }) {
  return <span className={`badge badge--${tone}`} title={title}>{children}</span>;
});

export const Empty = memo(function Empty({ icon: Icon, title, children, actions }) {
  return (
    <div className="empty">
      {Icon ? (
        <span className="empty__icon" aria-hidden="true"><Icon size={26} /></span>
      ) : null}
      <p className="empty__title">{title}</p>
      {children ? <p className="empty__text">{children}</p> : null}
      {actions ? <div className="btn-row" style={{ justifyContent: 'center' }}>{actions}</div> : null}
    </div>
  );
});

export const Progress = memo(function Progress({ value = 0, label, detail }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="progress">
      <div className="progress__bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Processing'}>
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress__label">
        <span>{label}</span>
        <span className="nowrap">{detail || `${pct}%`}</span>
      </div>
    </div>
  );
});

export const Skeleton = memo(function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius: radius, ...style }} aria-hidden="true" />;
});

export const Kv = memo(function Kv({ items }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
});

export default { Card, Notice, Field, Toggle, Badge, Empty, Progress, Skeleton, Kv };
