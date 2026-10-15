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
const LEGACY_RUNS = [
  ['jobs', '문서 추출·변경 검토', ['queued','running','uncertain']],
  ['registration_requests', '자료 분류 추천', ['running','uncertain']],
  ['channel_inbox', '수집한 대화 분석', ['queued','running','uncertain']],
  ['implementation_plans', 'AI 개발 계획', ['queued','running','uncertain']],
  ['implementation_requests', '코드 변경안 실행', ['awaiting_runner','running','uncertain']],
  ['commercial_rewrites', '계약 문서 보정', ['queued','running','uncertain']],
  ['context_ai_runs', '프로젝트 자료 분석', ['queued','running','waiting_approval','finalizing','uncertain']],
  ['work_ai_runs', '작업 검토 분석', ['queued','running','waiting_approval','finalizing','uncertain']],
  ['github_deliveries', 'GitHub PR 발행', ['publishing','uncertain']],
];
const NO_LEGACY_RUNS = { blocked: false, total: 0, counts: {}, items: [], has_more: false, reconcilable: false };
// The status panel and registration guard share one predicate. Never expose
// approval tickets, trace payloads, source content, or credentials here.
async function legacyRuns(db, p) {
  const sql = LEGACY_RUNS.map(([table, title, states]) => `SELECT '${table}' AS kind,id::text,'${title}' AS title,status,created_at,
    COALESCE((to_jsonb(t)->>'updated_at')::timestamptz,(to_jsonb(t)->>'completed_at')::timestamptz,created_at) AS updated_at,
    to_jsonb(t)->>'error_code' AS error_code,
    ('${table}'='context_ai_runs' AND status='uncertain' AND to_jsonb(t)->>'approval_id' IS NOT NULL) AS reconcilable
    FROM ${table} t WHERE project_id=$1 AND status IN (${states.map(s => `'${s}'`).join(',')})`).join(' UNION ALL ');
  const row = (await db.query(`WITH active AS (${sql}) SELECT
    (SELECT count(*)::int FROM active) AS total,
    COALESCE((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*)::int n FROM active GROUP BY status) c),'{}'::jsonb) AS counts,
    COALESCE((SELECT bool_or(reconcilable) FROM active),false) AS reconcilable,
    COALESCE((SELECT jsonb_agg(to_jsonb(i) - 'reconcilable') FROM (SELECT * FROM active ORDER BY created_at,id,kind LIMIT 50) i),'[]'::jsonb) AS items`, [p])).rows[0];
  return { ...row, blocked: row.total > 0, has_more: row.total > row.items.length };
}
async function assertNoActiveLegacyRuns(db, p) {
  const result = await legacyRuns(db, p);
  if (result.blocked) fail('NORA_LEGACY_RUNS_ACTIVE', `기존 작업 ${result.total}건의 결과 확인이 필요합니다. 아래 작업 목록에서 상태를 확인한 뒤 Nora 워크스페이스를 등록하세요.`);
}
function capabilities(provider) {
  return { verify: typeof provider.inspectWorkspace === 'function', context_space: typeof provider.ensureContextSpace === 'function', connectors: typeof provider.listConnectors === 'function', context_sync: typeof provider.syncContext === 'function' };
}
function publicBinding(row, provider = {}, sync = {}, legacy = NO_LEGACY_RUNS) {
  return { mode: row ? 'nora' : 'legacy', status: row?.status || 'legacy', version: Number(row?.version || 0), workspace_id: row?.workspace_id || null,
    space_id: row?.space_id || null, connector_id: row?.connector_id || null, error_code: row?.error_code || null, updated_at: row?.updated_at || null,
    capabilities: capabilities(provider), legacy_runs: legacy, context_sync: { pending: Number(sync.pending || 0), syncing: Number(sync.syncing || 0), succeeded: Number(sync.succeeded || 0), failed: Number(sync.failed || 0), last_synced_at: sync.last_synced_at || null, error_code: sync.error_code || null } };
}
async function status(db, p, provider) {
  const row = await binding(db, p);
  const sync = row ? (await db.query(`SELECT count(*) FILTER (WHERE status IN ('pending','awaiting_service','awaiting_auth')) AS pending,
    count(*) FILTER (WHERE status='syncing') AS syncing,count(*) FILTER (WHERE status='succeeded') AS succeeded,
    count(*) FILTER (WHERE status='failed') AS failed,max(synced_at) AS last_synced_at,
    (array_agg(error_code ORDER BY sequence) FILTER (WHERE error_code IS NOT NULL AND status<>'succeeded'))[1] AS error_code
    FROM project_nora_context_outbox WHERE project_id=$1`, [p])).rows[0] : {};
  return publicBinding(row, provider, sync, row ? NO_LEGACY_RUNS : await legacyRuns(db, p));
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
function createProjectNora({ pool, provider = {}, legacyClient }) {
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
      // Reconcile only authoritative terminal outcomes before opening the
      // registration transaction. Pending/unknown work still blocks registration.
      await owner(pool, p, u);
      if (value.expected_version === 0 && !(await binding(pool, p))) {
        try {
          await require('./legacy-context-reconciliation').reconcileLegacyContextRuns({ pool, projectId: p, userId: u, client: legacyClient });
        } catch (error) {
          // A concurrent registration may have won while Nora was being read.
          // The locked transaction below still verifies the ID and version.
          if (error.code !== 'NORA_LEGACY_RECONCILE_NOT_ALLOWED') throw error;
        }
      }
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
    async reconcileLegacy(p, u, value) {
      body(value, []);
      const reconciliation = await require('./legacy-context-reconciliation').reconcileLegacyContextRuns({ pool, projectId: p, userId: u, client: legacyClient });
      return { workspace: await status(pool, p, provider), reconciliation };
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
module.exports = { createProjectNora, queueBinding, workspaceId, remoteId, binding, publicBinding, safeError, audit, fail, assertLegacyNoraDispatch, lockProjectDispatch, legacyRuns };
