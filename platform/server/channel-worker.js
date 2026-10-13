'use strict';

const { randomUUID } = require('node:crypto');
const { transaction } = require('./db');
const { runChannelTriage, validateChannelTriageRequest, validateChannelTriageResult } = require('../../nora/client/channel-triage-client');
const manifest = require('../../nora/channel-triage/manifest.json');
const KNOWN_CODES = new Set(['TRIAGE_PROJECT_CONTEXT_REQUIRED', 'PROJECT_MISMATCH', 'TRIAGE_REQUEST_INVALID', 'TRIAGE_REQUEST_TOO_LARGE',
  'TRIAGE_MESSAGES_INVALID', 'TRIAGE_RESULT_INVALID', 'TRIAGE_KIND_MISMATCH', 'TRIAGE_EVIDENCE_MISMATCH', 'TRIAGE_RUN_NOT_SUCCEEDED',
  'TRIAGE_OUTPUTS_INCOMPLETE', 'TRIAGE_OUTPUT_INVALID', 'TRIAGE_OUTPUT_MISMATCH', 'TRIAGE_NOT_PUBLISHED', 'TRIAGE_AUTH_REQUIRED',
  'TRIAGE_TIMEOUT_INVALID', 'TRIAGE_TRANSPORT_UNKNOWN', 'TRIAGE_RESPONSE_INVALID', 'TRIAGE_RECORD_MISMATCH', 'TRIAGE_LEASE_LOST']);
function safeErrorCode(error) {
  return KNOWN_CODES.has(error?.code) || /^TRIAGE_HTTP_[1-5]\d\d$/.test(error?.code || '') ? error.code : 'TRIAGE_INTERNAL';
}
function classifyFailure(error, dispatched) {
  const code = safeErrorCode(error);
  return { code, status: dispatched && (['TRIAGE_INTERNAL', 'TRIAGE_TRANSPORT_UNKNOWN', 'TRIAGE_RESPONSE_INVALID', 'TRIAGE_RUN_NOT_SUCCEEDED'].includes(code) || /^TRIAGE_HTTP_(5\d\d|408)$/.test(code)) ? 'uncertain' : 'failed' };
}
function safeTrace(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null; }
function fail(code) { throw Object.assign(new Error(code), { code }); }

