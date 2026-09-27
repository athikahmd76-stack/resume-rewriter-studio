import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pencil, Plus, Trash2, History, RotateCcw, X, ChevronDown, ChevronUp, Save, Undo2, User,
} from 'lucide-react';
import { Card, Notice, Badge, Empty, Field } from './ui.jsx';
import { cloneResume, newId, experienceBullets } from '../services/resumeModel.js';

const LIST_FIELDS = ['experience', 'education', 'skills', 'certifications', 'projects', 'other'];

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const toBody = (resume) => ({
  personal: { ...(resume.personal || {}) },
  summary: resume.summary || '',
  experience: asList(resume.experience).map((e) => ({
    ...e,
    responsibilities: asList(e.responsibilities),
    achievements: asList(e.achievements),
  })),
  education: asList(resume.education).map((e) => ({ ...e, details: asList(e.details) })),
  skills: asList(resume.skills).map((s) => (Array.isArray(s.items)
    ? { ...s, items: [...s.items] }
    : { label: s.label || 'Skills', items: [String(s)] })),
  certifications: asList(resume.certifications).map((c) => ({ ...c })),
  projects: asList(resume.projects).map((p) => ({ ...p, bullets: asList(p.bullets) })),
  other: asList(resume.other).map((o) => ({ ...o })),
});

const buildFromBody = (body, base) => ({
  ...base,
  personal: body.personal,
  summary: body.summary,
  experience: body.experience.map((e) => ({
    ...e,
    responsibilities: e.responsibilities.filter(Boolean),
    achievements: e.achievements.filter(Boolean),
  })),
  education: body.education.filter((e) => e.institution || e.degree),
  skills: body.skills.filter((s) => s.items.some(Boolean) || s.label),
  certifications: body.certifications.filter((c) => c.name),
  projects: body.projects.filter((p) => p.name || p.detail),
  other: body.other.filter((o) => o.text),
});

