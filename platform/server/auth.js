'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { transaction } = require('./db');
const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'ains_session';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
function error(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw error('INVALID_EMAIL', '이메일 주소를 확인해 주세요.');
  return value.trim().toLowerCase();
}
async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw error('PASSWORD_POLICY', '비밀번호는 12~1,024자로 설정해 주세요.');
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$32768$8$1$${salt}$${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 1024 || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '32768' || parts[2] !== '8' || parts[3] !== '1' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{128}$/.test(parts[5])) return false;
  const actual = await scrypt(password, parts[4], 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, Buffer.from(parts[5], 'hex'));
}
function cookies(header) {
  const result = {};
  for (const part of (header || '').split(';')) {
    const equal = part.indexOf('=');
    if (equal > 0) result[part.slice(0, equal).trim()] = part.slice(equal + 1).trim();
  }
  return result;
}
function constantEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function createAuth(pool, { appOrigin, production = false, sessionHours = 8, sharedViews } = {}) {
  const origin = new URL(appOrigin).origin;
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' };
  const dummy = 'scrypt$32768$8$1$' + '0'.repeat(32) + '$' + '0'.repeat(128);
  async function authenticate(req, _res, next) {
    try {
      if (sharedViews?.hasCookie(req)) { await sharedViews.authenticate(req); return next(); }
      const token = cookies(req.headers.cookie)[SESSION_COOKIE];
      if (!token || !/^[a-f0-9]{64}$/.test(token)) throw error('UNAUTHENTICATED', '로그인이 필요합니다.', 401);
      const { rows } = await pool.query(`SELECT s.token_hash,s.csrf_token,u.id,u.email,u.name
        FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.is_shared_view`, [sha256(token)]);
      if (!rows[0]) throw error('UNAUTHENTICATED', '로그인이 만료되었습니다.', 401);
      req.user = { id: rows[0].id, email: rows[0].email, name: rows[0].name };
      req.session = { tokenHash: rows[0].token_hash, csrfToken: rows[0].csrf_token };
      next();
    } catch (e) { next(e); }
  }
  function checkOrigin(req, _res, next) {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const allowed = new Set([origin]);
    if (!production) { allowed.add('http://127.0.0.1:5173'); allowed.add('http://localhost:5173'); }
    if (!allowed.has(req.headers.origin)) return next(error('ORIGIN_REJECTED', '허용되지 않은 요청 출처입니다.', 403));
    next();
  }
  function csrf(req, _res, next) {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if (!constantEquals(req.headers['x-csrf-token'], req.session?.csrfToken)) return next(error('CSRF_REJECTED', '화면을 새로 고친 후 다시 시도해 주세요.', 403));
    next();
  }
  async function limit(bucket, max) {
    const { rows } = await pool.query(`INSERT INTO auth_attempts(bucket,count,expires_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_attempts.expires_at<now() THEN 1 ELSE auth_attempts.count+1 END,
      expires_at=CASE WHEN auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END RETURNING count`, [bucket]);
    if (rows[0].count > max) throw error('RATE_LIMITED', '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.', 429);
  }
  async function login(req, res) {
    if (!req.is('application/json')) throw error('JSON_REQUIRED', 'JSON 요청이 필요합니다.', 415);
    await limit('ip:' + sha256(req.ip || 'unknown'), 50);
    const email = emailAddress(req.body?.email);
    await limit('account:' + sha256(email), 15);
    const { rows } = await pool.query('SELECT id,email,name,password_hash FROM users WHERE email=$1 AND NOT is_shared_view', [email]);
    const valid = await verifyPassword(req.body?.password, rows[0]?.password_hash || dummy);
    if (!valid || !rows[0]) throw error('INVALID_LOGIN', '이메일 또는 비밀번호를 확인해 주세요.', 401);
    await pool.query('DELETE FROM auth_attempts WHERE bucket=$1 OR expires_at<now()', ['account:' + sha256(email)]);
    const session = await issueSession(req, res, rows[0]);
    res.json(session);
  }
  async function issueSession(req, res, user) {
    if (!(await pool.query('SELECT 1 FROM users WHERE id=$1 AND NOT is_shared_view', [user.id])).rowCount) throw error('INVALID_LOGIN', '이 계정으로 로그인할 수 없습니다.', 401);
    const token = crypto.randomBytes(32).toString('hex'), csrfToken = crypto.randomBytes(32).toString('hex');
    const old = cookies(req.headers.cookie)[SESSION_COOKIE];
    await transaction(pool, async db => {
      await db.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+$4::int*interval \'1 hour\')', [sha256(token), user.id, csrfToken, sessionHours]);
      if (old && /^[a-f0-9]{64}$/.test(old)) await db.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(old)]);
    });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: sessionHours * 60 * 60 * 1000 });
    if (sharedViews?.hasCookie(req)) await sharedViews.exit(req, res);
    return { user: { id: user.id, email: user.email, name: user.name }, csrfToken };
  }
  async function logout(req, res) {
    if (req.sharedView) { await sharedViews.exit(req, res); return res.json({ ok: true }); }
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [req.session.tokenHash]);
    res.clearCookie(SESSION_COOKIE, cookieOptions).json({ ok: true });
  }
  return { authenticate, checkOrigin, csrf, login, logout, issueSession, limit };
}
async function provisionUser(pool, { email, name, password, projectId, role = 'member' }) {
  email = emailAddress(email);
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw error('INVALID_NAME', '이름은 1~100자입니다.');
  if (!['owner','reviewer','member','viewer'].includes(role)) throw error('INVALID_ROLE', '알 수 없는 역할입니다.');
  const hash = await hashPassword(password), client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,email,name', [crypto.randomUUID(), email, name.trim(), hash]);
    if (projectId) await client.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)', [projectId, rows[0].id, role]);
    await client.query('COMMIT');
    return rows[0];
  } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') throw error('USER_EXISTS', '이미 등록된 이메일입니다.', 409); throw e; }
  finally { client.release(); }
}
module.exports = { createAuth, hashPassword, verifyPassword, provisionUser, SESSION_COOKIE, sha256, error, cookies, constantEquals, emailAddress };
