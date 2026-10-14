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

// Changing only #share in an already-open tab does not load a new document.
// Restart through the normal entry path so the old account's pending requests
// and in-memory views cannot survive a switch to a different shared session.
export function watchSharedViewLocation(browser) {
  let reloading = false;
  const onHashChange = () => {
    if (reloading || !new URLSearchParams(browser.location.hash.slice(1)).has('share')) return;
    reloading = true;
    // Keep the fragment for the next document's one-time token consumption.
    browser.location.reload();
  };
  browser.addEventListener('hashchange', onHashChange);
  // Cover a link received between module evaluation and React effect setup.
  onHashChange();
  return () => browser.removeEventListener('hashchange', onHashChange);
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
