import { memo } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { Card, Toggle } from './ui.jsx';
import { DEFAULT_SETTINGS } from '../services/resumeRewriter.js';

export const SETTINGS_META = [
  {
    key: 'atsOptimization',
    label: 'ATS Optimization',
    hint: 'Reorder sections and bullets for machine readability, without adding content.',
  },
  {
    key: 'improveActionVerbs',
    label: 'Improve Action Verbs',
    hint: 'Replace passive openers such as "Responsible for" with ownership verbs.',
  },
  {
    key: 'removeRedundancy',
    label: 'Remove Redundancy',
    hint: 'Drop near-duplicate bullets and filler tails inside the same entry.',
  },
  {
    key: 'improveGrammar',
    label: 'Improve Grammar',
    hint: 'First-person removal, article fixes, filler removal, consistent punctuation.',
  },
  {
    key: 'optimizeKeywords',
    label: 'Optimize Keywords',
    hint: 'Align wording to the job description using only terms your resume already supports.',
  },
  {
    key: 'strengthenAchievements',
    hint: 'Put measurable bullets first and tighten outcome wording. Numbers are never created.',
    label: 'Strengthen Achievements',
  },
  {
    key: 'preserveLayout',
    label: 'Preserve Original Layout',
    hint: 'Keep the uploaded page size, margins, typography scale, bullets and section order.',
  },
  {
    key: 'preserveFacts',
    label: 'Preserve Original Facts',
    hint: 'Hard guarantee: nothing is added that is not already in your resume.',
  },
  {
    key: 'autoGenerateSummary',
    label: 'Draft Summary From Facts',
    hint: 'If no summary exists, compose one only from your role, dates and supported keywords.',
  },
  {
    key: 'reformatDates',
    label: 'Normalise Date Format',
    hint: 'Standardise ranges to "Mon YYYY - Mon YYYY" for consistent parsing.',
  },
];

const OptimizationSettings = memo(function OptimizationSettings({ settings, onChange, onReset, disabled }) {
  const set = (key) => (value) => onChange({ ...settings, [key]: value });
  const allOn = SETTINGS_META.every((m) => settings[m.key]);

  return (
    <Card
      id="settings"
      title="Optimization settings"
      hint="Everything runs locally with deterministic rules."
      icon={SlidersHorizontal}
      actions={(
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={allOn ? onReset : () => onChange({ ...DEFAULT_SETTINGS })}
          disabled={disabled}
        >
          {allOn ? 'Defaults' : 'Enable all'}
        </button>
      )}
    >
      <div className="toggle-list">
        {SETTINGS_META.map((meta) => (
          <Toggle
            key={meta.key}
            id={`opt-${meta.key}`}
            checked={Boolean(settings[meta.key])}
            onChange={set(meta.key)}
            label={meta.label}
            hint={meta.hint}
            disabled={disabled}
          />
        ))}
      </div>
      <p className="text-xs text-muted row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <RotateCcw size={13} style={{ flex: 'none', marginTop: 1 }} aria-hidden="true" />
        Disabling a setting never enables invention - the fact guard runs regardless and blocks unsupported content.
      </p>
    </Card>
  );
});

export default OptimizationSettings;
