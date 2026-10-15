'use strict';
const { randomUUID } = require('node:crypto');
const { transaction } = require('./db');
const { binding, remoteId, safeError, audit, fail } = require('./project-nora');

/**
 * Providers inspect the user-selected workspace; they MUST NOT create one.
 * ensureContextSpace is idempotent for (projectId, workspaceId, requestId).
 * reconcileContextSpace only reads the outcome of that exact request.
 * syncContext upserts an immutable event by event.id and must be replay-safe.
 * All provider calls occur after the claiming transaction has committed.
 */
function createProjectNoraWorker({ pool, provider = {}, pollMs = 3000, timeoutMs = 60000, onError = () => {} }) {
  let timer, active = null, stopped = false, controller;
  const leaseSeconds = Math.max(90, Math.ceil(timeoutMs / 1000) + 30);
  async function recover() {
    await pool.query(`UPDATE project_nora_workspaces SET status=CASE WHEN stage='context_space' THEN 'uncertain' ELSE 'failed' END,
      error_code=CASE WHEN stage='context_space' THEN 'NORA_CONTEXT_SPACE_UNCERTAIN' ELSE 'NORA_INSPECTION_INTERRUPTED' END,
      lease_token=NULL,lease_expires_at=NULL,version=version+1,updated_at=now()
      WHERE status='verifying' AND lease_expires_at<=now()`);
    // An event is an idempotent upsert, so it is safe to replay the exact event.
    await pool.query(`UPDATE project_nora_context_outbox SET status='pending',error_code='NORA_SYNC_INTERRUPTED',lease_token=NULL,lease_expires_at=NULL
      WHERE status='syncing' AND lease_expires_at<=now()`);
  }
  async function claimBinding() {
    return transaction(pool, async db => {
      const row = (await db.query("SELECT * FROM project_nora_workspaces WHERE status='pending' ORDER BY created_at,project_id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
      if (!row) return null;
      const token = randomUUID();
      await db.query(`UPDATE project_nora_workspaces SET status='verifying',stage='inspecting',lease_token=$2,
        lease_expires_at=now()+make_interval(secs=>$3),version=version+1,updated_at=now() WHERE project_id=$1`, [row.project_id, token, leaseSeconds]);
      return { ...row, lease_token: token };
    });
  }
  async function finish(row, state, code = null, operation = row.operation) {
    await pool.query(`UPDATE project_nora_workspaces SET status=$3,error_code=$4,operation=$5,lease_token=NULL,lease_expires_at=NULL,
      version=version+1,updated_at=now() WHERE project_id=$1 AND lease_token=$2`, [row.project_id, row.lease_token, state, code, operation]);
    return { project_id: row.project_id, status: state, error_code: code };
  }
  async function ready(row, spaceId) {
    return transaction(pool, async db => {
      // Serialize the initial snapshot against both single and batch confirmations.
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-context:' || $1,0))", [row.project_id]);
      const current = await binding(db, row.project_id, true);
      if (current?.lease_token !== row.lease_token || current.status !== 'verifying') return { project_id: row.project_id, status: 'uncertain', error_code: 'NORA_LEASE_LOST' };
      if (current.space_id && current.space_id !== spaceId) fail('NORA_CONTEXT_SPACE_MISMATCH', 'Nora Context 공간이 기존 연결과 다릅니다.');
      await db.query(`UPDATE project_nora_workspaces SET status='ready',stage='complete',space_id=$2,error_code=NULL,
        lease_token=NULL,lease_expires_at=NULL,version=version+1,updated_at=now() WHERE project_id=$1`, [row.project_id, spaceId]);
      // No migration-wide backfill: only this explicitly connected project's current records.
      await db.query(`INSERT INTO project_nora_context_outbox(project_id,event_key,kind,context_version,payload)
        SELECT r.project_id,'record:' || r.id,'context_record',r.context_version,jsonb_build_object('record',to_jsonb(r))
        FROM context_records r WHERE r.project_id=$1
        AND NOT EXISTS (SELECT 1 FROM context_supersessions s WHERE s.project_id=r.project_id AND s.previous_id=r.id)
        ORDER BY r.context_version ON CONFLICT (project_id,event_key) DO NOTHING`, [row.project_id]);
      await audit(db, row.project_id, null, 'workspace_verified', { workspace_id: row.workspace_id, space_id: spaceId });
      return { project_id: row.project_id, status: 'ready' };
    });
  }
  async function verify(row, signal) {
    const method = row.operation === 'reconcile' ? 'reconcileContextSpace' : 'ensureContextSpace';
    if (typeof provider.inspectWorkspace !== 'function' || typeof provider[method] !== 'function') return finish(row, 'awaiting_service', 'NORA_SERVICE_UNAVAILABLE');
    let spaceStarted = false;
    try {
      const inspected = await provider.inspectWorkspace({ projectId: row.project_id, workspaceId: row.workspace_id, signal });
      if (inspected?.workspaceId !== row.workspace_id) fail('NORA_WORKSPACE_SCOPE_MISMATCH', '등록한 Nora 워크스페이스를 확인할 수 없습니다.');
      if (signal.aborted) throw Object.assign(new Error('Interrupted'), { code: 'NORA_INSPECTION_INTERRUPTED' });
      const updated = await pool.query(`UPDATE project_nora_workspaces SET stage='context_space',updated_at=now()
        WHERE project_id=$1 AND lease_token=$2 AND status='verifying'`, [row.project_id, row.lease_token]);
      if (!updated.rowCount) return { project_id: row.project_id, status: 'uncertain', error_code: 'NORA_LEASE_LOST' };
      spaceStarted = true;
      const result = await provider[method]({ projectId: row.project_id, workspaceId: row.workspace_id, requestId: row.request_id, name: row.project_name, signal });
      if (result?.workspaceId !== row.workspace_id) fail('NORA_CONTEXT_SPACE_MISMATCH', '등록한 Nora 워크스페이스의 Context 공간을 확인할 수 없습니다.');
      if (row.operation === 'reconcile' && result.status === 'absent') return finish(row, 'failed', 'NORA_CONTEXT_SPACE_NOT_FOUND', 'verify');
      if (row.operation === 'reconcile' && ['pending','uncertain'].includes(result.status)) return finish(row, 'uncertain', 'NORA_CONTEXT_SPACE_UNCERTAIN');
      if (!remoteId(result.spaceId)) fail('NORA_CONTEXT_SPACE_INVALID', 'Nora Context 공간의 식별자를 확인할 수 없습니다.');
      return await ready(row, result.spaceId);
    } catch (error) {
      if (error.code === 'NORA_AUTH_REQUIRED' && (!spaceStarted || row.operation === 'reconcile' || error.noSideEffects === true)) return finish(row, 'awaiting_auth', 'NORA_AUTH_REQUIRED');
      // A timeout or malformed response after bootstrap may conceal a remote write.
      // Only a read-only reconciliation can make that attempt safe to retry.
      return finish(row, spaceStarted || row.operation === 'reconcile' ? 'uncertain' : 'failed', safeError(error, spaceStarted ? 'NORA_CONTEXT_SPACE_UNCERTAIN' : 'NORA_INSPECTION_FAILED'));
    }
  }
  async function claimEvent() {
    return transaction(pool, async db => {
      const row = (await db.query(`SELECT e.*,w.workspace_id,w.space_id FROM project_nora_context_outbox e
        JOIN project_nora_workspaces w ON w.project_id=e.project_id AND w.status='ready'
        WHERE e.status='pending' AND NOT EXISTS (
          SELECT 1 FROM project_nora_context_outbox previous WHERE previous.project_id=e.project_id
          AND previous.sequence<e.sequence AND previous.status<>'succeeded')
        ORDER BY e.sequence FOR UPDATE OF e SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) return null;
      const token = randomUUID();
      await db.query(`UPDATE project_nora_context_outbox SET status='syncing',attempt=attempt+1,lease_token=$2,
        lease_expires_at=now()+make_interval(secs=>$3) WHERE id=$1`, [row.id, token, leaseSeconds]);
      return { ...row, lease_token: token };
    });
  }
  async function sync(row, signal) {
    let state = 'succeeded', code = null;
    try {
      if (typeof provider.syncContext !== 'function') fail('NORA_CONTEXT_SYNC_UNAVAILABLE', '서버의 Nora Context 동기화 서비스를 준비 중입니다.');
      const event = { id: row.id, key: row.event_key, kind: row.kind, project_id: row.project_id, context_version: Number(row.context_version), payload: row.payload };
      const result = await provider.syncContext({ projectId: row.project_id, workspaceId: row.workspace_id, spaceId: row.space_id, event, signal });
      if (result?.workspaceId !== row.workspace_id || result.spaceId !== row.space_id || result.eventId !== row.id) fail('NORA_CONTEXT_SYNC_MISMATCH', 'Nora Context 반영 결과가 요청과 다릅니다.');
    } catch (error) {
      code = safeError(error, 'NORA_CONTEXT_SYNC_FAILED');
      state = code === 'NORA_CONTEXT_SYNC_UNAVAILABLE' ? 'awaiting_service' : code === 'NORA_AUTH_REQUIRED' ? 'awaiting_auth' : 'failed';
    }
    await pool.query(`UPDATE project_nora_context_outbox SET status=$3,error_code=$4,lease_token=NULL,lease_expires_at=NULL,
      synced_at=CASE WHEN $3='succeeded' THEN now() ELSE NULL END WHERE id=$1 AND lease_token=$2`, [row.id, row.lease_token, state, code]);
    return { project_id: row.project_id, event_id: row.id, status: state, error_code: code };
  }
  async function execute() {
    await recover();
    const row = await claimBinding();
    if (!row) {
      const event = await claimEvent();
      if (!event) return null;
      controller = new AbortController();
      try { return await sync(event, AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])); }
      finally { controller = null; }
    }
    controller = new AbortController();
    try { return await verify(row, AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)])); }
    finally { controller = null; }
  }
  function runOnce() {
    if (active) return active;
    active = execute().finally(() => { active = null; });
    return active;
  }
  async function tick() { if (!stopped) try { await runOnce(); } catch (error) { onError({ code: safeError(error) }); } }
  return { runOnce, tick, recover,
    async start() { if (timer) return; stopped = false; await tick(); timer = setInterval(tick, pollMs); timer.unref(); },
    async stop() { stopped = true; clearInterval(timer); timer = null; controller?.abort(); if (active) await active; },
  };
}
module.exports = { createProjectNoraWorker };
