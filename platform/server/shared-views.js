'use strict';
const { randomBytes, randomUUID } = require('node:crypto');
const { error, sha256, cookies } = require('./auth');
const { transaction } = require('./db');

const SHARED_COOKIE = 'ains_shared_session';
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID = '[^/]+';
// Explicit allowlist: adding a new GET never accidentally publishes it. Several
// existing GETs invoke models, save digests, expose credentials, or download files.
const READ_PATHS = [
  /^\/journey\/?$/,
  /^\/journey\/events\/?$/,
  new RegExp(`^/journey/events/${ID}/${ID}/?$`),
  new RegExp(`^/journey/sources/${ID}/${ID}/?$`),
  /^\/implementation-notes\/?$/,
  new RegExp(`^/implementation-notes/${ID}/?$`),
  /^\/task-drafts\/?$/,
  new RegExp(`^/task-drafts/${ID}/?$`),
  /^\/task-automation\/?$/,
  new RegExp(`^/task-automation/tasks/${ID}/?$`),
  /^\/(?:overview|dashboard|attention|settings|members|domains|documents|feed|work-items|implementation-plans|implementation-requests|channel-sources|channel-inbox|context|commercial|questions|question-reminders|work-governance|github-deliveries|transcriptions)\/?$/,
  new RegExp(`^/(?:revisions|reviews|work-items|implementation-plans|implementation-requests|channel-inbox|questions|github-deliveries|transcriptions)/${ID}/?$`),
  /^\/context\/(?:sources|search|timeline|insights|ai-runs)\/?$/,
  new RegExp(`^/context/(?:records|candidates|ai-runs)/${ID}/?$`),
  new RegExp(`^/context/sources/${ID}/${ID}/?$`),
  new RegExp(`^/channel-inbox/${ID}/workflow/?$`),
  /^\/commercial\/template-library\/?$/,
  new RegExp(`^/commercial/(?:documents|rewrites)/${ID}/?$`),
  /^\/work-ai\/runs\/?$/,
  new RegExp(`^/work-ai/runs/${ID}/?$`),
  new RegExp(`^/work-governance/(?:preflights|validations|classifications|trace)/${ID}/?$`),
];
const INVALID = () => error('SHARED_VIEW_UNAVAILABLE', '공유 링크가 만료되었거나 종료되었습니다. 새 공유 링크를 요청하세요.', 401);
function object(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !keys.includes(k))) throw error('INVALID_SHARED_VIEW', '공유 설정 형식을 확인하세요.');
}
function hasSharedCookie(req) { return Object.hasOwn(cookies(req.headers.cookie), SHARED_COOKIE); }
function metadata(row) {
  return { link_id: row.id, label: row.label, expires_at: row.expires_at, source_user_id: row.source_user_id, source_user_name: row.source_user_name, project_ids: row.project_ids };
}
function publicLink(row) {
  return { id: row.id, label: row.label, project_ids: row.project_ids, source_user_id: row.source_user_id, source_user_name: row.source_user_name, created_at: row.created_at, expires_at: row.expires_at, revoked_at: row.revoked_at, active: !row.revoked_at && new Date(row.expires_at) > new Date() && row.authorized !== false };
}
const OWNED = `NOT EXISTS (SELECT 1 FROM unnest(v.project_ids) p(id) WHERE NOT EXISTS
  (SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.user_id=$1 AND m.role='owner'))`;
const AUTHORIZED = `NOT EXISTS (SELECT 1 FROM unnest(v.project_ids) p(id) WHERE
  NOT EXISTS (SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.user_id=v.creator_id AND m.role='owner') OR
  NOT EXISTS (SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.user_id=v.source_user_id) OR
  NOT EXISTS (SELECT 1 FROM memberships m WHERE m.project_id=p.id AND m.user_id=v.viewer_user_id AND m.role='viewer'))
  AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=v.viewer_user_id AND NOT (m.project_id=ANY(v.project_ids)))`;

// Project content is intentionally visible. Account email metadata, credential
// internals and downloadable code patches are not part of anonymous projection.
function projectSharedJSON(value) {
  if (Array.isArray(value)) return value.map(projectSharedJSON);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (['email', 'token_hash', 'csrf_token', 'secret_envelope', 'runner_token_hash', 'lease_token', 'access_token', 'api_key', 'patch', 'diff'].includes(key)) continue;
    out[key] = projectSharedJSON(item);
  }
  return out;
}

