import { memo } from 'react';
import { Palette } from 'lucide-react';
import { Card, Notice, Toggle } from './ui.jsx';
import { STYLE_LIST } from '../utils/formattingUtils.js';

const THUMBS = {
  minimal: (
    <>
      <i className="wide" />
      <i className="short" />
      <i style={{ width: '100%', background: '#e5e7eb' }} />
      <i className="wide" />
      <i className="wide" />
    </>
  ),
  corporate: (
    <>
      <i className="wide" style={{ background: '#0f3d5e' }} />
      <i className="short" style={{ background: '#93c5fd' }} />
      <i style={{ width: '100%', background: '#0f3d5e' }} />
      <i className="wide" />
      <i className="wide" />
    </>
  ),
  executive: (
    <>
      <i className="wide" style={{ background: '#44403c' }} />
      <i className="short" style={{ background: '#d6d3d1' }} />
      <i className="wide" />
      <i className="wide" />
    </>
  ),
};

const StyleSelector = memo(function StyleSelector({ styleId, onStyleChange, preserveLayout, onPreserveLayoutChange, disabled }) {
  return (
    <Card id="style" title="Visual style" hint="Three ATS-safe professional looks." icon={Palette}>
      <div className="style-grid" role="group" aria-label="Resume visual style">
        {STYLE_LIST.map((style) => (
          <button
            key={style.id}
            type="button"
            className="style-card"
            aria-pressed={styleId === style.id}
            onClick={() => onStyleChange(style.id)}
            disabled={disabled}
          >
            <span className="style-thumb" aria-hidden="true">{THUMBS[style.id]}</span>
            <span className="style-card__name">{style.name}</span>
            <span className="style-card__desc">{style.description}</span>
          </button>
        ))}
      </div>

      <Toggle
        id="opt-preserve-layout-style"
        checked={Boolean(preserveLayout)}
        onChange={onPreserveLayoutChange}
        label="Prioritise the uploaded document's layout"
        hint="When on, the original page size, margins, fonts, spacing, bullets and section order win over the style above."
        disabled={disabled}
      />

      {preserveLayout ? (
        <Notice tone="info">
          Your original layout is being prioritised. The selected style only fills in details the source document did not
          define (for example, a heading rule colour).
        </Notice>
      ) : null}
    </Card>
  );
});

export default StyleSelector;
