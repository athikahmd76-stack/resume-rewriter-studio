import { memo } from 'react';
import { Briefcase, FileText, AlertTriangle } from 'lucide-react';
import { Card, Field, Notice } from './ui.jsx';
import { validateJobDescription, MAX_JD_CHARS } from '../utils/validation.js';

const SUGGESTIONS = [
  'Paste the complete job description here...',
  'Paste the full job posting, including the requirements and responsibilities sections, for the best results.',
];

/**
 * JobDescriptionInput - textarea with a live character counter and a local
 * quality check. The JD is analysed locally by services/jdAnalyzer.js.
 */
const JobDescriptionInput = memo(function JobDescriptionInput({ value, onChange, disabled, jdResult }) {
  const length = value.trim().length;
  const check = validateJobDescription(value);
  const ratio = Math.min(1, length / MAX_JD_CHARS);
  const barTone = !length ? '' : length < 400 ? ' counter__fill--warn' : ' counter__fill--ok';

  return (
    <Card
      id="job-description"
      title="Job description"
      hint="Used to prioritise keywords. Nothing is sent anywhere."
      icon={Briefcase}
    >
      <Field
        label="Paste the job description"
        htmlFor="jd-input"
        required
        counter={(
          <span className="text-xs text-muted nowrap">
            {length.toLocaleString()} / {MAX_JD_CHARS.toLocaleString()} characters
          </span>
        )}
      >
        <textarea
          id="jd-input"
          className="textarea textarea--jd"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={SUGGESTIONS[0]}
          aria-describedby="jd-help"
          disabled={disabled}
          spellCheck="false"
        />
        <div className="counter" aria-hidden="true">
          <div className="counter__bar">
            <div className={`counter__fill${barTone}`} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
          </div>
          <span className="nowrap">{length < 400 ? 'short' : length > MAX_JD_CHARS ? 'too long' : 'good length'}</span>
        </div>
      </Field>
      <span id="jd-help" className="field__help">
        Include the responsibilities, requirements and any &ldquo;nice to have&rdquo; section. The more complete the
        posting, the more precise the local keyword analysis.
      </span>

      {value.trim() && !check.ok ? (
        <Notice tone={check.code === 'empty-jd' ? 'info' : 'warn'} icon={AlertTriangle}>
          {check.message}
        </Notice>
      ) : null}

      {jdResult ? (
        <div className="row" style={{ gap: 7 }}>
          <span className="badge badge--info">{jdResult.keywords.length} keywords</span>
          <span className="badge badge--brand">{jdResult.highPriority.length} high priority</span>
          {jdResult.yearsOfExperience.length ? (
            <span className="badge badge--neutral">{jdResult.yearsOfExperience[0].years}+ years requested</span>
          ) : null}
          {jdResult.certifications.length ? (
            <span className="badge badge--neutral">{jdResult.certifications.length} certification{jdResult.certifications.length > 1 ? 's' : ''}</span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
});

export { FileText };
export default JobDescriptionInput;
