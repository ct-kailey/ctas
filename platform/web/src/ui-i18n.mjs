import english from './locales/en.json' with { type: 'json' };
import { createElement, Fragment } from 'react';
import { getLocale } from './ui-language-state.mjs';
export { getLocale, getLocaleTag, applyUiLanguage, readUiLanguage, persistUiLanguage, changeUiLanguage, UI_LANGUAGES, UI_LANGUAGE_STORAGE_KEY } from './ui-language-state.mjs';

export function validTranslation(source, candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return false;
  const tokens = text => [...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort().join(',');
  return tokens(source) === tokens(candidate);
}
function localizedTemplate(source, locale, catalog) {
  const original = String(source), key = original.trim();
  const translated = locale === 'en' && Object.hasOwn(catalog, key) && validTranslation(key, catalog[key]) ? catalog[key] : key;
  // Preserve source-owned outer spaces; inserted values are never looked up in
  // the catalog. React renders this result as text, never as HTML.
  return original.slice(0, original.length - original.trimStart().length) + translated + original.slice(original.trimEnd().length);
}
export function translateWithCatalog(source, values = [], locale = 'ko', catalog = english) {
  return localizedTemplate(source, locale, catalog).replace(/\{(\d+)\}/g, (token, index) => Number(index) < values.length ? String(values[Number(index)]) : token);
}
export function translatePartsWithCatalog(source, values = [], locale = 'ko', catalog = english) {
  const template = localizedTemplate(source, locale, catalog), output = [];
  let cursor = 0;
  for (const match of template.matchAll(/\{(\d+)\}/g)) {
    output.push(template.slice(cursor, match.index));
    const index = Number(match[1]);
    // A keyed Fragment preserves ReactNode/null semantics and avoids introducing
    // key warnings when a translated phrase contains an element or a child list.
    output.push(index < values.length ? createElement(Fragment, { key: `i18n-${index}` }, values[index]) : match[0]);
    cursor = match.index + match[0].length;
  }
  output.push(template.slice(cursor));
  return output;
}
export function translate(source, values = []) { return translateWithCatalog(source, values, getLocale()); }
export function translateParts(source, values = []) { return translatePartsWithCatalog(source, values, getLocale()); }
