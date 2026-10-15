'use strict';
const { transaction } = require('./db');
const { membership } = require('./context-ledger');

const WORKSPACE_ID = /^t_[A-Za-z0-9_-]{8,128}$/;
const REMOTE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;
function fail(code, message, status = 409) { throw Object.assign(new Error(message), { code, status }); }
function workspaceId(value) {
  if (typeof value !== 'string' || !WORKSPACE_ID.test(value)) fail('NORA_WORKSPACE_ID_INVALID', 'Nora 워크스페이스 ID를 확인하세요.', 400);
  return value;
}
function remoteId(value) { return typeof value === 'string' && REMOTE_ID.test(value); }
function body(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('NORA_INPUT_INVALID', 'Nora 연결 요청을 확인하세요.', 400);
}
function expectedVersion(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('NORA_VERSION_REQUIRED', '현재 Nora 연결 버전이 필요합니다.', 400);
}
function safeError(error, fallback = 'NORA_SERVICE_FAILED') { return /^NORA_[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : fallback; }
async function binding(db, p, lock = false) {
  return (await db.query(`SELECT * FROM project_nora_workspaces WHERE project_id=$1${lock ? ' FOR UPDATE' : ''}`, [p])).rows[0] || null;
}
async function owner(db, p, u) {
  const row = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE', [p, u])).rows[0];
  if (row?.role !== 'owner') fail('FORBIDDEN', '프로젝트 관리자만 Nora 연결을 변경할 수 있습니다.', 403);
}
async function audit(db, p, u, kind, detail = {}) {
  await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$1,$4)', [p, u, 'nora.' + kind, JSON.stringify(detail)]);
}
async function lockProjectDispatch(db, p) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-nora-dispatch:' || $1,0))", [p]);
}
// A selected workspace never falls back to publications or credentials in the
// shared legacy workspace. Deployment of project-specific flows is separate.
async function assertLegacyNoraDispatch(db, p, { lock = false } = {}) {
  if (lock) await lockProjectDispatch(db, p);
  if ((await db.query('SELECT 1 FROM project_nora_workspaces WHERE project_id=$1', [p])).rowCount) {
    fail('NORA_PROJECT_FLOW_SETUP_REQUIRED', '이 프로젝트의 Nora 워크스페이스에 분석 흐름을 연결해야 합니다. 프로젝트 설정에서 Nora 연결을 확인하세요.');
  }
}
async function assertNoActiveLegacyRuns(db, p) {
  const result = await db.query(`SELECT EXISTS (
    SELECT 1 FROM jobs WHERE project_id=$1 AND status IN ('queued','running','uncertain')
    UNION ALL SELECT 1 FROM registration_requests WHERE project_id=$1 AND status IN ('running','uncertain')
    UNION ALL SELECT 1 FROM channel_inbox WHERE project_id=$1 AND status IN ('queued','running','uncertain')
    UNION ALL SELECT 1 FROM implementation_plans WHERE project_id=$1 AND status IN ('queued','running','uncertain')
    UNION ALL SELECT 1 FROM implementation_requests WHERE project_id=$1 AND status IN ('awaiting_runner','running','uncertain')
    UNION ALL SELECT 1 FROM commercial_rewrites WHERE project_id=$1 AND status IN ('queued','running','uncertain')
    UNION ALL SELECT 1 FROM context_ai_runs WHERE project_id=$1 AND status IN ('queued','running','waiting_approval','finalizing','uncertain')
    UNION ALL SELECT 1 FROM work_ai_runs WHERE project_id=$1 AND status IN ('queued','running','waiting_approval','finalizing','uncertain')
    UNION ALL SELECT 1 FROM github_deliveries WHERE project_id=$1 AND status IN ('publishing','uncertain')
  ) AS active`, [p]);
  if (result.rows[0].active) fail('NORA_LEGACY_RUNS_ACTIVE', '기존 분석·실행과 결과가 불확실한 요청을 먼저 완료하거나 확인한 뒤 Nora 워크스페이스를 등록하세요.');
}
function capabilities(provider) {
  return { verify: typeof provider.inspectWorkspace === 'function', context_space: typeof provider.ensureContextSpace === 'function', connectors: typeof provider.listConnectors === 'function', context_sync: typeof provider.syncContext === 'function' };
}
function publicBinding(row, provider = {}, sync = {}) {
  return { mode: row ? 'nora' : 'legacy', status: row?.status || 'legacy', version: Number(row?.version || 0), workspace_id: row?.workspace_id || null,
    space_id: row?.space_id || null, connector_id: row?.connector_id || null, error_code: row?.error_code || null, updated_at: row?.updated_at || null,
    capabilities: capabilities(provider), context_sync: { pending: Number(sync.pending || 0), syncing: Number(sync.syncing || 0), succeeded: Number(sync.succeeded || 0), failed: Number(sync.failed || 0), last_synced_at: sync.last_synced_at || null, error_code: sync.error_code || null } };
}
async function status(db, p, provider) {
  const row = await binding(db, p);
  const sync = row ? (await db.query(`SELECT count(*) FILTER (WHERE status IN ('pending','awaiting_service','awaiting_auth')) AS pending,
    count(*) FILTER (WHERE status='syncing') AS syncing,count(*) FILTER (WHERE status='succeeded') AS succeeded,
    count(*) FILTER (WHERE status='failed') AS failed,max(synced_at) AS last_synced_at,
    (array_agg(error_code ORDER BY sequence) FILTER (WHERE error_code IS NOT NULL AND status<>'succeeded'))[1] AS error_code
    FROM project_nora_context_outbox WHERE project_id=$1`, [p])).rows[0] : {};
  return publicBinding(row, provider, sync);
}

