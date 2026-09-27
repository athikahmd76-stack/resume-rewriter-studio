/**
 * Theme resolution: converts a built-in style (or the layout model detected
 * from the uploaded document) into a single object the renderer, the DOCX
 * exporter and the PDF exporter all consume.
 *
 * When "Preserve original layout" is on, the detected layout wins for page
 * geometry, typography scale, spacing rhythm, bullets, columns and colours.
 * Otherwise the selected built-in style wins and the original only informs the
 * section order.
 */

import { BUILTIN_STYLES } from '../utils/formattingUtils.js';

const px = (v) => `${Math.round(Number(v) || 0)}px`;

export const buildTheme = ({ styleId = 'minimal', layout = null, preserveLayout = true } = {}) => {
  const base = BUILTIN_STYLES[styleId] || BUILTIN_STYLES.minimal;
  const detected = preserveLayout && layout ? layout : null;

  const colors = detected
    ? {
      text: detected.colors.text,
      heading: detected.colors.heading,
      accent: detected.colors.accent,
      accentMuted: detected.colors.accentMuted,
      rule: detected.colors.rule,
    }
    : {
      text: base.textColor,
      heading: base.headingColor,
      accent: base.accentColor,
      accentMuted: base.accentColor,
      rule: base.ruleColor,
    };

  const fontSizes = detected
    ? {
      name: detected.fontSizes.namePx,
      contact: detected.fontSizes.contactPx,
      heading: detected.fontSizes.headingPx,
      body: detected.fontSizes.bodyPx,
      small: detected.fontSizes.smallPx,
    }
    : {
      name: base.nameSize,
      contact: Math.round(base.baseFontSize * 0.94 * 10) / 10,
      heading: base.headingSize,
      body: base.baseFontSize,
      small: Math.round(base.baseFontSize * 0.9 * 10) / 10,
    };

  const spacing = detected
    ? {
      lineHeight: detected.spacing.lineHeight,
      blockGap: detected.spacing.blockGapPx,
      sectionGap: detected.spacing.sectionGapPx,
      entryGap: detected.spacing.entryGapPx,
      headingTop: detected.spacing.headingMarginTopPx,
      headingBottom: detected.spacing.headingMarginBottomPx,
    }
    : {
      lineHeight: base.lineHeight,
      blockGap: Math.round(base.baseFontSize * 0.7),
      sectionGap: base.sectionGap,
      entryGap: base.entryGap,
      headingTop: Math.round(base.baseFontSize * 1.1),
      headingBottom: Math.round(base.baseFontSize * 0.34),
    };

  const margins = detected
    ? {
      top: detected.margins.topPx,
      right: detected.margins.rightPx,
      bottom: detected.margins.bottomPx,
      left: detected.margins.leftPx,
    }
    : {
      top: base.marginTop,
      right: base.marginRight,
      bottom: base.marginBottom,
      left: base.marginLeft,
    };

  const page = detected
    ? detected.page
    : {
      widthPx: 794,
      heightPx: 1123,
      widthMm: 210,
      heightMm: 297,
      ratio: 297 / 210,
    };

  return {
    styleId: base.id,
    styleName: base.name,
    preserveLayout: Boolean(detected),
    page,
    columns: detected ? detected.columns : 1,
    fontFamily: detected ? detected.fontFamily : base.fontFamily,
    headingFontFamily: detected ? detected.fontFamily : base.headingFont,
    isSerif: detected ? detected.isSerif : styleId === 'executive',
    fontSizes,
    spacing,
    margins,
    colors,
    bulletStyle: detected ? detected.bulletStyle : base.bulletStyle,
    upperCaseHeadings: detected ? detected.fontSizes.headingPx > 0 : base.upperCaseHeadings,
    align: detected ? detected.alignment : 'left',
    ruleUnderHeader: styleId === 'corporate' || styleId === 'executive',
    ruleUnderHeadings: styleId === 'corporate' || styleId === 'executive' || Boolean(detected?.colors.hasAccent),
    letterSpacing: styleId === 'corporate' ? base.letterSpacing : (detected ? 0 : base.letterSpacing),
    nameWeight: styleId === 'executive' ? 700 : 750,
    headingWeight: styleId === 'minimal' ? 700 : 700,
  };
};

/** Convert a theme into an inline style object (used by the React renderer). */
export const themeStyles = (theme) => ({
  page: {
    width: px(theme.page.widthPx),
    minHeight: px(theme.page.heightPx),
    paddingTop: px(theme.margins.top),
    paddingRight: px(theme.margins.right),
    paddingBottom: px(theme.margins.bottom),
    paddingLeft: px(theme.margins.left),
    fontFamily: theme.fontFamily,
    fontSize: px(theme.fontSizes.body),
    lineHeight: theme.spacing.lineHeight,
    color: theme.colors.text,
    background: '#ffffff',
    textAlign: theme.align,
    boxSizing: 'border-box',
  },
  name: {
    fontSize: px(theme.fontSizes.name),
    fontWeight: theme.nameWeight,
    color: theme.colors.heading,
    letterSpacing: `${theme.letterSpacing}px`,
    lineHeight: 1.12,
    margin: 0,
    fontFamily: theme.headingFontFamily,
  },
  contact: {
    fontSize: px(theme.fontSizes.contact),
    color: theme.colors.text,
    opacity: 0.86,
    lineHeight: 1.42,
  },
  heading: {
    fontSize: px(theme.fontSizes.heading),
    fontWeight: theme.headingWeight,
    color: theme.colors.heading,
    textTransform: theme.upperCaseHeadings ? 'uppercase' : 'none',
    letterSpacing: theme.styleId === 'corporate' ? '0.9px' : '0.4px',
    margin: `${theme.spacing.headingTop}px 0 ${theme.spacing.headingBottom}px`,
    lineHeight: 1.2,
    borderBottom: theme.ruleUnderHeadings ? `0.9px solid ${theme.colors.rule}` : 'none',
    paddingBottom: theme.ruleUnderHeadings ? '3px' : 0,
    fontFamily: theme.headingFontFamily,
  },
  entryHeader: {
    fontSize: px(theme.fontSizes.body * 1.02),
    margin: 0,
    lineHeight: 1.34,
  },
  role: { fontWeight: 700, color: theme.colors.text },
  company: { fontWeight: 600, color: theme.colors.accent },
  meta: { fontSize: px(theme.fontSizes.small), color: theme.colors.text, opacity: 0.78 },
  bullet: {
    fontSize: px(theme.fontSizes.body),
    lineHeight: theme.spacing.lineHeight,
    margin: `0 0 ${Math.max(2, theme.spacing.blockGap * 0.45)}px 0`,
  },
  small: { fontSize: px(theme.fontSizes.small), lineHeight: theme.spacing.lineHeight },
});

export default buildTheme;
