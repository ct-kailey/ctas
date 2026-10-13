'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const express = require('express');

// Next's static export embeds bootstrap/RSC scripts. Authorize only the exact
// trusted build output; never relax the workspace or API policy with unsafe-inline.
function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  return [...hashes];
}

function createDashboardRouter(directory, { production = false } = {}) {
  const router = express.Router();
  const policyCache = new Map();
  router.use(express.static(directory, {
    index: 'index.html', dotfiles: 'deny', fallthrough: true,
    setHeaders(res, filename) {
      if (path.extname(filename) === '.html') {
        let hashes = production ? policyCache.get(filename) : undefined;
        if (!hashes) {
          hashes = inlineScriptHashes(fs.readFileSync(filename, 'utf8'));
          if (production) policyCache.set(filename, hashes);
        }
        const existing = String(res.getHeader('Content-Security-Policy') || "default-src 'self';script-src 'self'");
        const scriptPolicy = `script-src 'self'${hashes.length ? ' ' + hashes.join(' ') : ''}`;
        res.setHeader('Content-Security-Policy', /(?:^|;)\s*script-src\s/.test(existing)
          ? existing.replace(/(^|;)\s*script-src\s[^;]*/, `$1${scriptPolicy}`)
          : `${existing};${scriptPolicy}`);
        res.setHeader('Cache-Control', 'no-cache');
      } else if (filename.includes(`${path.sep}_next${path.sep}static${path.sep}`)) {
        res.setHeader('Cache-Control', production ? 'public, max-age=31536000, immutable' : 'no-cache');
      } else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // Unknown dashboard routes must not fall through to the authenticated Vite app.
  router.use((_req, res) => res.status(404).type('text').send('대시보드 화면을 찾을 수 없습니다. /dashboard/에서 다시 시작해 주세요.'));
  return router;
}
module.exports = { createDashboardRouter, inlineScriptHashes };
