import { getLocale } from './ui-language-state.mjs';

// API error codes are contracts. Never translate project records or arbitrary
// response fields; retain an unmapped server explanation for support/review.
const ENGLISH = {
  CONNECTION_ERROR: 'The server response could not be confirmed. Check the current status before trying again.',
  UNAUTHENTICATED: 'Your session has expired. Sign in again.',
  UNAUTHORIZED: 'Sign in to continue.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'This item is no longer available or you do not have access.',
  TASK_VERSION_CONFLICT: 'This task changed while you were editing it. Refresh and review the latest version.',
  QUESTION_VERSION_CONFLICT: 'This question changed while you were editing it. Refresh and review the latest version.',
  QUESTION_LANGUAGE_SETTINGS_CHANGED: 'The question language setting has changed. Refresh before saving.',
  QUESTION_TRANSLATION_UNAVAILABLE: 'Connect this project to a ready Nora workspace before translating questions.',
  QUESTION_TRANSLATION_ACTIVE: 'A translation is already running. Refresh the translation history to check its result.',
  QUESTION_TRANSLATION_INVALID: 'The translation could not be verified against its source and selected language. Review the run and request a new draft.',
  QUESTION_TRANSLATION_STALE: 'The original question has changed. Create a new translation from the latest version.',
  NORA_LEGACY_RUNS_ACTIVE: 'Earlier Nora runs are still active. Complete or resolve them before changing the workspace connection.',
  NORA_RISK_QUESTION_LANGUAGE_MISMATCH: 'Nora did not generate the questions in the selected language. Review the run and retry the analysis.',
};

export function presentApiError(error, locale = getLocale()) {
  const original = String(error?.message || error || '');
  if (locale !== 'en' || !/[\uac00-\ud7a3]/.test(original)) return { message: original, original: null };
  const message = ENGLISH[error?.code] || (error?.status === 401 ? ENGLISH.UNAUTHENTICATED : error?.status === 403 ? ENGLISH.FORBIDDEN : error?.status === 409 ? 'The saved state has changed or this action is not available yet. Refresh and review the original details below.' : 'This action could not be completed. Review the original server details below.');
  return { message, original };
}
