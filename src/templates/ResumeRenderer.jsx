/**
 * ResumeRenderer - the shared A4 document renderer used by all three visual
 * styles, by the comparison view and by the PDF exporter.
 *
 * It renders *pages* produced by the pagination engine, so the on-screen
 * preview and the exported PDF are the same DOM.
 */

import { memo } from 'react';
import { themeStyles } from './theme.js';
import { getBulletChar } from '../utils/formattingUtils.js';
import { SECTION_META } from '../data/sectionDictionary.js';

const BULLET_GLYPH = { dot: '\u2022', disc: '\u25CF', square: '\u25AA', dash: '\u2013', arrow: '\u2192', none: '' };

const bulletListStyle = (theme) => ({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: `${Math.max(2, Math.round(theme.spacing.blockGap * 0.5))}px`,
});

const bulletItemStyle = (theme) => ({
  position: 'relative',
  paddingLeft: theme.bulletStyle === 'none' ? 0 : 15,
  fontSize: `${theme.fontSizes.body}px`,
  lineHeight: theme.spacing.lineHeight,
  margin: 0,
  breakInside: 'avoid',
});

const bulletMarkerStyle = (theme) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  width: 15,
  color: theme.colors.accent,
  fontSize: `${Math.max(7, theme.fontSizes.body * 0.92)}px`,
  lineHeight: `${theme.fontSizes.body * theme.spacing.lineHeight}px`,
  textAlign: 'left',
});

