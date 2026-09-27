/** STYLE 2 - Modern Corporate. Accent rules, structured header, tight rhythm. */

import { memo } from 'react';
import ResumeRenderer from './ResumeRenderer.jsx';
import { buildTheme } from './theme.js';

const ModernCorporate = memo(function ModernCorporate({
  resume, layout, pages, preserveLayout = false, showPageNumbers = true, className = '',
}) {
  const theme = buildTheme({ styleId: 'corporate', layout, preserveLayout });
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

export default ModernCorporate;
