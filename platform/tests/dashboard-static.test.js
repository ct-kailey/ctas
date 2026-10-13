'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createApp } = require('../server/server');
const { inlineScriptHashes } = require('../server/dashboard-static');

test('static dashboard supports deep links and narrowly authorizes only its bootstrap scripts', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '.ains-dashboard-test-'));
  await fs.mkdir(path.join(root, 'dashboard/projects/demo'), { recursive: true });
  await fs.mkdir(path.join(root, 'dashboard/_next/static/chunks'), { recursive: true });
  const html = '<!doctype html><title>Demo dashboard</title><script>self.__next_f=[];</script><script src="/dashboard/_next/static/chunks/app.js"></script>';
  await fs.writeFile(path.join(root, 'index.html'), '<title>Workspace</title>');
  await fs.writeFile(path.join(root, 'dashboard/index.html'), html);
  await fs.writeFile(path.join(root, 'dashboard/projects/demo/index.html'), html);
  await fs.writeFile(path.join(root, 'dashboard/projects/demo/index.txt'), 'RSC sample');
  await fs.writeFile(path.join(root, 'dashboard/_next/static/chunks/app.js'), 'console.log("sample")');
  await fs.writeFile(path.join(root, 'dashboard/.env'), 'do-not-serve');
  const app = createApp({ pool: { query: async () => { throw new Error('Static routes must not query the database'); } }, staticDir: root, production: true });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const url of ['/dashboard', '/dashboard/', '/dashboard/projects/demo/']) {
    const res = await fetch(origin + url);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Demo dashboard/);
    const policy = res.headers.get('content-security-policy');
    assert.ok(policy.includes(inlineScriptHashes(html)[0]));
    assert.doesNotMatch(policy.match(/script-src[^;]*/)[0], /unsafe-inline/);
    assert.match(policy, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
  }
  const workspace = await fetch(origin + '/preview');
  assert.equal(workspace.status, 200);
  assert.match(await workspace.text(), /Workspace/);
  assert.doesNotMatch(workspace.headers.get('content-security-policy'), /sha256-/);
  const asset = await fetch(origin + '/dashboard/_next/static/chunks/app.js');
  assert.equal(asset.status, 200); assert.match(asset.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(origin + '/dashboard/projects/demo/index.txt')).status, 200);
  for (const url of ['/dashboard/unknown/', '/dashboard/.env', '/dashboard/%2e%2e%2findex.html']) {
    const res = await fetch(origin + url);
    assert.equal(res.status, 404);
    assert.doesNotMatch(await res.text(), /Workspace|do-not-serve/);
  }
});

test('inline hashes exclude external scripts and preserve exact inline bytes', () => {
  const hashes = inlineScriptHashes('<script src="a.js"></script><script> </script><script>hello();</script><script>hello();</script>');
  assert.equal(hashes.length, 1);
  assert.notDeepEqual(hashes, inlineScriptHashes('<script> hello();</script>'));
});
