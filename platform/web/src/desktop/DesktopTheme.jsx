import React, { useLayoutEffect } from 'react';
import { IconAxisProvider } from '../components/ctds/Icon';
import config from '../../../../ctds.config.json';
import { applyThemeContrast } from '../theme-contrast.mjs';
const ICON_AXIS = { family: 'lucide', weight: 'regular' };
export function DesktopTheme({ children }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const key of ['mode', 'palette', 'shape', 'density', 'motion', 'theme', 'voice']) root.setAttribute(`data-${key}`, config[key]);
    root.setAttribute('data-lang', 'ko'); root.setAttribute('data-icon-family', 'lucide'); root.setAttribute('data-focus-ring', 'on');
    root.style.setProperty('--hue', String(config.hue)); root.style.colorScheme = config.mode;
    applyThemeContrast(root);
  }, []);
  return <IconAxisProvider value={ICON_AXIS}>{children}</IconAxisProvider>;
}