/** Call within the same transaction as project registration. Never calls Nora. */
async function queueBinding(db, p, u, selectedWorkspaceId) {
  const selected = workspaceId(selectedWorkspaceId);
  await owner(db, p, u);
  await lockProjectDispatch(db, p);
  // The advisory lock also serializes claims of one workspace by different projects.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-nora-workspace:' || $1,0))", [selected]);
  const old = await binding(db, p, true);
  if (old) {
    if (old.workspace_id !== selected) fail('NORA_BINDING_IMMUTABLE', '등록한 Nora 워크스페이스는 다른 워크스페이스로 변경할 수 없습니다.');
    return old;
  }
  if ((await db.query('SELECT 1 FROM project_nora_workspaces WHERE workspace_id=$1', [selected])).rowCount) fail('NORA_WORKSPACE_ALREADY_BOUND', '다른 프로젝트에 등록된 Nora 워크스페이스입니다.');
  await assertNoActiveLegacyRuns(db, p);
  const row = (await db.query(`INSERT INTO project_nora_workspaces(project_id,workspace_id,requested_by,project_name)
    SELECT id,$2,$3,name FROM projects WHERE id=$1 RETURNING *`, [p, selected, u])).rows[0];
  if (!row) fail('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404);
  await db.query('UPDATE project_settings SET repository_check=NULL,updated_at=now() WHERE project_id=$1', [p]);
  await audit(db, p, u, 'workspace_registered', { workspace_id: selected });
  return row;
}

/** Provider owns all authenticated Nora transport; this service never uses a URL supplied by a user. */
function createProjectNora({ pool, provider = {} }) {
  async function list(row) {
    if (row?.status !== 'ready') fail('NORA_WORKSPACE_NOT_READY', 'Nora 워크스페이스 연결 확인을 먼저 완료하세요.');
    if (typeof provider.listConnectors !== 'function') fail('NORA_SERVICE_UNAVAILABLE', '서버의 Nora 연결 서비스를 준비 중입니다.', 503);
    let result;
    try { result = await provider.listConnectors({ projectId: row.project_id, workspaceId: row.workspace_id }); }
    catch (error) { fail(safeError(error), 'Nora 커넥터 목록을 확인하지 못했습니다.', 502); }
    if (!Array.isArray(result) || result.length > 1000) fail('NORA_CONNECTOR_RESPONSE_INVALID', 'Nora 커넥터 목록의 형식을 확인할 수 없습니다.', 502);
    const ids = new Set();
    for (const c of result) {
      if (!c || !remoteId(c.id) || c.workspaceId !== row.workspace_id || ids.has(c.id) || typeof c.enabled !== 'boolean' || typeof c.provider !== 'string') fail('NORA_CONNECTOR_SCOPE_MISMATCH', '현재 워크스페이스의 커넥터를 확인할 수 없습니다.', 502);
      ids.add(c.id);
    }
    return result.filter(c => c.provider === 'github').map(c => ({ id: c.id, name: typeof c.name === 'string' ? c.name.slice(0,200) : c.id, provider: c.provider, enabled: c.enabled }));
  }
  return {
    async status(p, u) { await membership(pool, p, u); return status(pool, p, provider); },
    async attach(p, u, value) {
      body(value, ['workspace_id','expected_version']); expectedVersion(value.expected_version); workspaceId(value.workspace_id);
      return transaction(pool, async db => {
        await owner(db, p, u);
        const old = await binding(db, p, true);
        if (old) {
          if (old.workspace_id !== value.workspace_id) fail('NORA_BINDING_IMMUTABLE', '등록한 Nora 워크스페이스는 변경할 수 없습니다.');
          return status(db, p, provider);
        }
        if (value.expected_version !== 0) fail('NORA_VERSION_CONFLICT', 'Nora 연결 상태가 변경되었습니다. 다시 불러오세요.');
        await queueBinding(db, p, u, value.workspace_id);
        return status(db, p, provider);
      });
    },
    async retry(p, u, value) {
      body(value, ['expected_version']); expectedVersion(value.expected_version);
      return transaction(pool, async db => {
        await owner(db, p, u); const row = await binding(db, p, true);
        if (!row) fail('NORA_WORKSPACE_REQUIRED', 'Nora 워크스페이스 ID를 먼저 등록하세요.');
        if (row.version !== value.expected_version) fail('NORA_VERSION_CONFLICT', 'Nora 연결 상태가 변경되었습니다. 다시 불러오세요.');
        if (row.status === 'uncertain') fail('NORA_RECONCILE_REQUIRED', '이전 처리 결과를 먼저 확인해야 합니다.');
        if (row.status === 'verifying') fail('NORA_BINDING_IN_PROGRESS', 'Nora 연결을 확인 중입니다.');
        if (['pending','ready'].includes(row.status)) return status(db, p, provider);
        await db.query("UPDATE project_nora_workspaces SET status='pending',stage='queued',error_code=NULL,version=version+1,updated_at=now() WHERE project_id=$1", [p]);
        await audit(db, p, u, 'verification_requested');
        return status(db, p, provider);
      });
    },
    async reconcile(p, u, value) {
      body(value, ['expected_version']); expectedVersion(value.expected_version);
      return transaction(pool, async db => {
        await owner(db, p, u); const row = await binding(db, p, true);
        if (!row) fail('NORA_WORKSPACE_REQUIRED', 'Nora 워크스페이스 ID를 먼저 등록하세요.');
        if (row.version !== value.expected_version) fail('NORA_VERSION_CONFLICT', 'Nora 연결 상태가 변경되었습니다. 다시 불러오세요.');
        if (row.status === 'ready') return status(db, p, provider);
        if (row.status !== 'uncertain') fail('NORA_RECONCILE_NOT_REQUIRED', '결과가 불확실한 연결만 다시 확인할 수 있습니다.');
        if (typeof provider.reconcileContextSpace !== 'function') fail('NORA_RECONCILE_UNAVAILABLE', '서버에서 이전 Nora 처리 결과를 확인할 수 없습니다.', 503);
        await db.query("UPDATE project_nora_workspaces SET status='pending',operation='reconcile',error_code=NULL,version=version+1,updated_at=now() WHERE project_id=$1", [p]);
        await audit(db, p, u, 'reconciliation_requested');
        return status(db, p, provider);
      });
    },
    async connectors(p, u) {
      await membership(pool, p, u); const row = await binding(pool, p);
      return { connectors: await list(row), version: row.version };
    },
    async selectConnector(p, u, value) {
      body(value, ['expected_version','connector_id']); expectedVersion(value.expected_version);
      if (!remoteId(value.connector_id)) fail('NORA_CONNECTOR_INVALID', 'GitHub 커넥터를 선택하세요.', 400);
      await owner(pool, p, u); const before = await binding(pool, p);
      if (!before || before.version !== value.expected_version) fail('NORA_VERSION_CONFLICT', 'Nora 연결 상태가 변경되었습니다. 다시 불러오세요.');
      const selected = (await list(before)).find(c => c.id === value.connector_id && c.enabled);
      if (!selected) fail('NORA_CONNECTOR_UNAVAILABLE', '현재 워크스페이스에서 활성화된 GitHub 커넥터를 선택하세요.');
      return transaction(pool, async db => {
        await owner(db, p, u); const current = await binding(db, p, true);
        if (current?.version !== before.version || current.workspace_id !== before.workspace_id || current.status !== 'ready') fail('NORA_VERSION_CONFLICT', '커넥터 확인 중 Nora 연결 상태가 변경되었습니다.');
        if (current.connector_id !== selected.id) {
          await db.query('UPDATE project_nora_workspaces SET connector_id=$2,version=version+1,updated_at=now() WHERE project_id=$1', [p, selected.id]);
          await audit(db, p, u, 'github_connector_selected', { connector_id: selected.id, workspace_id: current.workspace_id });
        }
        return status(db, p, provider);
      });
    },
    async retrySync(p, u, value) {
      body(value, ['expected_version']); expectedVersion(value.expected_version);
      return transaction(pool, async db => {
        await owner(db, p, u); const row = await binding(db, p, true);
        if (!row || row.version !== value.expected_version) fail('NORA_VERSION_CONFLICT', 'Nora 연결 상태가 변경되었습니다.');
        if (row.status !== 'ready') fail('NORA_WORKSPACE_NOT_READY', 'Nora 연결 확인을 먼저 완료하세요.');
        await db.query("UPDATE project_nora_context_outbox SET status='pending',error_code=NULL WHERE project_id=$1 AND status IN ('failed','awaiting_service','awaiting_auth')", [p]);
        await audit(db, p, u, 'context_sync_requested');
        return status(db, p, provider);
      });
    },
  };
}
module.exports = { createProjectNora, queueBinding, workspaceId, remoteId, binding, publicBinding, safeError, audit, fail, assertLegacyNoraDispatch, lockProjectDispatch };
