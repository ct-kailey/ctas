'use strict';

const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const { transaction } = require('./db');
const { cookies, sha256, constantEquals, emailAddress } = require('./auth');

const CALLBACK_PATH = '/api/auth/google/callback';
const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const fail = code => Object.assign(new Error('Google authentication rejected'), { authCode: code });
const random = () => crypto.randomBytes(32).toString('base64url');

function googleConfig({ clientId, clientSecret } = {}) {
  if (!clientId && !clientSecret) return null;
  if (typeof clientId !== 'string' || !clientId.trim() || typeof clientSecret !== 'string' || !clientSecret.trim()) {
    throw new Error('GOOGLE_OAUTH_CONFIG_INCOMPLETE');
  }
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

function createGoogleClient({ clientId, clientSecret, redirectUri }) {
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const transport = client.transporter;
  // Authorization codes are single-use. Bound network time and avoid automatic exchanges.
  client.transporter = { request: options => transport.request({ ...options, retry: false, timeout: 10000 }) };
  return {
    authorizationUrl: options => client.generateAuthUrl(options),
    exchange: async ({ code, codeVerifier }) => {
      const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16384) throw fail('failed');
      return tokens.id_token;
    },
    verify: async idToken => (await client.verifyIdToken({ idToken, audience: clientId })).getPayload(),
  };
}

function validateClaims(payload, { clientId, nonceHash, now = Date.now() }) {
  if (!payload || typeof payload !== 'object' || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      payload.aud !== clientId || (payload.azp !== undefined && payload.azp !== clientId) ||
      !Number.isInteger(payload.exp) || payload.exp <= now / 1000 ||
      !Number.isInteger(payload.iat) || payload.iat > now / 1000 + 60 || payload.iat >= payload.exp ||
      typeof payload.sub !== 'string' || !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
      typeof payload.nonce !== 'string' || !NONCE_PATTERN.test(payload.nonce) ||
      !constantEquals(sha256(payload.nonce), nonceHash)) throw fail('failed');
  if (payload.email_verified !== true) throw fail('account_not_allowed');
  let email;
  try { email = emailAddress(payload.email); } catch { throw fail('account_not_allowed'); }
  const authoritative = email.endsWith('@gmail.com') ||
    (typeof payload.hd === 'string' && /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(payload.hd) && payload.hd.includes('.'));
  return { subject: payload.sub, email, authoritative };
}

async function resolveGoogleUser(pool, identity) {
  return transaction(pool, async db => {
    const linked = (await db.query(`SELECT u.id,u.email,u.name,g.linked_email FROM google_identities g
      JOIN users u ON u.id=g.user_id WHERE g.subject=$1 FOR UPDATE OF u,g`, [identity.subject])).rows[0];
    if (linked) {
      if (linked.email !== identity.email || linked.linked_email !== identity.email) throw fail('identity_conflict');
      return linked;
    }
    // Google is not authoritative for third-party email without a Workspace hd claim.
    if (!identity.authoritative) throw fail('account_not_allowed');
    const user = (await db.query('SELECT id,email,name FROM users WHERE email=$1 FOR UPDATE', [identity.email])).rows[0];
    if (!user) throw fail('account_not_allowed');
    const existing = (await db.query('SELECT subject FROM google_identities WHERE user_id=$1', [user.id])).rows[0];
    if (existing) {
      if (existing.subject !== identity.subject) throw fail('identity_conflict');
      return user;
    }
    try {
      await db.query('INSERT INTO google_identities(subject,user_id,linked_email) VALUES($1,$2,$3)', [identity.subject, user.id, identity.email]);
    } catch (error) {
      if (error.code === '23505') throw fail('identity_conflict');
      throw error;
    }
    return user;
  });
}

function createGoogleAuth(pool, { auth, appOrigin, production = false, config, client: injectedClient } = {}) {
  const settings = googleConfig(config);
  const cookieName = production ? '__Host-ains_google_oauth' : 'ains_google_oauth';
  const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', path: '/' };
  const redirectUri = new URL(CALLBACK_PATH, appOrigin).href;
  const client = settings ? (injectedClient || createGoogleClient({ ...settings, redirectUri })) : null;
  const reject = (res, code) => {
    res.clearCookie(cookieName, cookieOptions);
    res.redirect(303, '/?auth_error=' + code);
  };
  const enabled = Boolean(client);
  async function start(req, res) {
    if (!enabled) return reject(res, 'unavailable');
    try {
      await auth.limit('google:start:' + sha256(req.ip || 'unknown'), 30);
      const state = random(), browser = random(), nonce = random(), verifier = random();
      const previous = cookies(req.headers.cookie)[cookieName];
      await transaction(pool, async db => {
        await db.query('DELETE FROM google_oauth_attempts WHERE expires_at<now()');
        if (NONCE_PATTERN.test(previous || '')) await db.query('DELETE FROM google_oauth_attempts WHERE browser_hash=$1', [sha256(previous)]);
        await db.query(`INSERT INTO google_oauth_attempts(state_hash,browser_hash,nonce_hash,code_verifier,expires_at)
          VALUES($1,$2,$3,$4,now()+interval '10 minutes')`, [sha256(state), sha256(browser), sha256(nonce), verifier]);
      });
      const url = client.authorizationUrl({ response_type: 'code', access_type: 'online', scope: ['openid', 'email', 'profile'],
        state, nonce, prompt: 'select_account', code_challenge_method: 'S256',
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });
      res.cookie(cookieName, browser, { ...cookieOptions, maxAge: 10 * 60 * 1000 });
      res.redirect(302, url);
    } catch { reject(res, 'failed'); }
  }
  async function callback(req, res) {
    if (!enabled) return reject(res, 'unavailable');
    try {
      await auth.limit('google:callback:' + sha256(req.ip || 'unknown'), 60);
      const state = req.query.state, browser = cookies(req.headers.cookie)[cookieName];
      if (typeof state !== 'string' || !NONCE_PATTERN.test(state) || !NONCE_PATTERN.test(browser || '')) throw fail('state_invalid');
      // Atomic consume happens before any network I/O. Failed exchanges cannot replay the attempt.
      const attempt = (await pool.query(`DELETE FROM google_oauth_attempts
        WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING nonce_hash,code_verifier`, [sha256(state), sha256(browser)])).rows[0];
      if (!attempt) throw fail('state_invalid');
      if (req.query.error !== undefined) throw fail(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
      const code = req.query.code;
      if (typeof code !== 'string' || !code || code.length > 4096) throw fail('failed');
      const idToken = await client.exchange({ code, codeVerifier: attempt.code_verifier });
      const identity = validateClaims(await client.verify(idToken), { clientId: settings.clientId, nonceHash: attempt.nonce_hash });
      await auth.limit('google:account:' + sha256(identity.subject), 15);
      const user = await resolveGoogleUser(pool, identity);
      await auth.issueSession(req, res, user);
      res.clearCookie(cookieName, cookieOptions);
      res.redirect(303, '/');
    } catch (error) {
      // Do not expose provider messages, authorization codes, tokens or email addresses.
      reject(res, ['state_invalid', 'cancelled', 'account_not_allowed', 'identity_conflict'].includes(error.authCode) ? error.authCode : 'failed');
    }
  }
  return { enabled, start, callback };
}

module.exports = { CALLBACK_PATH, googleConfig, createGoogleClient, validateClaims, resolveGoogleUser, createGoogleAuth };
