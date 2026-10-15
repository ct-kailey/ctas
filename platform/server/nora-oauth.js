'use strict';
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { transaction } = require('./db');
const { membership } = require('./context-ledger');
const vault = require('./integration-contract');

// Verified against Nora's public authorization-server and protected-resource
// metadata. Never derive endpoints, resource or redirect URI from request input.
const ORIGIN = 'https://platform.nora.my';
const RESOURCE = `${ORIGIN}/api/v1/mcp`;
const SCOPES = 'read build run';
const AUTHORIZE = `${ORIGIN}/api/v1/oauth/authorize`;
const TOKEN = `${ORIGIN}/api/v1/oauth/token`;
const REGISTER = `${ORIGIN}/api/v1/oauth/register`;
const hash = value => createHash('sha256').update(value).digest('hex');
function fail(code, message, status = 409) { throw Object.assign(new Error(message), { code, status, noSideEffects: true }); }
function redirect(value) {
  let url; try { url = new URL(value); } catch { fail('NORA_OAUTH_CONFIG_REQUIRED', '서버의 Nora OAuth 콜백 주소를 설정하세요.', 503); }
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) fail('NORA_OAUTH_CONFIG_REQUIRED', '서버의 Nora OAuth 콜백 주소를 확인하세요.', 503);
  return url.href;
}
function tokenString(value) { return typeof value === 'string' && value.length >= 1 && value.length <= 20000 && !/[\s\u0000-\u001f\u007f]/.test(value); }
function aad(projectId, workspaceId) { return `ains:nora:oauth:v1:${projectId}:${workspaceId}`; }
function normalizeTokens(value, previous = {}) {
  if (!value || !tokenString(value.access_token) || String(value.token_type || '').toLowerCase() !== 'bearer' || (value.refresh_token !== undefined && !tokenString(value.refresh_token))) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 응답을 확인하지 못했습니다.', 502);
  if (value.resource !== undefined && value.resource !== RESOURCE) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 대상이 요청한 서비스와 다릅니다.', 502);
  const scope = value.scope === undefined ? (previous.scope || SCOPES) : value.scope;
  if (typeof scope !== 'string' || !SCOPES.split(' ').every(s => scope.split(/\s+/).includes(s))) fail('NORA_OAUTH_SCOPE_REQUIRED', 'Nora 읽기·구성·실행 권한을 승인해 주세요.', 403);
  const expires = value.expires_in === undefined ? 300 : Number(value.expires_in);
  if (!Number.isSafeInteger(expires) || expires < 1 || expires > 366 * 86400) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 만료 시간을 확인하지 못했습니다.', 502);
  return { access_token: value.access_token, refresh_token: value.refresh_token || previous.refresh_token, client_id: previous.client_id, scope: SCOPES, expires_in: expires };
}
async function boundedJson(response, max = 65536) {
  if (!response.body) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 응답이 비어 있습니다.', 502);
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 응답을 확인하지 못했습니다.', 502); chunks.push(Buffer.from(value)); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 인증 응답을 확인하지 못했습니다.', 502); }
  } finally { await reader.cancel().catch(() => {}); }
}
function createNoraOAuth({ pool, encryptionKey = process.env.AINS_CREDENTIAL_ENCRYPTION_KEY || process.env.INTEGRATION_ENCRYPTION_KEY, redirectUri = process.env.NORA_OAUTH_REDIRECT_URI, fetchImpl = fetch, timeoutMs = 15000, now = () => Date.now() }) {
  let configurationError = null, callbackUri;
  try { vault.key(encryptionKey); callbackUri = redirect(redirectUri); } catch (error) { configurationError = error.code === 'INTEGRATION_KEY_UNAVAILABLE' ? 'NORA_VAULT_UNAVAILABLE' : 'NORA_OAUTH_CONFIG_REQUIRED'; }
  function configured() { if (configurationError) fail(configurationError, '서버의 Nora OAuth 주소와 암호화 설정이 필요합니다.', 503); }
  function seal(value, context) { configured(); return vault.seal(value, context, encryptionKey); }
  function unseal(value, context) { try { configured(); return vault.unseal(value, context, encryptionKey); } catch { fail('NORA_AUTH_REQUIRED', 'Nora 연결을 다시 승인해 주세요.', 401); } }
  async function binding(db, p, u, lock = false) {
    if (u) await membership(db, p, u, ['owner']);
    if (u && lock && (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE',[p,u])).rows[0]?.role !== 'owner') fail('FORBIDDEN','프로젝트 관리자만 Nora 연결을 변경할 수 있습니다.',403);
    const row = (await db.query(`SELECT * FROM project_nora_workspaces WHERE project_id=$1${lock ? ' FOR UPDATE' : ''}`, [p])).rows[0];
    if (!row) fail('NORA_WORKSPACE_REQUIRED', 'Nora 워크스페이스 ID를 먼저 등록하세요.');
    return row;
  }
  async function post(url, data, signal, json = false) {
    let response;
    try { response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded' }, body: json ? JSON.stringify(data) : new URLSearchParams(data).toString() }); }
    catch { fail('NORA_OAUTH_UNAVAILABLE', 'Nora 인증 서버에 연결하지 못했습니다. 연결을 다시 시작해 주세요.', 502); }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); fail(response.status === 400 || response.status === 401 || response.status === 403 ? 'NORA_AUTH_REQUIRED' : 'NORA_OAUTH_UNAVAILABLE', 'Nora 연결을 다시 승인해 주세요.', response.status >= 500 ? 502 : 401); }
    return boundedJson(response);
  }
  async function invalidateAccessToken({projectId,workspaceId,accessToken}) {
    if (!tokenString(accessToken)) return;
    await transaction(pool,async db=>{
      const row=(await db.query('SELECT * FROM project_nora_oauth WHERE project_id=$1 AND workspace_id=$2 FOR UPDATE',[projectId,workspaceId])).rows[0];
      if (!row?.secret_ciphertext) return;
      const saved=unseal(row.secret_ciphertext,aad(projectId,workspaceId));
      // A rejection of an older in-flight request must not erase a newer grant.
      if (saved.access_token !== accessToken) return;
      await db.query('UPDATE project_nora_oauth SET secret_ciphertext=NULL,expires_at=NULL,version=version+1,updated_at=now() WHERE project_id=$1 AND workspace_id=$2',[projectId,workspaceId]);
    });
  }
  return {
    invalidateAccessToken,
    async status(p, u) {
      const member = await membership(pool, p, u);
      const row = (await pool.query("SELECT w.workspace_id,o.secret_ciphertext,o.expires_at,EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=w.project_id AND m.user_id=o.authorized_by AND m.role='owner') AS authorized FROM project_nora_workspaces w LEFT JOIN project_nora_oauth o ON o.project_id=w.project_id AND o.workspace_id=w.workspace_id WHERE w.project_id=$1", [p])).rows[0];
      let connected = false;
      if (row?.secret_ciphertext && row.authorized && !configurationError) { try { const saved = unseal(row.secret_ciphertext, aad(p,row.workspace_id)); connected = tokenString(saved.access_token) && (new Date(row.expires_at).getTime() > now() || tokenString(saved.refresh_token)); } catch {} }
      return { connected, can_connect: Boolean(!configurationError && row && member === 'owner'), workspace_id: row?.workspace_id || null, expires_at: row?.expires_at || null, error_code: configurationError || (!row ? 'NORA_WORKSPACE_REQUIRED' : !connected ? 'NORA_AUTH_REQUIRED' : null) };
    },
    async start(p, u) {
      configured(); const before = await binding(pool, p, u);
      const attempts=Number((await pool.query("SELECT count(*) AS n FROM project_nora_oauth_states WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",[u])).rows[0].n);
      if(attempts>=20)fail('NORA_OAUTH_RATE_LIMIT','Nora 연결 요청이 많습니다. 잠시 후 다시 시도하세요.',429);
      const registration = await post(REGISTER, { client_name: 'AINS Project Nora', redirect_uris: [callbackUri], grant_types: ['authorization_code','refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPES }, null, true);
      if (!tokenString(registration.client_id) || (registration.token_endpoint_auth_method && registration.token_endpoint_auth_method !== 'none') || (registration.redirect_uris && (!Array.isArray(registration.redirect_uris) || !registration.redirect_uris.includes(callbackUri)))) fail('NORA_OAUTH_RESPONSE_INVALID', 'Nora 클라이언트 등록 결과를 확인하지 못했습니다.', 502);
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url'), stateHash = hash(state), attempt = randomUUID(), expires = new Date(now() + 10 * 60000);
      await transaction(pool, async db => {
        const current = await binding(db, p, u, true);
        if (current.workspace_id !== before.workspace_id) fail('NORA_WORKSPACE_SCOPE_MISMATCH', 'Nora 워크스페이스 연결이 변경되었습니다.');
        await db.query(`INSERT INTO project_nora_oauth(project_id,workspace_id,attempt_id) VALUES($1,$2,$3)
          ON CONFLICT(project_id) DO UPDATE SET attempt_id=excluded.attempt_id,version=project_nora_oauth.version+1,updated_at=now()`, [p,current.workspace_id,attempt]);
        await db.query('UPDATE project_nora_oauth_states SET consumed_at=now() WHERE project_id=$1 AND consumed_at IS NULL', [p]);
        await db.query(`INSERT INTO project_nora_oauth_states(state_hash,project_id,workspace_id,owner_id,attempt_id,verifier_ciphertext,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, [stateHash,p,current.workspace_id,u,attempt,seal({ verifier, client_id: registration.client_id, redirect_uri: callbackUri }, `${aad(p,current.workspace_id)}:state:${u}:${stateHash}`),expires]);
      });
      const url = new URL(AUTHORIZE);
      url.search = new URLSearchParams({ response_type: 'code', client_id: registration.client_id, redirect_uri: callbackUri, scope: SCOPES, resource: RESOURCE, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
      return { url: url.href, expires_at: expires.toISOString() };
    },
    async callback(u, input) {
      configured();
      if (!input || typeof input.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) fail('NORA_OAUTH_STATE_INVALID', 'Nora 연결 요청이 만료되었거나 유효하지 않습니다.', 400);
      const stateHash = hash(input.state);
      // Commit consumption before exchanging the authorization code. A timeout
      // cannot replay this state or send the same single-use code twice.
      const state = await transaction(pool, async db => {
        const initial = (await db.query('SELECT * FROM project_nora_oauth_states WHERE state_hash=$1', [stateHash])).rows[0];
        if (!initial || initial.owner_id !== u) fail('NORA_OAUTH_STATE_INVALID', 'Nora 연결 요청이 만료되었거나 유효하지 않습니다.', 400);
        const bound = await binding(db, initial.project_id, u, true);
        const row = (await db.query('SELECT * FROM project_nora_oauth_states WHERE state_hash=$1 FOR UPDATE', [stateHash])).rows[0];
        if (!row || row.owner_id !== u || row.consumed_at || new Date(row.expires_at).getTime() <= now()) fail('NORA_OAUTH_STATE_INVALID', 'Nora 연결 요청이 만료되었거나 유효하지 않습니다.', 400);
        const grant = (await db.query('SELECT attempt_id FROM project_nora_oauth WHERE project_id=$1', [row.project_id])).rows[0];
        if (bound.workspace_id !== row.workspace_id || grant?.attempt_id !== row.attempt_id) fail('NORA_OAUTH_STATE_INVALID', '새 Nora 연결 요청에서 다시 진행해 주세요.', 400);
        await db.query('UPDATE project_nora_oauth_states SET consumed_at=now() WHERE state_hash=$1', [stateHash]);
        return row;
      });
      if (input.error) fail('NORA_OAUTH_DENIED', 'Nora 연결 승인이 완료되지 않았습니다.', 400);
      if (!tokenString(input.code)) fail('NORA_OAUTH_CODE_INVALID', 'Nora 인증 코드를 확인하지 못했습니다.', 400);
      const pending = unseal(state.verifier_ciphertext, `${aad(state.project_id,state.workspace_id)}:state:${u}:${stateHash}`);
      if (pending.redirect_uri !== callbackUri) fail('NORA_OAUTH_STATE_INVALID', '서버의 콜백 설정이 변경되었습니다. 연결을 다시 시작하세요.', 400);
      const result = normalizeTokens(await post(TOKEN, { grant_type: 'authorization_code', client_id: pending.client_id, code: input.code, code_verifier: pending.verifier, redirect_uri: callbackUri, resource: RESOURCE }), { client_id: pending.client_id, scope: SCOPES });
      await transaction(pool, async db => {
        const bound = await binding(db, state.project_id, u, true);
        if (bound.workspace_id !== state.workspace_id) fail('NORA_WORKSPACE_SCOPE_MISMATCH', 'Nora 연결 대상을 다시 확인하세요.');
        const saved = await db.query(`UPDATE project_nora_oauth SET secret_ciphertext=$3,expires_at=$4,scope=$5,authorized_by=$6,authorized_at=now(),version=version+1,updated_at=now()
          WHERE project_id=$1 AND attempt_id=$2`, [state.project_id,state.attempt_id,seal(result,aad(state.project_id,state.workspace_id)),new Date(now()+result.expires_in*1000),SCOPES,u]);
        if (!saved.rowCount) fail('NORA_OAUTH_STATE_INVALID', '새 Nora 연결 요청에서 다시 진행해 주세요.', 400);
        // Never erase an uncertain write: it still requires read-only reconciliation.
        await db.query(`UPDATE project_nora_workspaces SET status='pending',stage='queued',operation='verify',error_code=NULL,version=version+1,updated_at=now()
          WHERE project_id=$1 AND status IN ('pending','failed','awaiting_auth','awaiting_service')`, [state.project_id]);
        await db.query("UPDATE project_nora_context_outbox SET status='pending',error_code=NULL WHERE project_id=$1 AND status='awaiting_auth'", [state.project_id]);
        await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'nora.oauth_connected',$1,$3)", [state.project_id,u,JSON.stringify({workspace_id:state.workspace_id})]);
      });
      return { project_id: state.project_id, workspace_id: state.workspace_id, connected: true };
    },
    async getAccessToken({ projectId, workspaceId, signal }) {
      configured();
      let observedToken;
      try { return await transaction(pool, async db => {
        const bound = await binding(db, projectId);
        if (bound.workspace_id !== workspaceId) fail('NORA_WORKSPACE_SCOPE_MISMATCH', '프로젝트에 등록된 Nora 워크스페이스만 사용할 수 있습니다.', 403);
        const row = (await db.query('SELECT * FROM project_nora_oauth WHERE project_id=$1 AND workspace_id=$2 FOR UPDATE', [projectId,workspaceId])).rows[0];
        if (!row?.secret_ciphertext) fail('NORA_AUTH_REQUIRED', '프로젝트 관리자가 Nora 연결을 승인해 주세요.', 401);
        const authorizer=(await db.query("SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2",[projectId,row.authorized_by])).rows[0];
        if(authorizer?.role!=='owner')fail('NORA_AUTH_REQUIRED','현재 프로젝트 관리자가 Nora 연결을 다시 승인해 주세요.',401);
        const previous = unseal(row.secret_ciphertext,aad(projectId,workspaceId));
        if (!tokenString(previous.access_token)) fail('NORA_AUTH_REQUIRED', 'Nora 연결을 다시 승인해 주세요.', 401);
        observedToken=previous.access_token;
        if (new Date(row.expires_at).getTime() > now()+60000) return previous.access_token;
        if (!tokenString(previous.refresh_token) || !tokenString(previous.client_id)) fail('NORA_AUTH_REQUIRED', 'Nora 연결을 다시 승인해 주세요.', 401);
        // Row locking serializes rotating refresh tokens across workers/processes.
        const result = normalizeTokens(await post(TOKEN,{grant_type:'refresh_token',client_id:previous.client_id,refresh_token:previous.refresh_token,resource:RESOURCE},signal),previous);
        await db.query('UPDATE project_nora_oauth SET secret_ciphertext=$3,expires_at=$4,version=version+1,updated_at=now() WHERE project_id=$1 AND workspace_id=$2', [projectId,workspaceId,seal(result,aad(projectId,workspaceId)),new Date(now()+result.expires_in*1000)]);
        return result.access_token;
      }); } catch(error) {
        if(error.code==='NORA_AUTH_REQUIRED' && observedToken) await invalidateAccessToken({projectId,workspaceId,accessToken:observedToken}).catch(()=>{});
        throw error;
      }
    },
  };
}
module.exports = { createNoraOAuth, ORIGIN, RESOURCE, SCOPES, AUTHORIZE, normalizeTokens, redirect, boundedJson };
