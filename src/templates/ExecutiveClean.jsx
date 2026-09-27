/** STYLE 3 - Executive Clean. Serif headings, restrained rules, senior rhythm. */

import { memo } from 'react';
import ResumeRenderer from './ResumeRenderer.jsx';
import { buildTheme } from './theme.js';

const ExecutiveClean = memo(function ExecutiveClean({
  resume, layout, pages, preserveLayout = false, showPageNumbers = true, className = '',
}) {
  const theme = buildTheme({ styleId: 'executive', layout, preserveLayout });
  return (
    <ResumeRenderer
      resume={resume}
      theme={theme}
      pages={pages}
      className={className}
      showPageNumbers={showPageNumbers}
    />
  );
});

export default ExecutiveClean;
