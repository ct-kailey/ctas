// A share secret is consumed before any application request. It is never copied
// into storage, query parameters, analytics, or an error message.
export function consumeSharedViewLocation(browser) {
  const params = new URLSearchParams(browser.location.hash.slice(1));
  if (!params.has('share')) return null;
  const token = params.get('share');
  browser.history.replaceState(null, '', `${browser.location.pathname}${browser.location.search}`);
  setSharedViewIntent(browser, true);
  return token;
}

const SHARED_INTENT_KEY = 'ains.shared-view.active';
export function hasSharedViewIntent(browser) {
  try { return browser.sessionStorage.getItem(SHARED_INTENT_KEY) === 'true'; } catch { return false; }
}
export function setSharedViewIntent(browser, active) {
  try { if (active) browser.sessionStorage.setItem(SHARED_INTENT_KEY, 'true'); else browser.sessionStorage.removeItem(SHARED_INTENT_KEY); } catch { /* Cookie still protects shared-session boundaries. */ }
}

export const SHARED_VIEW_TABS = new Set([
  'home', 'alerts', 'commercial', 'documents', 'channels', 'transcriptions',
  'overview', 'context', 'reviews', 'activity', 'work-items', 'questions',
  'work-governance', 'implementation',
]);

export function sharedViewTab(tab, shared) {
  return shared && !SHARED_VIEW_TABS.has(tab) ? 'home' : tab;
}