const Bullets = memo(function Bullets({ items, theme, small }) {
  if (!items || !items.length) return null;
  const glyph = BULLET_GLYPH[theme.bulletStyle] ?? BULLET_GLYPH.dot;
  const showGlyph = theme.bulletStyle !== 'none';
  return (
    <ul style={{ ...bulletListStyle(theme), marginBottom: small ? 0 : `${theme.spacing.blockGap}px` }}>
      {items.map((item, i) => (
        <li key={`${i}-${item.slice(0, 12)}`} style={bulletItemStyle(theme)}>
          {showGlyph ? <span style={bulletMarkerStyle(theme)} aria-hidden="true">{glyph}</span> : null}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
});

const ContactLine = memo(function ContactLine({ personal, s }) {
  const parts = [
    personal.location,
    personal.phone,
    personal.email,
    personal.linkedin,
    personal.portfolio || personal.website,
  ].filter(Boolean);
  const extras = (personal.extras || []).map((e) => e.text).filter((t) => t && !parts.includes(t));
  const all = [...parts, ...extras];
  if (!all.length) return null;
  return (
    <div style={{ ...s.contact, marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '3px 10px' }}>
      {all.map((part, i) => (
        <span key={`${i}-${part.slice(0, 10)}`}>{part}</span>
      ))}
    </div>
  );
});

const Header = memo(function Header({ resume, theme, s }) {
  const p = resume.personal || {};
  return (
    <header style={{ marginBottom: `${theme.spacing.sectionGap}px` }}>
      {p.name ? <h1 style={s.name}>{p.name}</h1> : null}
      {p.headline ? (
        <div style={{ ...s.contact, fontSize: `${theme.fontSizes.heading}px`, color: theme.colors.accent, fontWeight: 600, marginTop: '3px' }}>
          {p.headline}
        </div>
      ) : null}
      <ContactLine personal={p} s={s} />
      {theme.ruleUnderHeader ? (
        <div style={{ height: '1px', background: theme.colors.accent, marginTop: '10px', opacity: 0.55 }} />
      ) : null}
    </header>
  );
});

const SectionHeading = memo(function SectionHeading({ title, s }) {
  return <h2 style={s.heading}>{title || SECTION_META[title]?.defaultTitle || title}</h2>;
});

const blockContent = (block, theme, s) => {
  switch (block.type) {
    case 'summary':
      return (
        <p style={{ margin: 0, fontSize: `${theme.fontSizes.body}px`, lineHeight: theme.spacing.lineHeight }}>
          {block.text}
        </p>
      );
    case 'entry':
    case 'project': {
      const entry = block.entry || {};
      const bullets = block.split ? (block.bullets || []).slice(block.parts?.[0], block.parts?.[1]) : (block.bullets || []);
      const title = block.type === 'entry' ? entry.role : entry.name;
      const company = block.type === 'entry' ? entry.company : entry.role;
      return (
        <div style={{ marginBottom: `${theme.spacing.entryGap}px`, breakInside: 'avoid' }}>
          <div style={{ ...s.entryHeader, display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
            <div>
              {title ? <span style={s.role}>{title}</span> : null}
              {company ? (
                <>
                  {title ? <span style={{ opacity: 0.55 }}> &middot; </span> : null}
                  <span style={s.company}>{company}</span>
                </>
              ) : null}
              {entry.location ? <span style={{ ...s.meta, marginLeft: 8 }}>{entry.location}</span> : null}
            </div>
            {entry.dates ? <span style={{ ...s.meta, whiteSpace: 'nowrap' }}>{entry.dates}</span> : null}
          </div>
          {block.continued ? (
            <div style={{ ...s.meta, marginTop: 2, fontStyle: 'italic' }}>(continued)</div>
          ) : null}
          <div style={{ marginTop: `${Math.max(2, theme.spacing.blockGap * 0.5)}px` }}>
            <Bullets items={bullets} theme={theme} s={s} />
          </div>
        </div>
      );
    }
    case 'skillGroup': {
      const group = block.group || {};
      const glyph = BULLET_GLYPH[theme.bulletStyle] ?? BULLET_GLYPH.dot;
      return (
        <div style={{ position: 'relative', paddingLeft: theme.bulletStyle === 'none' ? 0 : 15, marginBottom: `${Math.max(2, theme.spacing.blockGap * 0.5)}px` }}>
          {theme.bulletStyle !== 'none' ? <span style={bulletMarkerStyle(theme)} aria-hidden="true">{glyph}</span> : null}
          <span>
            {group.label ? <strong style={{ color: theme.colors.text }}>{group.label}: </strong> : null}
            {(group.items || []).join(', ')}
          </span>
        </div>
      );
    }
    case 'education': {
      const ed = block.entry || {};
      return (
        <div style={{ marginBottom: `${theme.spacing.entryGap}px` }}>
          <div style={{ ...s.entryHeader, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <div>
              {ed.degree ? <span style={s.role}>{ed.degree}</span> : null}
              {ed.institution ? (
                <>
                  {ed.degree ? <span style={{ opacity: 0.55 }}> &middot; </span> : null}
                  <span style={s.company}>{ed.institution}</span>
                </>
              ) : null}
            </div>
            {ed.dates ? <span style={s.meta}>{ed.dates}</span> : null}
          </div>
          <Bullets items={ed.details || []} theme={theme} s={s} small />
        </div>
      );
    }
    case 'certification':
      return (
        <div style={{ position: 'relative', paddingLeft: theme.bulletStyle === 'none' ? 0 : 15, marginBottom: `${Math.max(1, theme.spacing.blockGap * 0.35)}px` }}>
          {theme.bulletStyle !== 'none' ? <span style={bulletMarkerStyle(theme)} aria-hidden="true">{BULLET_GLYPH[theme.bulletStyle] ?? '\u2022'}</span> : null}
          <span>{block.entry?.name}</span>
        </div>
      );
    case 'achievement':
      return (
        <div style={{ position: 'relative', paddingLeft: theme.bulletStyle === 'none' ? 0 : 15, marginBottom: `${Math.max(1, theme.spacing.blockGap * 0.35)}px` }}>
          {theme.bulletStyle !== 'none' ? <span style={bulletMarkerStyle(theme)} aria-hidden="true">{BULLET_GLYPH[theme.bulletStyle] ?? '\u2022'}</span> : null}
          <span>{block.entry?.text}</span>
        </div>
      );
    case 'languages':
      return <Bullets items={String(block.text || '').split(', ').map((t) => t.trim()).filter(Boolean)} theme={theme} s={s} />;
    case 'other':
      return (
        <div style={{ position: 'relative', paddingLeft: theme.bulletStyle === 'none' ? 0 : 15, marginBottom: `${Math.max(1, theme.spacing.blockGap * 0.35)}px` }}>
          {theme.bulletStyle !== 'none' ? <span style={bulletMarkerStyle(theme)} aria-hidden="true">{BULLET_GLYPH[theme.bulletStyle] ?? '\u2022'}</span> : null}
          <span>{block.entry?.text}</span>
        </div>
      );
    case 'heading':
      return null;
    default:
      return null;
  }
};

const PageBody = memo(function PageBody({ blocks, theme, s }) {
  const items = [];
  let pendingHeading = null;
  blocks.forEach((block, i) => {
    if (block.type === 'heading') {
      pendingHeading = block;
      return;
    }
    items.push(
      <section key={`${block.id}-${i}`} style={{ marginBottom: `${theme.spacing.blockGap}px` }}>
        {pendingHeading ? <SectionHeading title={pendingHeading.title} s={s} /> : null}
        {blockContent(block, theme, s)}
      </section>,
    );
    pendingHeading = null;
  });
  if (pendingHeading) {
    items.push(
      <section key={`${pendingHeading.id}-h`}>
        <SectionHeading title={pendingHeading.title} s={s} />
      </section>,
    );
  }
  return <div data-page-body="true">{items}</div>;
});

/**
 * @param {{resume:object, theme:object, pages:Array, className?:string}} props
 */
const ResumeRenderer = memo(function ResumeRenderer({ resume, theme, pages, className = '', showPageNumbers = true }) {
  const s = themeStyles(theme);
  const list = pages?.length ? pages : [{ index: 0, blocks: [] }];
  return (
    <div className={`rsp-doc ${className}`.trim()} data-style={theme.styleId}>
      {list.map((page, i) => (
        <article
          key={page.index ?? i}
          className="rsp-page"
          data-page-index={page.index ?? i}
          style={{
            ...s.page,
            margin: i === 0 ? 0 : '18px auto 0',
            position: 'relative',
            // Screen affordance only. `.export-stage .rsp-page` and the print
            // stylesheet remove it, because a rasteriser bakes the shadow into
            // the exported image.
            boxShadow: '0 1px 3px rgba(15,23,42,0.14), 0 12px 32px rgba(15,23,42,0.10)',
          }}
          aria-label={`Resume page ${i + 1} of ${list.length}`}
        >
          {i === 0 ? <Header resume={resume} theme={theme} s={s} /> : null}
          <div className="rsp-page__body">
            <PageBody blocks={page.blocks || []} theme={theme} s={s} />
          </div>
          {showPageNumbers && list.length > 1 ? (
            <footer
              style={{
                position: 'absolute', left: theme.margins.left, right: theme.margins.right,
                bottom: Math.max(6, theme.margins.bottom * 0.32),
                display: 'flex', justifyContent: 'space-between',
                fontSize: `${Math.max(7, theme.fontSizes.small * 0.92)}px`,
                color: theme.colors.text, opacity: 0.5,
              }}
            >
              <span>{(resume?.personal?.name || '').split(' ').slice(-1)[0] || ''}</span>
              <span>{`Page ${i + 1} of ${list.length}`}</span>
            </footer>
          ) : null}
        </article>
      ))}
    </div>
  );
});

export { Bullets, Header, SectionHeading, blockContent, getBulletChar };
export default ResumeRenderer;
