'use strict';
const express = require('express');

const PREVIOUS_EXAMPLE_PROJECTS = new Set(['seegene', 'a-corp', 'b-corp']);

// Preserve old bookmarks while keeping one authenticated workflow application.
// The former example slugs are never interpreted as actual project identifiers.
function destinationFor(req) {
  const route = req.path.replace(/\/+$/, '') || '/';
  let tab;
  if (route === '/' || route === '/example') tab = 'home';
  else if (route === '/alerts') tab = 'alerts';
  else {
    const match = /^\/projects\/([^/]+)(?:\/settings)?$/.exec(route);
    if (!match || !PREVIOUS_EXAMPLE_PROJECTS.has(match[1])) return null;
    tab = 'home';
  }
  const query = new URL(req.originalUrl, 'http://ains.invalid').searchParams;
  const destination = new URLSearchParams({ tab });
  // Keep an explicitly requested (including empty or invalid) project so the
  // workspace's membership checks fail closed instead of choosing another one.
  if (query.has('project')) destination.set('project', query.get('project'));
  return `/?${destination.toString()}`;
}

function createDashboardRouter() {
  const router = express.Router();
  router.use((req, res) => {
    const destination = ['GET', 'HEAD'].includes(req.method) ? destinationFor(req) : null;
    res.setHeader('Cache-Control', 'no-store');
    if (destination) return res.redirect(302, destination);
    return res.status(404).type('text').send('화면을 찾을 수 없습니다. AINS 작업실에서 다시 시작해 주세요.');
  });
  return router;
}
module.exports = { createDashboardRouter };