const moveItem = (arr, from, to) => {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const arrows = (i, len, onUp, onDown) => (
  <div className="row" style={{ gap: 4 }}>
    <button type="button" className="btn btn--icon" title="Move up" aria-label="Move up" disabled={i === 0} onClick={onUp}>
      <ChevronUp size={14} />
    </button>
    <button type="button" className="btn btn--icon" title="Move down" aria-label="Move down" disabled={i === len - 1} onClick={onDown}>
      <ChevronDown size={14} />
    </button>
  </div>
);

const Trash = ({ onClick, label = 'Delete' }) => (
  <button type="button" className="btn btn--icon btn--danger" title={label} aria-label={label} onClick={onClick}>
    <Trash2 size={14} />
  </button>
);

/**
 * ResumeEditor - direct human control over the optimized resume.
 * Text typed here is the user's own; the engine never generates content here.
 */
function ResumeEditor({ resume, onChange, versions, onSaveVersion, onRestore, onClose, isEdited }) {
  const [body, setBody] = useState(() => toBody(resume));
  const [tab, setTab] = useState('experience');
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => { setBody(toBody(resume)); }, [resume]);

  const dirty = useMemo(() => JSON.stringify(body) !== JSON.stringify(toBody(resume)), [body, resume]);
  const set = useCallback((patch) => setBody((b) => ({ ...b, ...patch })), []);

  const patchRow = useCallback((key, i, patch) => setBody((b) => ({
    ...b,
    [key]: b[key].map((row, x) => (x === i ? { ...row, ...(typeof patch === 'function' ? patch(row) : patch) } : row)),
  })), []);

  const replaceList = useCallback((key, next) => setBody((b) => ({ ...b, [key]: next })), []);

  const apply = () => {
    const next = buildFromBody(body, resume);
    onChange(next);
    onSaveVersion?.(next, 'edited');
  };

  const TABS = [
    { id: 'personal', label: 'Contact' },
    { id: 'experience', label: `Experience (${body.experience.length})` },
    { id: 'skills', label: `Skills (${body.skills.length})` },
    { id: 'education', label: `Education (${body.education.length})` },
    { id: 'summary', label: 'Summary' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div className="stack">
      <Notice tone="info" icon={Pencil} title="Editing the optimized resume.">
        Edits update the preview and exports immediately. Anything you type is your own wording - the engine never
        writes content into these fields.
      </Notice>

      <div className="row row--between">
        <div className="subtabs" role="tablist" aria-label="Resume sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="subtab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          {isEdited ? <Badge tone="warn">edited</Badge> : null}
          <button type="button" className="btn btn--sm btn--subtle" disabled={!dirty} onClick={() => setBody(toBody(resume))}>
            <Undo2 size={13} aria-hidden="true" /> Discard
          </button>
          <button type="button" className="btn btn--sm btn--primary" disabled={!dirty} onClick={apply}>
            <Save size={13} aria-hidden="true" /> Apply edits
          </button>
        </div>
      </div>

      {tab === 'personal' ? (
        <div className="grid-2">
          <Field label="Full name" htmlFor="ed-name">
            <input id="ed-name" className="input" value={body.personal.name || ''} onChange={(e) => set({ personal: { ...body.personal, name: e.target.value } })} />
          </Field>
          <Field label="Headline" htmlFor="ed-headline">
            <input id="ed-headline" className="input" value={body.personal.headline || ''} onChange={(e) => set({ personal: { ...body.personal, headline: e.target.value } })} />
          </Field>
          <Field label="Email" htmlFor="ed-email">
            <input id="ed-email" className="input" type="email" value={body.personal.email || ''} onChange={(e) => set({ personal: { ...body.personal, email: e.target.value } })} />
          </Field>
          <Field label="Phone" htmlFor="ed-phone">
            <input id="ed-phone" className="input" value={body.personal.phone || ''} onChange={(e) => set({ personal: { ...body.personal, phone: e.target.value } })} />
          </Field>
          <Field label="Location" htmlFor="ed-loc">
            <input id="ed-loc" className="input" value={body.personal.location || ''} onChange={(e) => set({ personal: { ...body.personal, location: e.target.value } })} />
          </Field>
          <Field label="LinkedIn" htmlFor="ed-li">
            <input id="ed-li" className="input" value={body.personal.linkedin || ''} onChange={(e) => set({ personal: { ...body.personal, linkedin: e.target.value } })} />
          </Field>
          <Field label="Portfolio / website" htmlFor="ed-web">
            <input id="ed-web" className="input" value={body.personal.portfolio || ''} onChange={(e) => set({ personal: { ...body.personal, portfolio: e.target.value } })} />
          </Field>
        </div>
      ) : null}

      {tab === 'experience' ? (
        <div className="stack stack--sm">
          {body.experience.length === 0 ? (
            <Empty title="No experience entries detected">
              The parser did not find an experience section. Add one here if the document used an unusual layout.
            </Empty>
          ) : null}
          {body.experience.map((entry, i) => {
            const bullets = experienceBullets(entry);
            return (
              <div className="sheet" key={entry.id || `exp-${i}`}>
                <div className="row row--between">
                  <strong className="text-sm">{entry.company || entry.role || `Entry ${i + 1}`}</strong>
                  <div className="row" style={{ gap: 4 }}>
                    {arrows(
                      i, body.experience.length,
                      () => replaceList('experience', moveItem(body.experience, i, i - 1)),
                      () => replaceList('experience', moveItem(body.experience, i, i + 1)),
                    )}
                    <Trash label="Delete entry" onClick={() => replaceList('experience', body.experience.filter((_, x) => x !== i))} />
                  </div>
                </div>

                <div className="grid-2">
                  <Field label="Company" htmlFor={`${entry.id}-co`}>
                    <input id={`${entry.id}-co`} className="input" value={entry.company || ''} onChange={(e) => patchRow('experience', i, { company: e.target.value })} />
                  </Field>
                  <Field label="Role" htmlFor={`${entry.id}-role`}>
                    <input id={`${entry.id}-role`} className="input" value={entry.role || ''} onChange={(e) => patchRow('experience', i, { role: e.target.value })} />
                  </Field>
                  <Field label="Location" htmlFor={`${entry.id}-loc`}>
                    <input id={`${entry.id}-loc`} className="input" value={entry.location || ''} onChange={(e) => patchRow('experience', i, { location: e.target.value })} />
                  </Field>
                  <Field label="Dates" htmlFor={`${entry.id}-dates`} hint="e.g. Mar 2022 - Present">
                    <input id={`${entry.id}-dates`} className="input" value={entry.dates || ''} onChange={(e) => patchRow('experience', i, { dates: e.target.value })} />
                  </Field>
                </div>

                <Field label="Bullets" htmlFor={`${entry.id}-bul`} hint="One bullet per line, in the order you want them">
                  <textarea
                    id={`${entry.id}-bul`}
                    className="textarea"
                    rows={Math.max(3, bullets.length)}
                    value={bullets.join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n');
                      patchRow('experience', i, {
                        responsibilities: lines,
                        achievements: [],
                      });
                    }}
                  />
                </Field>

                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => patchRow('experience', i, (row) => ({
                      responsibilities: [...asList(row.responsibilities), ''],
                    }))}
                  >
                    <Plus size={13} aria-hidden="true" /> Add bullet
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    disabled={!bullets.length}
                    onClick={() => patchRow('experience', i, { responsibilities: bullets.filter(Boolean), achievements: [] })}
                  >
                    <Trash2 size={13} aria-hidden="true" /> Remove blank bullets
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="btn btn--sm btn--subtle"
            onClick={() => replaceList('experience', [...body.experience, {
              id: newId('exp'), company: '', role: '', location: '', dates: '', responsibilities: [''], achievements: [], notes: '',
            }])}
          >
            <Plus size={13} aria-hidden="true" /> Add experience entry
          </button>
        </div>
      ) : null}

      {tab === 'skills' ? (
        <div className="stack stack--sm">
          {body.skills.length === 0 ? <Empty title="No skill groups detected" /> : null}
          {body.skills.map((group, i) => (
            <div className="sheet" key={group.id || `sk-${i}`}>
              <div className="row row--between">
                <strong className="text-sm">{group.label || `Group ${i + 1}`}</strong>
                <div className="row" style={{ gap: 4 }}>
                  {arrows(
                    i, body.skills.length,
                    () => replaceList('skills', moveItem(body.skills, i, i - 1)),
                    () => replaceList('skills', moveItem(body.skills, i, i + 1)),
                  )}
                  <Trash label="Delete skill group" onClick={() => replaceList('skills', body.skills.filter((_, x) => x !== i))} />
                </div>
              </div>
              <div className="grid-2">
                <Field label="Group label" htmlFor={`${group.id}-label`} hint="e.g. Technical Skills">
                  <input id={`${group.id}-label`} className="input" value={group.label || ''} onChange={(e) => patchRow('skills', i, { label: e.target.value })} />
                </Field>
                <Field label="Skills" htmlFor={`${group.id}-items`} hint="Comma separated">
                  <input
                    id={`${group.id}-items`}
                    className="input"
                    value={(group.items || []).join(', ')}
                    onChange={(e) => patchRow('skills', i, { items: e.target.value.split(',').map((s) => s.trim()) })}
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--subtle"
            onClick={() => replaceList('skills', [...body.skills, { id: newId('sk'), label: '', items: [] }])}
          >
            <Plus size={13} aria-hidden="true" /> Add skill group
          </button>
        </div>
      ) : null}

      {tab === 'education' ? (
        <div className="stack stack--sm">
          {body.education.length === 0 ? <Empty title="No education entries detected" /> : null}
          {body.education.map((entry, i) => (
            <div className="sheet" key={entry.id || `edu-${i}`}>
              <div className="row row--between">
                <strong className="text-sm">{entry.institution || `Entry ${i + 1}`}</strong>
                <div className="row" style={{ gap: 4 }}>
                  {arrows(
                    i, body.education.length,
                    () => replaceList('education', moveItem(body.education, i, i - 1)),
                    () => replaceList('education', moveItem(body.education, i, i + 1)),
                  )}
                  <Trash label="Delete education entry" onClick={() => replaceList('education', body.education.filter((_, x) => x !== i))} />
                </div>
              </div>
              <div className="grid-2">
                <Field label="Institution" htmlFor={`${entry.id}-inst`}>
                  <input id={`${entry.id}-inst`} className="input" value={entry.institution || ''} onChange={(e) => patchRow('education', i, { institution: e.target.value })} />
                </Field>
                <Field label="Degree" htmlFor={`${entry.id}-deg`}>
                  <input id={`${entry.id}-deg`} className="input" value={entry.degree || ''} onChange={(e) => patchRow('education', i, { degree: e.target.value })} />
                </Field>
                <Field label="Dates" htmlFor={`${entry.id}-edates`}>
                  <input id={`${entry.id}-edates`} className="input" value={entry.dates || ''} onChange={(e) => patchRow('education', i, { dates: e.target.value })} />
                </Field>
                <Field label="Details" htmlFor={`${entry.id}-edetail`} hint="One per line">
                  <textarea
                    id={`${entry.id}-edetail`}
                    className="textarea"
                    rows={2}
                    value={asList(entry.details).join('\n')}
                    onChange={(e) => patchRow('education', i, { details: e.target.value.split('\n') })}
                  />
                </Field>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="btn btn--sm btn--subtle"
            onClick={() => replaceList('education', [...body.education, { id: newId('edu'), institution: '', degree: '', dates: '', details: [] }])}
          >
            <Plus size={13} aria-hidden="true" /> Add education entry
          </button>
        </div>
      ) : null}

      {tab === 'summary' ? (
        <Field label="Professional summary" htmlFor="summary-edit" hint="Two to four factual lines.">
          <textarea
            id="summary-edit"
            className="textarea"
            rows={6}
            value={body.summary}
            onChange={(e) => set({ summary: e.target.value })}
            placeholder="No summary was detected. Write your own, or leave blank."
          />
        </Field>
      ) : null}

      {tab === 'other' ? (
        <div className="stack stack--sm">
          <Card title="Certifications" hint="Name, issuer and year">
            {body.certifications.length === 0 ? <p className="text-sm text-muted">None detected.</p> : null}
            {body.certifications.map((entry, i) => (
              <div className="sheet" key={entry.id || `cert-${i}`}>
                <div className="row row--between">
                  <strong className="text-sm">{entry.name || `Certification ${i + 1}`}</strong>
                  <Trash label="Delete certification" onClick={() => replaceList('certifications', body.certifications.filter((_, x) => x !== i))} />
                </div>
                <div className="grid-2">
                  <Field label="Name" htmlFor={`${entry.id}-cname`}>
                    <input id={`${entry.id}-cname`} className="input" value={entry.name || ''} onChange={(e) => patchRow('certifications', i, { name: e.target.value })} />
                  </Field>
                  <Field label="Issuer" htmlFor={`${entry.id}-issuer`}>
                    <input id={`${entry.id}-issuer`} className="input" value={entry.issuer || ''} onChange={(e) => patchRow('certifications', i, { issuer: e.target.value })} />
                  </Field>
                  <Field label="Year" htmlFor={`${entry.id}-year`}>
                    <input id={`${entry.id}-year`} className="input" value={entry.year || ''} onChange={(e) => patchRow('certifications', i, { year: e.target.value })} />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--sm btn--subtle"
              onClick={() => replaceList('certifications', [...body.certifications, { id: newId('cert'), name: '', issuer: '', year: '' }])}
            >
              <Plus size={13} aria-hidden="true" /> Add certification
            </button>
          </Card>

          <Card title="Projects" hint="Name, dates and bullets">
            {body.projects.length === 0 ? <p className="text-sm text-muted">None detected.</p> : null}
            {body.projects.map((entry, i) => (
              <div className="sheet" key={entry.id || `prj-${i}`}>
                <div className="row row--between">
                  <strong className="text-sm">{entry.name || `Project ${i + 1}`}</strong>
                  <Trash label="Delete project" onClick={() => replaceList('projects', body.projects.filter((_, x) => x !== i))} />
                </div>
                <div className="grid-2">
                  <Field label="Name" htmlFor={`${entry.id}-pname`}>
                    <input id={`${entry.id}-pname`} className="input" value={entry.name || ''} onChange={(e) => patchRow('projects', i, { name: e.target.value })} />
                  </Field>
                  <Field label="Dates" htmlFor={`${entry.id}-pdates`}>
                    <input id={`${entry.id}-pdates`} className="input" value={entry.dates || ''} onChange={(e) => patchRow('projects', i, { dates: e.target.value })} />
                  </Field>
                </div>
                <Field label="Bullets" htmlFor={`${entry.id}-pbul`} hint="One per line">
                  <textarea
                    id={`${entry.id}-pbul`}
                    className="textarea"
                    rows={3}
                    value={asList(entry.bullets).join('\n')}
                    onChange={(e) => patchRow('projects', i, { bullets: e.target.value.split('\n') })}
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--sm btn--subtle"
              onClick={() => replaceList('projects', [...body.projects, { id: newId('prj'), name: '', role: '', dates: '', detail: '', bullets: [] }])}
            >
              <Plus size={13} aria-hidden="true" /> Add project
            </button>
          </Card>

          <Card title="Other content" hint="Anything the parser classified as additional sections">
            {body.other.length === 0 ? (
              <p className="text-sm text-muted">Nothing else was detected in this resume.</p>
            ) : body.other.map((entry, i) => (
              <div className="row" key={entry.id || `o-${i}`} style={{ alignItems: 'flex-start' }}>
                <textarea
                  className="textarea grow"
                  rows={2}
                  value={entry.text || ''}
                  aria-label={`Other content ${i + 1}`}
                  onChange={(e) => patchRow('other', i, { text: e.target.value })}
                />
                <Trash label="Delete other content" onClick={() => replaceList('other', body.other.filter((_, x) => x !== i))} />
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      <div className="divider" />

      <div className="row row--between">
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowVersions((v) => !v)} aria-expanded={showVersions}>
          <History size={13} aria-hidden="true" /> Version history ({versions.length})
        </button>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="btn btn--sm btn--subtle" onClick={() => onSaveVersion?.(cloneResume(resume), 'snapshot')}>
            <RotateCcw size={13} aria-hidden="true" /> Save current as version
          </button>
          {onClose ? (
            <button type="button" className="btn btn--sm btn--subtle" onClick={onClose}>
              <X size={13} aria-hidden="true" /> Close editor
            </button>
          ) : null}
        </div>
      </div>

      {showVersions ? (
        <div className="stack stack--xs">
          {versions.length === 0 ? <p className="text-sm text-muted">No versions yet.</p> : null}
          {versions.slice().reverse().map((v) => (
            <div key={v.id} className="row row--between">
              <div className="row" style={{ gap: 8 }}>
                <Badge tone={v.isCurrent ? 'ok' : 'neutral'}>{v.label}</Badge>
                <span className="text-xs text-muted">
                  {new Date(v.at).toLocaleTimeString()} &middot; {v.summary}
                </span>
              </div>
              <button type="button" className="btn btn--sm btn--subtle" onClick={() => onRestore(v)}>
                <RotateCcw size={12} aria-hidden="true" /> Restore
              </button>
            </div>
          ))}
          <p className="text-xs text-muted">
            Versions are kept in memory for this session only - nothing is written to disk or sent anywhere.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted row" style={{ gap: 6 }}>
        <User size={12} aria-hidden="true" /> Section order in exports follows your uploaded document unless
        ATS Optimization reordered it.
      </p>
    </div>
  );
}

export { LIST_FIELDS };
export default memo(ResumeEditor);
