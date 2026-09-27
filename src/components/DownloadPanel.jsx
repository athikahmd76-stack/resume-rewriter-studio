import { memo, useState } from 'react';
import { Download, FileText, FileType, Printer, Loader2, ShieldCheck, Info } from 'lucide-react';
import { Card, Notice, Badge, Empty } from './ui.jsx';

const OUTPUTS = [
  {
    id: 'docx',
    label: 'Editable DOCX',
    hint: 'Rebuilt with real styles, headings and a single-column body.',
    icon: FileText,
    tone: 'docx',
  },
  {
    id: 'pdf',
    label: 'PDF (visual match)',
    hint: 'Renders the A4 preview exactly as shown, including fonts and rules.',
    icon: FileType,
    tone: 'pdf',
  },
  {
    id: 'print',
    label: 'Print / Save as PDF',
    hint: 'Opens your browser print dialog at true A4 with print CSS applied.',
    icon: Printer,
    tone: 'print',
  },
];

/**
 * DownloadPanel - all export paths, all local. The busy state is per-format so
 * a slow PDF raster never blocks the DOCX button.
 */
const DownloadPanel = memo(function DownloadPanel({ onExport, onPrint, canExport, busy, fileHint, pageCount }) {
  const [lastFormat, setLastFormat] = useState(null);

  const run = (id) => {
    setLastFormat(id);
    onExport(id);
  };

  if (!canExport) {
    return (
      <Empty icon={Download} title="Nothing to download yet">
        Generate the rewrite first. Every export is produced in your browser - the file is created locally and never
        uploaded.
      </Empty>
    );
  }

  return (
    <div className="stack stack--sm">
      {OUTPUTS.map((o) => (
        <button
          key={o.id}
          type="button"
          className="dl-card dl-card--btn"
          onClick={() => (o.id === 'print' ? onPrint() : run(o.id))}
          disabled={Boolean(busy)}
        >
          <span className={`dl-card__icon dl-card__icon--${o.tone}`} aria-hidden="true">
            {busy === o.id ? <Loader2 size={17} className="spin" /> : <o.icon size={17} />}
          </span>
          <span className="dl-card__meta">
            <span className="dl-card__title">{o.label}</span>
            <span className="dl-card__sub">{o.hint}</span>
          </span>
          <Download size={15} aria-hidden="true" />
        </button>
      ))}

      {busy === 'pdf' ? (
        <Notice tone="info" icon={Info} title="Building the visual PDF.">
          Each page is rendered to a canvas in your browser so the output matches the preview, including fonts, rules and
          spacing. Large resumes take a few seconds.
        </Notice>
      ) : null}
      {busy === 'docx' ? (
        <Notice tone="info" icon={Info} title="Building the DOCX.">
          The document is assembled locally with matching page geometry, margins and typography.
        </Notice>
      ) : null}
      {lastFormat && !busy ? (
        <Notice tone="ok" icon={ShieldCheck} title="Saved on this device.">
          The file was created locally{fileHint ? ` as ${fileHint}` : ''}. Check your browser downloads folder
          {pageCount ? ` - the document is ${pageCount} page${pageCount > 1 ? 's' : ''} long` : ''}.
        </Notice>
      ) : null}

      <p className="text-xs text-muted row" style={{ gap: 6, alignItems: 'flex-start' }}>
        <ShieldCheck size={13} style={{ flex: 'none', marginTop: 1 }} aria-hidden="true" />
        Exports contain only the text you uploaded plus the changes shown in the Comparison tab. No network requests are
        made while exporting.
      </p>
    </div>
  );
});

export { OUTPUTS };
export default DownloadPanel;
