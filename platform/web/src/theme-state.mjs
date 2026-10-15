// Keep browser storage untrusted: only known axes and finite hue values can
// become document attributes. Icon family and UI language are project choices.
export const THEME_STORAGE_KEY = 'ains.ctds.theme.v1';
export const AXES = Object.freeze({
  mode: ['light', 'dark'],
  palette: ['mono', 'vivid', 'standard', 'calm', 'pastel'],
  shape: ['soft', 'standard', 'crisp'],
  density: ['compact', 'default', 'comfortable'],
  motion: ['bouncy', 'standard', 'calm', 'none'],
});
export function normalizeTheme(value, defaults) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = { theme: 'spare', iconFamily: 'lucide', lang: 'ko', focusRing: 'on', voice: 'neutral' };
  for (const [key, choices] of Object.entries(AXES)) result[key] = choices.includes(input[key]) ? input[key] : defaults[key];
  result.hue = typeof input.hue === 'number' && Number.isFinite(input.hue) && input.hue >= 0 && input.hue <= 360 ? input.hue : defaults.hue;
  return result;
}
export function readTheme(storage, defaults) {
  try {
    const saved = JSON.parse(storage.getItem(THEME_STORAGE_KEY));
    // Update the previous default brand once; retain custom colors and other axes.
    // New explicit selections of hue 145 are preserved by the revision marker.
    if (saved && !Array.isArray(saved) && saved.brandRevision !== 2 && saved.palette === 'calm' && saved.hue === 145) saved.hue = defaults.hue;
    return normalizeTheme(saved, defaults);
  }
  catch { return normalizeTheme(null, defaults); }
}
export function persistTheme(storage, value) {
  try { storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ ...value, brandRevision: 2 })); return true; }
  catch { return false; }
}
export function applyThemeToDocument(theme, root) {
  const attrs = { mode: theme.mode, palette: theme.palette, shape: theme.shape, density: theme.density,
    motion: theme.motion, 'icon-family': theme.iconFamily, 'focus-ring': 'on', voice: theme.voice };
  for (const [key, value] of Object.entries(attrs)) root.setAttribute(`data-${key}`, value);
  root.style.setProperty('--hue', String(theme.hue));
  root.style.colorScheme = theme.mode;
}
