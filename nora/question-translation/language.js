'use strict';
// This is a conservative script mismatch guard, not language detection.
// A reviewer still checks translation quality, meaning and mixed-language terms.
function obviousLanguageMismatch(value, language) {
  if (typeof value !== 'string' || !['ko', 'en'].includes(language)) return false;
  const unquoted = value.replace(/```[\s\S]*?```|`[^`\n]*`|"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/g, ' ');
  // Retain a wholly quoted question, while allowing source quotations and code
  // inside an otherwise English/Korean sentence to remain in their own script.
  const prose = /[A-Za-z가-힣]/.test(unquoted) ? unquoted : value;
  const hangul = (prose.match(/[가-힣]/g) || []).length;
  const latin = (prose.match(/[A-Za-z]/g) || []).length;
  return language === 'ko' ? hangul === 0 : hangul > 0 && (latin === 0 || hangul > 20 && hangul > latin);
}
module.exports = {obviousLanguageMismatch};
