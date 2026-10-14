'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { createPool, migrate } = require('../server/db');
const { provisionUser, sha256, verifyPassword } = require('../server/auth');
const { createApp } = require('../server/server');
const { googleConfig, createGoogleClient, validateClaims, signupDomains, resolveGoogleUser } = require('../server/google-auth');

const config = { clientId: 'test-client.apps.googleusercontent.com', clientSecret: 'synthetic-client-secret' };
const origin = 'https://workspace.example.test';
const nonce = crypto.randomBytes(32).toString('base64url');
function claims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return { iss: 'https://accounts.google.com', aud: config.clientId, sub: 'google-owner-123',
    iat: now - 10, exp: now + 600, nonce, email: 'owner@workspace.test', email_verified: true, hd: 'workspace.test', ...overrides };
}

test('Google configuration is disabled only when both values are absent', () => {
  assert.equal(googleConfig(), null);
  assert.equal(googleConfig({ clientId: '', clientSecret: '' }), null);
  for (const item of [{ clientId: config.clientId }, { clientSecret: config.clientSecret }, { clientId: ' ', clientSecret: 'x' }]) {
    assert.throws(() => googleConfig(item), /GOOGLE_OAUTH_CONFIG_INCOMPLETE/);
  }
});

test('Google signup domains require an explicit well-formed exact-domain allowlist', () => {
  assert.deepEqual(signupDomains(), []); assert.deepEqual(signupDomains('  '), []);
  assert.deepEqual(googleConfig(config).signupDomains, []);
  assert.deepEqual(googleConfig({ ...config, signupDomains: 'Conscience.Technology, partner.test,conscience.technology' }).signupDomains, ['conscience.technology', 'partner.test']);
  assert.deepEqual(signupDomains(['Conscience.Technology']), ['conscience.technology']);
  for (const invalid of [null, {}, 7, ['conscience.technology', ''], [1], 'conscience.technology,', '*.conscience.technology', '@conscience.technology', 'https://conscience.technology', 'conscience.technology:443', 'technology', '-conscience.technology', 'conscience..technology', 'a'.repeat(64) + '.test', Array(51).fill('company.test')]) {
    assert.throws(() => googleConfig({ ...config, signupDomains: invalid }), /GOOGLE_SIGNUP_DOMAINS_INVALID/);
    assert.throws(() => googleConfig({ signupDomains: invalid }), /GOOGLE_SIGNUP_DOMAINS_INVALID/);
  }
});

test('Google claim validation rejects wrong audience, issuer, expiry, nonce and unverified email', () => {
  const options = { clientId: config.clientId, nonceHash: sha256(nonce) };
  assert.equal(validateClaims(claims(), options).authoritative, true);
  assert.equal(validateClaims(claims({ email: 'test@gmail.com', hd: undefined }), options).authoritative, true);
  assert.equal(validateClaims(claims({ hd: undefined }), options).authoritative, false);
  for (const changed of [{ aud: 'other' }, { aud: [config.clientId] }, { azp: 'other' }, { iss: 'https://evil.test' },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { iat: Math.floor(Date.now() / 1000) + 120 },
    { nonce: crypto.randomBytes(32).toString('base64url') }, { sub: '' }, { sub: {} }, { email_verified: false }, { email_verified: 'true' }]) {
    assert.throws(() => validateClaims(claims(changed), options));
  }
});

test('Google profile names are bounded and fall back to the verified email local part', () => {
  const options = { clientId: config.clientId, nonceHash: sha256(nonce) };
  assert.equal(validateClaims(claims({ name: '  Vara Kim  ' }), options).name, 'Vara Kim');
  for (const name of [undefined, null, {}, '', ' ', 'a'.repeat(101), 'bad\nname', 'bad\u0000name', '\ud800']) {
    assert.equal(validateClaims(claims({ email: 'vara@conscience.technology', name }), options).name, 'vara');
  }
});

