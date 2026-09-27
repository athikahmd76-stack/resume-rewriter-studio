import { memo } from 'react';
import { FileText } from 'lucide-react';
import { Empty } from './ui.jsx';
import ResumeRenderer from '../templates/ResumeRenderer.jsx';

/**
 * OriginalPreview - renders the resume exactly as it was parsed from the
 * uploaded file, using the layout model detected in the document itself.
 */
const OriginalPreview = memo(function OriginalPreview({ theme, resume, pagination, loading }) {
  if (loading) {
    return (
      <div className="stack" style={{ padding: 18 }} aria-busy="true" aria-label="Loading original preview">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton" style={{ height: i === 0 ? 26 : 13, width: `${100 - i * 11}%` }} />
        ))}
      </div>
    );
  }
  if (!resume) {
    return (
      <Empty icon={FileText} title="Original preview">
        Upload a PDF or DOCX resume to see how it was interpreted, section by section.
      </Empty>
    );
  }
  return (
    <ResumeRenderer
      resume={resume}
      theme={theme}
      pages={pagination?.pages}
      showPageNumbers={false}
    />
  );
});

export default OriginalPreview;