function createSharedViews(pool, { appOrigin, production = false } = {}) {
  const origin = new URL(appOrigin).origin;
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' };
  async function normalUser(db, id) {
    if (typeof id !== 'string' || !UUID.test(id)) throw error('INVALID_SHARED_USER', '공유할 계정을 확인하세요.');
    const user = (await db.query('SELECT id,name FROM users WHERE id=$1 AND NOT is_shared_view', [id])).rows[0];
    if (!user) throw error('INVALID_SHARED_USER', '공유할 계정을 확인하세요.');
    return user;
  }
  async function exit(req, res) {
    const token = cookies(req.headers.cookie)[SHARED_COOKIE];
    if (typeof token === 'string' && TOKEN.test(token)) await pool.query('DELETE FROM shared_view_sessions WHERE token_hash=$1', [sha256(token)]);
    res.clearCookie(SHARED_COOKIE, cookieOptions);
  }
  return {
    hasCookie: hasSharedCookie,
    exit,
    markUnavailable(res) {
      // A failed exchange is still an explicit switch into shared mode. Keep
      // refreshes from exposing a pre-existing private login until explicit exit.
      res.cookie(SHARED_COOKIE, randomBytes(32).toString('hex'), { ...cookieOptions, maxAge: 30 * 86400000 });
    },
    async create(actor, body) {
      object(body, ['project_ids', 'label', 'expires_in_hours', 'source_user_id']);
      const ids = body.project_ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(p => typeof p !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(p)) || new Set(ids).size !== ids.length) throw error('INVALID_SHARED_PROJECTS', '공유할 프로젝트를 1~50개 선택하세요.');
      const projects = [...ids].sort();
      const label = typeof body.label === 'string' ? body.label.trim() : '';
      if (!label || label.length > 120) throw error('INVALID_SHARED_LABEL', '공유 이름을 1~120자로 입력하세요.');
      const hours = body.expires_in_hours ?? 24;
      if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw error('INVALID_SHARED_EXPIRY', '공유 기간은 1시간~7일로 설정하세요.');
      return transaction(pool, async db => {
        await normalUser(db, actor);
        const source = await normalUser(db, body.source_user_id || actor);
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-shares:'||$1,0))", [actor]);
        for (const project of projects) {
          await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-members:'||$1,0))", [project]);
          const members = (await db.query('SELECT user_id,role FROM memberships WHERE project_id=$1 AND user_id=ANY($2::uuid[]) FOR SHARE', [project, [actor, source.id]])).rows;
          if (!members.some(m => m.user_id === actor && m.role === 'owner') || !members.some(m => m.user_id === source.id)) throw error('SHARED_PROJECT_FORBIDDEN', '본인이 관리하고 공유 대상 계정이 참여 중인 프로젝트만 공유할 수 있습니다.', 403);
        }
        const count = Number((await db.query('SELECT count(*) AS n FROM shared_views WHERE creator_id=$1 AND revoked_at IS NULL AND expires_at>now()', [actor])).rows[0].n);
        if (count >= 20) throw error('SHARED_VIEW_LIMIT', '활성 공유 링크는 계정당 최대 20개입니다. 기존 링크를 종료하세요.', 409);
        const token = randomBytes(32).toString('hex'), viewerId = randomUUID();
        await db.query("INSERT INTO users(id,email,name,password_hash,is_shared_view) VALUES($1,$2,'공유 열람','disabled:shared-view',true)", [viewerId, viewerId + '@shared.invalid']);
        const row = (await db.query('INSERT INTO shared_views(token_hash,creator_id,source_user_id,viewer_user_id,project_ids,label,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+$7::int*interval \'1 hour\') RETURNING *', [sha256(token), actor, source.id, viewerId, projects, label, hours])).rows[0];
        for (const project of projects) {
          await db.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')", [project, viewerId]);
          await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'shared_view.created',$3,$4)", [project, actor, row.id, { label, expires_at: row.expires_at, source_user_id: source.id }]);
        }
        return { link: publicLink({ ...row, source_user_name: source.name }), share_url: origin + '/#share=' + token };
      });
    },
    async list(actor) {
      const rows = (await pool.query(`SELECT v.*,u.name AS source_user_name,(${AUTHORIZED}) AS authorized FROM shared_views v JOIN users u ON u.id=v.source_user_id WHERE ${OWNED} ORDER BY v.created_at DESC LIMIT 100`, [actor])).rows;
      return { links: rows.map(publicLink) };
    },
    async revoke(actor, id) {
      if (!UUID.test(id)) throw error('NOT_FOUND', '공유 링크를 찾을 수 없습니다.', 404);
      return transaction(pool, async db => {
        const row = (await db.query(`SELECT v.* FROM shared_views v WHERE v.id=$2 AND ${OWNED} FOR UPDATE`, [actor, id])).rows[0];
        if (!row) throw error('NOT_FOUND', '공유 링크를 찾을 수 없습니다.', 404);
        if (!row.revoked_at) {
          await db.query('UPDATE shared_views SET revoked_at=now() WHERE id=$1', [id]);
          await db.query('DELETE FROM shared_view_sessions WHERE shared_view_id=$1', [id]);
          for (const project of row.project_ids) await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'shared_view.revoked',$3,'{}')", [project, actor, id]);
        }
        return { revoked: true };
      });
    },
    async exchange(req, res, auth) {
      if (!req.is('application/json')) throw error('JSON_REQUIRED', 'JSON 요청이 필요합니다.', 415);
      await auth.limit('shared-ip:' + sha256(req.ip || 'unknown'), 50);
      object(req.body, ['token']);
      const token = req.body.token;
      if (typeof token !== 'string' || !TOKEN.test(token)) throw INVALID();
      const row = (await pool.query(`SELECT v.*,u.name AS source_user_name FROM shared_views v JOIN users u ON u.id=v.source_user_id JOIN users viewer ON viewer.id=v.viewer_user_id AND viewer.is_shared_view WHERE v.token_hash=$1 AND v.revoked_at IS NULL AND v.expires_at>now() AND ${AUTHORIZED}`, [sha256(token)])).rows[0];
      if (!row) throw INVALID();
      const sessionToken = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex');
      await pool.query('INSERT INTO shared_view_sessions(token_hash,shared_view_id,csrf_token,expires_at) VALUES($1,$2,$3,$4)', [sha256(sessionToken), row.id, csrfToken, row.expires_at]);
      const old = cookies(req.headers.cookie)[SHARED_COOKIE];
      if (typeof old === 'string' && TOKEN.test(old)) await pool.query('DELETE FROM shared_view_sessions WHERE token_hash=$1', [sha256(old)]);
      // Keep the selector beyond link expiry. Removing it on expiry would expose
      // an underlying normal login without an explicit exit from shared mode.
      // Authorization still expires at the link's absolute database deadline.
      res.cookie(SHARED_COOKIE, sessionToken, { ...cookieOptions, maxAge: 30 * 86400000 });
      return { user: { id: row.viewer_user_id, name: '공유 열람', email: null }, csrfToken, shared_view: metadata(row) };
    },
    async authenticate(req) {
      const token = cookies(req.headers.cookie)[SHARED_COOKIE];
      if (typeof token !== 'string' || !TOKEN.test(token)) throw INVALID();
      const row = (await pool.query(`SELECT v.*,u.name AS source_user_name,s.token_hash AS session_hash,s.csrf_token FROM shared_view_sessions s JOIN shared_views v ON v.id=s.shared_view_id JOIN users u ON u.id=v.source_user_id JOIN users viewer ON viewer.id=v.viewer_user_id AND viewer.is_shared_view WHERE s.token_hash=$1 AND s.expires_at>now() AND v.expires_at>now() AND v.revoked_at IS NULL AND ${AUTHORIZED}`, [sha256(token)])).rows[0];
      if (!row) throw INVALID();
      req.user = { id: row.viewer_user_id, name: '공유 열람', email: null };
      req.session = { tokenHash: row.session_hash, csrfToken: row.csrf_token };
      req.sharedView = metadata(row);
    },
    // Apply before bearer webhook/runner routes too. A shared browser never
    // acquires write access just because a route sits before normal auth.
    earlyGuard(req, _res, next) {
      if (!hasSharedCookie(req) || ['GET', 'HEAD', 'OPTIONS'].includes(req.method) || /^\/auth\/(?:login|logout|shared-view(?:\/exit)?)\/?$/.test(req.path)) return next();
      return next(error('SHARED_VIEW_READ_ONLY', '공유 화면에서는 조회만 할 수 있습니다.', 403));
    },
    guard(req, res, next) {
      if (!req.sharedView) return next();
      if (req.method === 'POST' && /^\/auth\/logout\/?$/.test(req.path)) return next();
      if (!['GET', 'HEAD'].includes(req.method)) return next(error('SHARED_VIEW_READ_ONLY', '공유 화면에서는 조회만 할 수 있습니다.', 403));
      if (/^\/(?:session|projects)\/?$/.test(req.path)) return next();
      const match = req.path.match(/^\/projects\/([^/]+)(\/.*)$/);
      let project;
      try { project = match && decodeURIComponent(match[1]); } catch { return next(error('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404)); }
      if (!match || !req.sharedView.project_ids.includes(project)) return next(error('NOT_FOUND', '공유된 프로젝트를 찾을 수 없습니다.', 404));
      if (!READ_PATHS.some(pattern => pattern.test(match[2]))) return next(error('SHARED_VIEW_RESTRICTED', '이 기능은 공유 화면에서 제공하지 않습니다.', 403));
      const json = res.json.bind(res);
      res.json = value => json(projectSharedJSON(value));
      next();
    },
  };
}
module.exports = { createSharedViews, SHARED_COOKIE, READ_PATHS, projectSharedJSON };
