// Interface language is intentionally separate from project/customer content.
export const UI_LANGUAGE_STORAGE_KEY = 'ains.ui.language.v1';
export const UI_LANGUAGES = Object.freeze({ ko: '한국어', en: 'English' });
export const normalizeUiLanguage = value => value === 'en' ? 'en' : 'ko';
export function readUiLanguage(storage) {
  try { return normalizeUiLanguage(storage?.getItem(UI_LANGUAGE_STORAGE_KEY)); }
  catch { return 'ko'; }
}
export function persistUiLanguage(storage, value) {
  if (!Object.hasOwn(UI_LANGUAGES, value)) return false;
  try { storage.setItem(UI_LANGUAGE_STORAGE_KEY, value); return true; }
  catch { return false; }
}
function resolveLocale(browser) {
  try {
    const requested = new URL(browser.location?.href || 'https://ains.invalid/').searchParams.get('ui_lang');
    if (Object.hasOwn(UI_LANGUAGES, requested)) return requested;
    return readUiLanguage(browser.localStorage);
  }
  catch { return 'ko'; }
}
const PAGE_LOCALE = typeof globalThis.document === 'undefined' ? 'ko' : resolveLocale(globalThis);
try {
  const requested = new URL(globalThis.location?.href || 'https://ains.invalid/').searchParams.get('ui_lang');
  if (Object.hasOwn(UI_LANGUAGES, requested)) persistUiLanguage(globalThis.localStorage, requested);
} catch { /* URL preference remains usable when persistent storage is unavailable. */ }
export function getLocale(browser) { return browser ? resolveLocale(browser) : PAGE_LOCALE; }
export const getLocaleTag = () => getLocale() === 'en' ? 'en-US' : 'ko-KR';
// Call only after the host has resolved unsaved changes. A reload also updates
// module-level label maps, without mutating an in-progress document editor.
export function changeUiLanguage(locale, browser = globalThis) {
  if (!Object.hasOwn(UI_LANGUAGES, locale)) throw new TypeError('Unsupported interface language');
  const url = new URL(browser.location.href);
  // Persist on the next page load, so cancelling a native beforeunload prompt
  // leaves both this page and the saved preference unchanged.
  url.searchParams.set('ui_lang', locale);
  browser.location.assign(url.href);
  return { locale };
}
export function applyUiLanguage(root, locale = getLocale()) {
  if (!root) return;
  const language = normalizeUiLanguage(locale);
  root.setAttribute('lang', language);
  root.setAttribute('data-lang', language);
}
