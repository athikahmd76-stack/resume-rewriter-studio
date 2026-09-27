import { memo, useCallback, useRef, useState } from 'react';
import { Target, X, Plus } from 'lucide-react';
import { Card, Field, Notice } from './ui.jsx';
import { dedupeKeywords, parseKeywordInput } from '../utils/keywordUtils.js';
import { Badge } from './ui.jsx';

const EXAMPLES = [
  ['Supply Chain', 'Demand Planning', 'SAP S/4HANA', 'Inventory Optimization'],
  ['Procurement', 'Power BI', 'Forecasting', 'Supplier Management'],
  ['Python', 'SQL', 'Stakeholder Management', 'Six Sigma'],
];

/**
 * KeywordInput - comma separated keyword chips + optional target role.
 */
const KeywordInput = memo(function KeywordInput({
  keywords, onKeywordsChange, targetRole, onTargetRoleChange, disabled, matchedSet = null,
}) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const addFromDraft = useCallback(() => {
    const parsed = parseKeywordInput(draft);
    if (!parsed.length) return;
    onKeywordsChange(dedupeKeywords([...keywords, ...parsed]));
    setDraft('');
  }, [draft, keywords, onKeywordsChange]);

  const remove = useCallback((kw) => {
    onKeywordsChange(keywords.filter((k) => k.toLowerCase() !== kw.toLowerCase()));
  }, [keywords, onKeywordsChange]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addFromDraft();
    } else if (e.key === 'Backspace' && !draft && keywords.length) {
      remove(keywords[keywords.length - 1]);
    }
  };

  const addExample = (group) => onKeywordsChange(dedupeKeywords([...keywords, ...group]));

  return (
    <Card
      id="keywords"
      title="Target keywords"
      hint="Comma separated. These are prioritised during matching."
      icon={Target}
      actions={keywords.length ? <Badge tone="brand">{keywords.length} added</Badge> : null}
    >
      <Field label="Keywords" htmlFor="kw-input" hint="Press Enter or comma to add. Backspace removes the last chip.">
        <input
          ref={inputRef}
          id="kw-input"
          type="text"
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={addFromDraft}
          placeholder="Supply Chain, Demand Planning, SAP S/4HANA, Inventory Optimization"
          disabled={disabled}
          autoComplete="off"
          aria-describedby="kw-chips"
        />
      </Field>

      <div className="chips" id="kw-chips">
        {keywords.length === 0 ? (
          <p className="text-sm text-muted">No keywords yet. Add your own or pick an example group below.</p>
        ) : keywords.map((kw) => {
          const state = matchedSet ? matchedSet.get(kw.toLowerCase()) : null;
          const tone = state === 'matched' ? 'ok' : state === 'synonym' ? 'info' : state === 'missing' ? 'warn' : 'neutral';
          return (
            <span key={kw} className={`chip chip--${tone}`}>
              {kw}
              <button type="button" className="chip__x" onClick={() => remove(kw)} aria-label={`Remove keyword ${kw}`}>
                <X size={11} strokeWidth={3} />
              </button>
            </span>
          );
        })}
      </div>

      <div className="row" style={{ gap: 6 }}>
        <span className="text-xs text-muted row" style={{ gap: 4 }}>
          <Plus size={12} aria-hidden="true" /> Examples:
        </span>
        {EXAMPLES.map((group) => (
          <button
            key={group[0]}
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => addExample(group)}
            disabled={disabled}
          >
            {group[0]}...
          </button>
        ))}
      </div>

      <Field label="Target role (optional)" htmlFor="role-input" hint="Helps the local engine prioritise title-aligned keywords.">
        <input
          id="role-input"
          type="text"
          className="input"
          value={targetRole}
          onChange={(e) => onTargetRoleChange(e.target.value)}
          placeholder="Supply Chain Analyst"
          disabled={disabled}
          autoComplete="off"
        />
      </Field>

      {matchedSet ? (
        <Notice tone="info">
          Chips are colour-coded: <strong>green</strong> = present in your resume, <strong>blue</strong> = present via a
          meaning-preserving synonym, <strong>amber</strong> = not found in your resume (it will be reported, never added).
        </Notice>
      ) : null}
    </Card>
  );
});

export default KeywordInput;