test('production Google verifier validates signatures, audience and issuer with library certificate verification', async t => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  t.mock.method(OAuth2Client.prototype, 'getFederatedSignonCertsAsync', async () => ({ certs: { test: publicKey.export({ type: 'spki', format: 'pem' }) } }));
  const sign = payload => {
    const text = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url') + '.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
    return text + '.' + crypto.sign('RSA-SHA256', Buffer.from(text), privateKey).toString('base64url');
  };
  const client = createGoogleClient({ ...config, redirectUri: origin + '/api/auth/google/callback' });
  assert.equal((await client.verify(sign(claims()))).sub, 'google-owner-123');
  const original = sign(claims());
  const forged = original.split('.'); forged[1] = Buffer.from(JSON.stringify(claims({ sub: 'attacker' }))).toString('base64url');
  await assert.rejects(() => client.verify(forged.join('.')), /signature/);
  await assert.rejects(() => client.verify(sign(claims({ aud: 'another-app' }))), /audience/);
  await assert.rejects(() => client.verify(sign(claims({ iss: 'https://evil.test' }))), /issuer/);
  await assert.rejects(() => client.verify(sign(claims({ exp: Math.floor(Date.now() / 1000) - 600 }))), /late/);
});

test('Google OAuth HTTP lifecycle with isolated database', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'google_' + crypto.randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  const servers = [];
  t.after(async () => {
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  });
  await migrate(pool); await migrate(pool);
  const owner = await provisionUser(pool, { email: 'owner@workspace.test', name: 'Owner', password: 'synthetic-owner-password' });
  const viewer = await provisionUser(pool, { email: 'viewer@gmail.com', name: 'Viewer', password: 'synthetic-viewer-password' });
  await pool.query("INSERT INTO projects(id,name) VALUES('google-project','Google test')");
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('google-project',$1,'viewer')", [viewer.id]);
  const identityResponses = new Map(), exchanges = [];
  const realClient = createGoogleClient({ ...config, redirectUri: origin + '/api/auth/google/callback' });
  const googleClient = { authorizationUrl: realClient.authorizationUrl, exchange: async args => { exchanges.push(args); return args.code; },
    verify: async code => { const value = identityResponses.get(code); if (value instanceof Error) throw value; return value; } };
  async function serve(extra = {}) {
    const app = createApp({ pool, appOrigin: origin, production: true, ...extra });
    const server = app.listen(0, '127.0.0.1'); servers.push(server);
    await new Promise(resolve => server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    return (route, options = {}) => fetch(base + route, { redirect: 'manual', ...options });
  }
  const call = await serve({ google: config, googleClient });
  const cookieFrom = response => response.headers.getSetCookie().find(value => value.startsWith('__Host-ains_google_oauth='))?.split(';')[0];
  async function begin() {
    await pool.query('DELETE FROM auth_attempts');
    const res = await call('/api/auth/google');
    assert.equal(res.status, 302);
    return { res, url: new URL(res.headers.get('location')), cookie: cookieFrom(res) };
  }
  async function finish(attempt, overrides = {}, options = {}) {
    const code = crypto.randomUUID();
    identityResponses.set(code, claims({ nonce: attempt.url.searchParams.get('nonce'), ...overrides }));
    return call('/api/auth/google/callback?state=' + attempt.url.searchParams.get('state') + '&code=' + code,
      { headers: { Cookie: attempt.cookie, ...(options.headers || {}) }, ...options });
  }
  const location = response => response.headers.get('location');

  await t.test('disabled provider is honest and missing configuration rejects startup', async () => {
    const disabled = await serve();
    assert.deepEqual(await (await disabled('/api/auth/providers')).json(), { google: { enabled: false, signup_domains: [] } });
    assert.equal(location(await disabled('/api/auth/google')), '/?auth_error=unavailable');
    const disabledWithDomains = await serve({ google: { signupDomains: 'conscience.technology' } });
    assert.deepEqual(await (await disabledWithDomains('/api/auth/providers')).json(), { google: { enabled: false, signup_domains: [] } });
    assert.throws(() => createApp({ pool, appOrigin: origin, google: { clientId: config.clientId } }), /INCOMPLETE/);
    assert.deepEqual(await (await call('/api/auth/providers')).json(), { google: { enabled: true, signup_domains: [] } });
  });
  await t.test('start uses fixed redirect, minimal scopes, PKCE, nonce, hashed state and secure browser cookie', async () => {
    const attempt = await begin(), params = attempt.url.searchParams;
    assert.equal(attempt.url.origin, 'https://accounts.google.com');
    assert.equal(params.get('redirect_uri'), origin + '/api/auth/google/callback');
    assert.equal(params.get('scope'), 'openid email profile');
    assert.equal(params.get('access_type'), 'online'); assert.equal(params.get('code_challenge_method'), 'S256');
    assert.match(attempt.res.headers.get('set-cookie'), /HttpOnly/); assert.match(attempt.res.headers.get('set-cookie'), /Secure/);
    assert.match(attempt.res.headers.get('set-cookie'), /SameSite=Lax/); assert.match(attempt.res.headers.get('set-cookie'), /Path=\//);
    assert.equal(params.has('client_secret'), false);
    const row = (await pool.query('SELECT * FROM google_oauth_attempts WHERE state_hash=$1', [sha256(params.get('state'))])).rows[0];
    assert.equal(row.nonce_hash, sha256(params.get('nonce')));
    assert.equal(params.get('code_challenge'), crypto.createHash('sha256').update(row.code_verifier).digest('base64url'));
    assert.ok(row.expires_at.getTime() - Date.now() < 10 * 60 * 1000);
  });
  await t.test('browser binding blocks missing or another-browser cookie without consuming valid attempt', async () => {
    const attempt = await begin(), initial = exchanges.length;
    assert.equal(location(await finish(attempt, {}, { headers: {} })), '/?auth_error=state_invalid');
    assert.equal(location(await finish(attempt, {}, { headers: { Cookie: '__Host-ains_google_oauth=' + crypto.randomBytes(32).toString('base64url') } })), '/?auth_error=state_invalid');
    assert.equal(exchanges.length, initial);
    assert.equal(location(await finish(attempt)), '/');
  });
  await t.test('successful login issues existing session with CSRF and rotates prior session', async () => {
    const old = await call('/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: owner.email, password: 'synthetic-owner-password' }) });
    const oldCookie = old.headers.getSetCookie()[0].split(';')[0];
    const attempt = await begin();
    const response = await finish(attempt, {}, { headers: { Cookie: attempt.cookie + '; ' + oldCookie } });
    assert.equal(location(response), '/');
    const sessionHeader = response.headers.getSetCookie().find(value => value.startsWith('ains_session='));
    assert.match(sessionHeader, /HttpOnly/); assert.match(sessionHeader, /Secure/);
    const sessionCookie = sessionHeader.split(';')[0];
    const session = await (await call('/api/session', { headers: { Cookie: sessionCookie } })).json();
    assert.equal(session.user.id, owner.id); assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal((await call('/api/session', { headers: { Cookie: oldCookie } })).status, 401);
    assert.equal((await pool.query('SELECT user_id FROM google_identities WHERE subject=$1', ['google-owner-123'])).rows[0].user_id, owner.id);
  });
  await t.test('OAuth state is atomically consumed for simultaneous callbacks and cannot replay', async () => {
    const attempt = await begin(), before = exchanges.length;
    const responses = await Promise.all([finish(attempt), finish(attempt)]);
    assert.deepEqual(responses.map(location).sort(), ['/', '/?auth_error=state_invalid']);
    assert.equal(exchanges.length - before, 1);
    assert.equal(location(await finish(attempt)), '/?auth_error=state_invalid');
  });
  await t.test('expired, duplicate or altered state fails before exchange', async () => {
    const attempt = await begin(), before = exchanges.length, state = attempt.url.searchParams.get('state');
    const headers = { Cookie: attempt.cookie };
    assert.equal(location(await call('/api/auth/google/callback?state=' + state + '&state=' + state + '&code=fake', { headers })), '/?auth_error=state_invalid');
    await pool.query('UPDATE google_oauth_attempts SET expires_at=now()-interval \'1 second\' WHERE state_hash=$1', [sha256(state)]);
    assert.equal(location(await finish(attempt)), '/?auth_error=state_invalid');
    assert.equal(exchanges.length, before);
  });
  await t.test('denied consent consumes attempt and redacts provider detail', async () => {
    const attempt = await begin();
    const response = await call('/api/auth/google/callback?state=' + attempt.url.searchParams.get('state') + '&error=access_denied&error_description=sensitive', { headers: { Cookie: attempt.cookie } });
    assert.equal(location(response), '/?auth_error=cancelled');
    assert.equal((await response.text()).includes('sensitive'), false);
    assert.equal(location(await finish(attempt)), '/?auth_error=state_invalid');
  });
  for (const [name, overrides, expected] of [
    ['unregistered user', { email: 'unknown@gmail.com', sub: 'unknown', hd: undefined }, 'account_not_allowed'],
    ['unverified email', { email_verified: false }, 'account_not_allowed'],
    ['new non-authoritative identity', { email: owner.email, sub: 'third-party', hd: undefined }, 'account_not_allowed'],
    ['different subject for existing user', { sub: 'replacement-subject' }, 'identity_conflict'],
    ['changed email for bound subject', { email: viewer.email, hd: undefined }, 'identity_conflict'],
    ['wrong nonce', { nonce: crypto.randomBytes(32).toString('base64url') }, 'failed'],
    ['wrong audience', { aud: 'another-client' }, 'failed'],
  ]) {
    await t.test(name + ' is rejected without adding users, identities or sessions', async () => {
      const counts = async () => (await pool.query('SELECT (SELECT count(*)::int FROM users) users,(SELECT count(*)::int FROM sessions) sessions,(SELECT count(*)::int FROM google_identities) identities')).rows[0];
      const before = await counts(), attempt = await begin();
      assert.equal(location(await finish(attempt, overrides)), '/?auth_error=' + expected);
      assert.deepEqual(await counts(), before);
    });
  }
  await t.test('Gmail login preserves existing viewer role and never creates memberships', async () => {
    const before = (await pool.query('SELECT * FROM memberships ORDER BY user_id')).rows;
    const attempt = await begin();
    const response = await finish(attempt, { email: viewer.email, sub: 'google-viewer', hd: undefined });
    assert.equal(location(response), '/');
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('ains_session=')).split(';')[0];
    const session = await (await call('/api/session', { headers: { Cookie: cookie } })).json();
    const res = await call('/api/projects/google-project/reviews/' + crypto.randomUUID() + '/decision', { method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' });
    assert.equal(res.status, 403);
    assert.deepEqual((await pool.query('SELECT * FROM memberships ORDER BY user_id')).rows, before);
  });
  await t.test('PKCE verifier sent to token exchange matches the stored challenge', async () => {
    const attempt = await begin(); await finish(attempt);
    assert.equal(crypto.createHash('sha256').update(exchanges.at(-1).codeVerifier).digest('base64url'), attempt.url.searchParams.get('code_challenge'));
  });
  await t.test('provider failure consumes state and never leaks error content', async () => {
    const attempt = await begin(), code = crypto.randomUUID();
    identityResponses.set(code, new Error('secret-token-and-account@example.test'));
    const response = await call('/api/auth/google/callback?state=' + attempt.url.searchParams.get('state') + '&code=' + code, { headers: { Cookie: attempt.cookie } });
    assert.equal(location(response), '/?auth_error=failed');
    assert.equal((await response.text()).includes('secret-token'), false);
    assert.equal(location(await finish(attempt)), '/?auth_error=state_invalid');
  });
  await t.test('new start in same browser invalidates the prior attempt', async () => {
    const attempt = await begin();
    const replacement = await call('/api/auth/google', { headers: { Cookie: attempt.cookie } });
    assert.equal(replacement.status, 302);
    assert.equal(location(await finish(attempt)), '/?auth_error=state_invalid');
  });
  await t.test('login start rate limit prevents unbounded pending attempts', async () => {
    await pool.query('INSERT INTO auth_attempts(bucket,count,expires_at) VALUES($1,30,now()+interval \'1 minute\') ON CONFLICT(bucket) DO UPDATE SET count=30', ['google:start:' + sha256('127.0.0.1')]);
    const count = (await pool.query('SELECT count(*)::int count FROM google_oauth_attempts')).rows[0].count;
    assert.equal(location(await call('/api/auth/google')), '/?auth_error=failed');
    assert.equal((await pool.query('SELECT count(*)::int count FROM google_oauth_attempts')).rows[0].count, count);
  });
  await t.test('database identity cannot be reassigned', async () => {
    await assert.rejects(() => pool.query('UPDATE google_identities SET subject=$1 WHERE user_id=$2', ['changed-subject', owner.id]), { code: '23514' });
  });
  await t.test('concurrent first logins link one existing user to one subject without duplicate identities', async () => {
    const user = await provisionUser(pool, { email: 'parallel@gmail.com', name: 'Parallel', password: 'synthetic-parallel-password' });
    const attempts = [await begin(), await begin()];
    const results = await Promise.all(attempts.map(attempt => finish(attempt, { email: user.email, sub: 'parallel-subject', hd: undefined })));
    assert.deepEqual(results.map(location), ['/', '/']);
    const rows = (await pool.query('SELECT subject,user_id FROM google_identities WHERE user_id=$1', [user.id])).rows;
    assert.deepEqual(rows, [{ subject: 'parallel-subject', user_id: user.id }]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE user_id=$1', [user.id])).rows[0].n, 0);
  });
  await t.test('competing first subjects cannot both claim the same provisioned account', async () => {
    const user = await provisionUser(pool, { email: 'competing@gmail.com', name: 'Competing', password: 'synthetic-competing-password' });
    const attempts = [await begin(), await begin()];
    const results = await Promise.all(attempts.map((attempt, i) => finish(attempt, { email: user.email, sub: 'competing-subject-' + i, hd: undefined })));
    assert.deepEqual(results.map(location).sort(), ['/', '/?auth_error=identity_conflict']);
    assert.equal((await pool.query('SELECT count(*)::int n FROM google_identities WHERE user_id=$1', [user.id])).rows[0].n, 1);
  });
});

test('company Google signup is exact-domain restricted, atomic and separate from project access', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = 'google_signup_' + crypto.randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end();
  });
  await migrate(pool);
  await pool.query("INSERT INTO projects(id,name) VALUES('existing-project','Existing project')");
  const legacy = await provisionUser(pool, { email: 'legacy@workspace.test', name: 'Original name', password: 'synthetic-legacy-password', projectId: 'existing-project', role: 'viewer' });
  const allowedDomains = ['conscience.technology', 'partner.test'];
  const identityResponses = new Map();
  const realClient = createGoogleClient({ ...config, redirectUri: origin + '/api/auth/google/callback' });
  const googleClient = { authorizationUrl: realClient.authorizationUrl, exchange: async ({ code }) => code,
    verify: async code => identityResponses.get(code) };
  const app = createApp({ pool, appOrigin: origin, production: true, google: { ...config, signupDomains: allowedDomains }, googleClient });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const call = (route, options = {}) => fetch('http://127.0.0.1:' + server.address().port + route, { redirect: 'manual', ...options });
  async function login(overrides) {
    const start = await call('/api/auth/google');
    assert.equal(start.status, 302);
    const url = new URL(start.headers.get('location'));
    const cookie = start.headers.getSetCookie().find(value => value.startsWith('__Host-ains_google_oauth=')).split(';')[0];
    const code = crypto.randomUUID();
    identityResponses.set(code, claims({ email: 'vara@conscience.technology', hd: 'conscience.technology', sub: 'company-vara',
      name: 'Vara', nonce: url.searchParams.get('nonce'), ...overrides }));
    return call('/api/auth/google/callback?state=' + url.searchParams.get('state') + '&code=' + code, { headers: { Cookie: cookie } });
  }
  const sessionCookie = response => response.headers.getSetCookie().find(value => value.startsWith('ains_session='))?.split(';')[0];
  const counts = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM users) users,
    (SELECT count(*)::int FROM google_identities) identities,(SELECT count(*)::int FROM sessions) sessions,
    (SELECT count(*)::int FROM memberships) memberships`)).rows[0];
  const identity = overrides => validateClaims(claims({ email: 'parallel@conscience.technology', hd: 'conscience.technology', sub: 'parallel-new', name: 'Parallel', ...overrides }),
    { clientId: config.clientId, nonceHash: sha256(nonce) });
  const resolve = item => resolveGoogleUser(pool, item, { signupDomains: allowedDomains });

  await t.test('public provider metadata lists only configured signup domains', async () => {
    assert.deepEqual(await (await call('/api/auth/providers')).json(), { google: { enabled: true, signup_domains: allowedDomains } });
  });
  await t.test('first verified company login creates a session without existing project membership', async () => {
    const response = await login();
    assert.equal(response.headers.get('location'), '/');
    const cookie = sessionCookie(response);
    assert.ok(cookie);
    const session = await (await call('/api/session', { headers: { Cookie: cookie } })).json();
    assert.equal(session.user.email, 'vara@conscience.technology'); assert.equal(session.user.name, 'Vara');
    assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(session.user, 'password_hash'), false);
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [session.user.id])).rows[0];
    assert.match(user.password_hash, /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(await verifyPassword('vara@conscience.technology', user.password_hash), false);
    assert.equal(await verifyPassword('synthetic-legacy-password', user.password_hash), false);
    assert.deepEqual((await pool.query('SELECT subject,linked_email FROM google_identities WHERE user_id=$1', [user.id])).rows,
      [{ subject: 'company-vara', linked_email: 'vara@conscience.technology' }]);
    assert.deepEqual(await (await call('/api/projects', { headers: { Cookie: cookie } })).json(), { projects: [] });
    assert.equal((await call('/api/projects/existing-project/overview', { headers: { Cookie: cookie } })).status, 404);
    assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE user_id=$1', [user.id])).rows[0].n, 0);
  });
  await t.test('repeat company login keeps the same user, identity and password hash', async () => {
    const before = (await pool.query("SELECT * FROM users WHERE email='vara@conscience.technology'")).rows[0];
    assert.equal((await login({ name: 'Changed Google name' })).headers.get('location'), '/');
    assert.deepEqual((await pool.query('SELECT * FROM users WHERE id=$1', [before.id])).rows[0], before);
    assert.equal((await pool.query('SELECT count(*)::int n FROM google_identities WHERE user_id=$1', [before.id])).rows[0].n, 1);
  });
  await t.test('preprovisioned users outside signup domains can still link and log in with unchanged access', async () => {
    const beforeUser = (await pool.query('SELECT * FROM users WHERE id=$1', [legacy.id])).rows[0];
    const beforeMemberships = (await pool.query('SELECT * FROM memberships ORDER BY project_id,user_id')).rows;
    for (let i = 0; i < 2; i++) {
      const response = await login({ email: legacy.email, hd: 'workspace.test', sub: 'legacy-subject', name: 'Provider name' });
      assert.equal(response.headers.get('location'), '/');
      const session = await (await call('/api/session', { headers: { Cookie: sessionCookie(response) } })).json();
      assert.equal(session.user.id, legacy.id); assert.equal(session.user.name, 'Original name');
    }
    assert.deepEqual((await pool.query('SELECT * FROM users WHERE id=$1', [legacy.id])).rows[0], beforeUser);
    assert.deepEqual((await pool.query('SELECT * FROM memberships ORDER BY project_id,user_id')).rows, beforeMemberships);
  });
  for (const [name, overrides] of [
    ['missing Workspace hd', { email: 'no-hd@conscience.technology', hd: undefined }],
    ['unverified company email', { email: 'unverified@conscience.technology', email_verified: false }],
    ['different allowed hd', { email: 'different-hd@conscience.technology', hd: 'partner.test' }],
    ['different email domain', { email: 'elsewhere@other.test', hd: 'conscience.technology' }],
    ['subdomain', { email: 'subdomain@team.conscience.technology', hd: 'team.conscience.technology' }],
    ['domain suffix lookalike', { email: 'suffix@conscience.technology.evil.test', hd: 'conscience.technology.evil.test' }],
    ['domain prefix lookalike', { email: 'prefix@evilconscience.technology', hd: 'evilconscience.technology' }],
    ['consumer Gmail', { email: 'consumer@gmail.com', hd: undefined }],
  ]) {
    await t.test(name + ' cannot create users, identities, sessions or memberships', async () => {
      const before = await counts();
      const response = await login({ sub: 'rejected-' + crypto.randomUUID(), ...overrides });
      assert.equal(response.headers.get('location'), '/?auth_error=account_not_allowed');
      assert.equal(sessionCookie(response), undefined);
      assert.deepEqual(await counts(), before);
    });
  }
  await t.test('no signup configuration remains closed even for a verified company identity', async () => {
    const before = await counts();
    await assert.rejects(() => resolveGoogleUser(pool, identity({ email: 'default-denied@conscience.technology' })), { authCode: 'account_not_allowed' });
    assert.deepEqual(await counts(), before);
  });
  await t.test('simultaneous first logins create one user and one identity', async () => {
    const item = identity();
    const results = await Promise.all([resolve(item), resolve(item)]);
    assert.equal(results[0].id, results[1].id);
    assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE email=$1', [item.email])).rows[0].n, 1);
    assert.deepEqual((await pool.query('SELECT subject,user_id FROM google_identities WHERE user_id=$1', [results[0].id])).rows,
      [{ subject: item.subject, user_id: results[0].id }]);
    assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE user_id=$1', [results[0].id])).rows[0].n, 0);
  });
  await t.test('competing subjects cannot both create or claim the same new account', async () => {
    const email = 'competing-new@conscience.technology';
    const results = await Promise.allSettled([0, 1].map(i => resolve(identity({ email, sub: 'competing-new-' + i }))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.authCode, 'identity_conflict');
    const users = (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rows;
    assert.equal(users.length, 1);
    assert.equal((await pool.query('SELECT count(*)::int n FROM google_identities WHERE user_id=$1', [users[0].id])).rows[0].n, 1);
  });
  await t.test('a subject racing across two new email addresses cannot leave an orphan account', async () => {
    const emails = ['subject-race-a@conscience.technology', 'subject-race-b@conscience.technology'];
    const results = await Promise.allSettled(emails.map(email => resolve(identity({ email, sub: 'shared-racing-subject' }))));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.authCode, 'identity_conflict');
    assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE email=ANY($1::text[])', [emails])).rows[0].n, 1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM google_identities WHERE subject='shared-racing-subject'")).rows[0].n, 1);
  });
  await t.test('identity insertion failure rolls back the newly created user', async () => {
    const before = await counts();
    const failingPool = { connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: async (sql, values) => {
        if (sql.startsWith('INSERT INTO google_identities')) throw Object.assign(new Error('synthetic identity conflict'), { code: '23505' });
        return client.query(sql, values);
      } };
    } };
    await assert.rejects(() => resolveGoogleUser(failingPool, identity({ email: 'rollback@conscience.technology', sub: 'rollback-subject' }),
      { signupDomains: allowedDomains }), { authCode: 'identity_conflict' });
    assert.deepEqual(await counts(), before);
  });
});
