'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../server/server');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '.ains-dashboard-redirect-'));
  await fs.mkdir(path.join(root, 'dashboard/_next/static'), { recursive: true });
  await fs.writeFile(path.join(root, 'index.html'), '<title>Unified AINS workspace</title>');
  // Even a stale build's files must not revive the separate dashboard product.
  await fs.writeFile(path.join(root, 'dashboard/index.html'), '<title>Old example dashboard</title>');
  await fs.writeFile(path.join(root, 'dashboard/_next/static/app.js'), 'oldDashboard()');
  await fs.writeFile(path.join(root, 'dashboard/.env'), 'do-not-serve');
  const app = createApp({ pool: { query: async () => { throw new Error('Redirects must not query the database'); } }, staticDir: root, production: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('old dashboard URLs redirect into the unified workflow without mapping example slugs to real projects', async t => {
  const origin = await fixture(t);
  const cases = [
    ['/dashboard', '/?tab=home'], ['/dashboard/', '/?tab=home'],
    ['/dashboard/alerts', '/?tab=alerts'], ['/dashboard/alerts/', '/?tab=alerts'],
    ['/dashboard/example', '/?tab=home'], ['/dashboard/example/', '/?tab=home'],
    ...['seegene', 'a-corp', 'b-corp'].flatMap(slug => [
      [`/dashboard/projects/${slug}/`, '/?tab=home'],
      [`/dashboard/projects/${slug}/settings/`, '/?tab=home'],
    ]),
    ['/dashboard/?project=existing-project', '/?tab=home&project=existing-project'],
    ['/dashboard/alerts/?project=existing-project', '/?tab=alerts&project=existing-project'],
    ['/dashboard/projects/seegene/?project=explicit-project', '/?tab=home&project=explicit-project'],
    ['/dashboard/?project=', '/?tab=home&project='],
    ['/dashboard/?project=not-an-accessible-project&tab=settings&redirect=https://example.test', '/?tab=home&project=not-an-accessible-project'],
    ['/dashboard/?project=https%3A%2F%2Fexample.test%2F%3Ftab%3Dsettings%26project%3Dother', '/?tab=home&project=https%3A%2F%2Fexample.test%2F%3Ftab%3Dsettings%26project%3Dother'],
  ];
  for (const [url, target] of cases) {
    const response = await fetch(origin + url, { redirect: 'manual' });
    assert.equal(response.status, 302, url);
    assert.equal(response.headers.get('location'), target, url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const policy = response.headers.get('content-security-policy');
    assert.match(policy, /frame-ancestors 'none'/);
    assert.doesNotMatch(policy.match(/script-src[^;]*/)[0], /unsafe-inline|sha256-/);
  }
  const head = await fetch(origin + '/dashboard/alerts?project=p', { method: 'HEAD', redirect: 'manual' });
  assert.equal(head.status, 302);
  assert.equal(head.headers.get('location'), '/?tab=alerts&project=p');
});

test('workspace and workflow guide retain SPA serving and CSP; unknown dashboard paths and old assets are not served', async t => {
  const origin = await fixture(t);
  for (const url of ['/', '/?tab=home&project=p', '/?tab=alerts&project=p', '/preview']) {
    const response = await fetch(origin + url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Unified AINS workspace/);
    const policy = response.headers.get('content-security-policy');
    assert.doesNotMatch(policy, /sha256-/);
    assert.doesNotMatch(policy.match(/script-src[^;]*/)[0], /unsafe-inline/);
  }
  for (const url of ['/dashboard/unknown/', '/dashboard/projects/customer-project/', '/dashboard/projects/seegene/other/', '/dashboard/.env', '/dashboard/%2e%2e%2findex.html', '/dashboard/_next/static/app.js']) {
    const response = await fetch(origin + url, { redirect: 'manual' });
    assert.equal(response.status, 404, url);
    assert.doesNotMatch(await response.text(), /Unified AINS|Old example|do-not-serve|oldDashboard/);
  }
  assert.equal((await fetch(origin + '/dashboard/', { method: 'POST', redirect: 'manual' })).status, 404);
});