/** Durable at-most-once dispatch: expired calls require manual review, never automatic replay. */
function createChannelWorker({ pool, token, invoke = runChannelTriage, onError = () => {}, pollMs = 2000 } = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('pool is required');
  if (!Number.isFinite(pollMs) || pollMs < 10) throw new TypeError('pollMs must be at least 10');
  let started = false, timer, processing;
  const report = code => { try { onError({ code }); } catch { /* Diagnostics cannot alter durable state. */ } };
  async function audit(client, row, kind, detail = {}) {
    await client.query(`INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,NULL,$2,$3,$4::jsonb)`,
      [row.project_id, kind, row.id, JSON.stringify({ source_id: row.source_id, ...detail })]);
  }
  async function recoverExpired() {
    return transaction(pool, async client => {
      const { rows } = await client.query(`SELECT * FROM channel_inbox WHERE status='running'
        AND (lease_expires_at IS NULL OR lease_expires_at<=now()) ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`);
      for (const row of rows) {
        await client.query(`UPDATE channel_inbox SET status='uncertain',error_code='TRIAGE_LEASE_EXPIRED',
          lease_token=NULL,lease_expires_at=NULL,completed_at=now() WHERE id=$1`, [row.id]);
        await audit(client, row, 'channel.triage_uncertain', { error_code: 'TRIAGE_LEASE_EXPIRED' });
      }
      return rows.length;
    });
  }
  async function claim() {
    return transaction(pool, async client => {
      const { rows: [row] } = await client.query(`SELECT * FROM channel_inbox WHERE status='queued'
        ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!row) return null;
      const { rows: [claimed] } = await client.query(`UPDATE channel_inbox SET status='running',lease_token=$2,
        lease_expires_at=now()+interval '120 seconds',error_code=NULL WHERE id=$1 RETURNING *`, [row.id, randomUUID()]);
      return claimed;
    });
  }
  async function intent(row) {
    return transaction(pool, async client => {
      const { rows: [fresh] } = await client.query(`SELECT * FROM channel_inbox WHERE id=$1 AND lease_token=$2
        AND status='running' AND lease_expires_at>now() FOR UPDATE`, [row.id, row.lease_token]);
      if (!fresh) fail('TRIAGE_LEASE_LOST');
      if (fresh.evidence_changed) return false;
      await audit(client, fresh, 'channel.triage_started', { published_version_id: manifest.published_version_id,
        flow_slug: manifest.slug, agent_id: manifest.agent_id, input_sha256: fresh.input_sha256 });
      return true;
    });
  }
  async function finish(row, status, code = null, analysis = null, traceId = null) {
    return transaction(pool, async client => {
      const { rows: [done] } = await client.query(`UPDATE channel_inbox SET status=$3,
        error_code=CASE WHEN evidence_changed THEN 'EVIDENCE_CHANGED' ELSE $4 END,
        analysis=$5::jsonb,trace_id=$6,lease_token=NULL,lease_expires_at=NULL,completed_at=now()
        WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now() RETURNING *`,
      [row.id, row.lease_token, status, code, analysis === null ? null : JSON.stringify(analysis), safeTrace(traceId)]);
      if (!done) return { id: row.id, status: 'uncertain', code: 'TRIAGE_LEASE_LOST' };
      await audit(client, done, 'channel.triage_' + status, { error_code: done.error_code, trace_id: done.trace_id });
      return { id: done.id, status: done.status, code: done.error_code };
    });
  }
  async function execute(row) {
    let dispatched = false;
    try {
      if (row.evidence_changed) return await finish(row, 'needs_review', 'EVIDENCE_CHANGED');
      const input = structuredClone(row.input_snapshot);
      validateChannelTriageRequest(input, row.project_id);
      if (input.request_id !== row.id || input.source.id !== row.source_id || input.conversation_key !== row.conversation_key) fail('TRIAGE_RECORD_MISMATCH');
      if (typeof token !== 'string' || !token.trim() || manifest.publication_status !== 'published' || !manifest.published_version_id || !manifest.agent_id) {
        return await finish(row, 'needs_review', 'TRIAGE_UNAVAILABLE');
      }
      if (!(await intent(row))) return await finish(row, 'needs_review', 'EVIDENCE_CHANGED');
      dispatched = true;
      // The trusted snapshot is retained for independent validation after invocation.
      const response = await invoke(structuredClone(input), { expectedProjectId: row.project_id, token, timeoutMs: 45000 });
      const analysis = validateChannelTriageResult(response?.result, input, row.project_id);
      if (!safeTrace(response?.traceId)) fail('TRIAGE_RUN_NOT_SUCCEEDED');
      return await finish(row, 'needs_review', null, analysis, response.traceId);
    } catch (error) {
      const failure = classifyFailure(error, dispatched);
      return finish(row, failure.status, failure.code, null, error?.traceId);
    }
  }
  async function processOnce() {
    if (processing) return null;
    processing = (async () => { await recoverExpired(); const row = await claim(); return row ? execute(row) : null; })();
    try { return await processing; } finally { processing = undefined; }
  }
  async function tick() {
    if (!started) return;
    try { await processOnce(); } catch { report('TRIAGE_WORKER_FAILED'); }
    if (started) { timer = setTimeout(tick, pollMs); timer.unref(); }
  }
  function start() { if (started) return; started = true; void tick(); }
  async function stop() { started = false; clearTimeout(timer); if (processing) await processing.catch(() => {}); }
  return { start, stop, tick: processOnce, processOnce, processOne: processOnce, recoverExpired };
}

module.exports = { createChannelWorker, safeErrorCode, classifyFailure };
