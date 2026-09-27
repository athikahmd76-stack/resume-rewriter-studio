import ProfessionalMinimal from './ProfessionalMinimal.jsx';
import ModernCorporate from './ModernCorporate.jsx';
import ExecutiveClean from './ExecutiveClean.jsx';
import ResumeRenderer from './ResumeRenderer.jsx';
import { buildTheme, themeStyles } from './theme.js';

export const TEMPLATES = {
  minimal: ProfessionalMinimal,
  corporate: ModernCorporate,
  executive: ExecutiveClean,
};

export const getTemplate = (styleId) => TEMPLATES[styleId] || ProfessionalMinimal;

export { ProfessionalMinimal, ModernCorporate, ExecutiveClean, ResumeRenderer, buildTheme, themeStyles };
export default TEMPLATES;
