/** STYLE 1 - Professional Minimal. Clean single column, generous whitespace, ATS safest. */

import { memo } from 'react';
import ResumeRenderer from './ResumeRenderer.jsx';
import { buildTheme } from './theme.js';

const ProfessionalMinimal = memo(function ProfessionalMinimal({
  resume, layout, pages, preserveLayout = false, showPageNumbers = true, className = '',
}) {
  const theme = buildTheme({ styleId: 'minimal', layout, preserveLayout });
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

export { buildTheme };
export default ProfessionalMinimal;
