'use strict';
const { randomUUID } = require('node:crypto');
const { transaction } = require('./db');
const { createContextAI } = require('./context-ai-ledger');

// Creates a durable local Nora run after extraction. The Context worker performs
// the actual model call and retains its existing human approval gate.
function createDocumentAnalysisScheduler({ pool, enabled = false, create } = {}) {
  const submit = create || ((p, u, body) => createContextAI({ pool, enabled: true }).create(p, u, body));
  let ticking = false;
  async function claim() {
    return transaction(pool, async db => {
      // A user retry of extraction may unblock a source; no failed AI run is retried here.
      await db.query(`UPDATE document_analysis_queue q SET status='pending',error_code=NULL,next_attempt_at=now(),updated_at=now()
        FROM revisions r WHERE r.id=q.revision_id AND r.project_id=q.project_id AND q.status='blocked'
        AND q.error_code IN ('DOCUMENT_INTAKE_FAILED','DOCUMENT_INTAKE_UNCERTAIN') AND r.status IN ('queued','running','ready')`);
      await db.query(`UPDATE document_analysis_queue q SET status='blocked',error_code=CASE r.status WHEN 'failed' THEN 'DOCUMENT_INTAKE_FAILED' ELSE 'DOCUMENT_INTAKE_UNCERTAIN' END,updated_at=now()
        FROM revisions r WHERE r.id=q.revision_id AND r.project_id=q.project_id AND q.status='pending'
        AND r.status IN ('failed','uncertain') AND (q.lease_expires_at IS NULL OR q.lease_expires_at<=now())`);
      const row = (await db.query(`SELECT q.*,d.domain_id FROM document_analysis_queue q
        JOIN revisions r ON r.id=q.revision_id AND r.project_id=q.project_id
        JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id
        WHERE q.status='pending' AND q.next_attempt_at<=now() AND r.status='ready'
        AND (q.lease_expires_at IS NULL OR q.lease_expires_at<=now())
        ORDER BY q.next_attempt_at,q.created_at,q.revision_id FOR UPDATE OF q SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) return null;
      // Persist the complete idempotent body before submission. If a process dies
      // after create() commits, the next lease reuses precisely the same request.
      const request = row.request || {
        request_id: row.request_id,
        source_refs: [{ type: 'revision', id: row.revision_id }],
        domain_id: row.domain_id,
        expected_context_version: Number((await db.query('SELECT version FROM context_heads WHERE project_id=$1', [row.project_id])).rows[0]?.version || 0),
      };
      const token = randomUUID();
      await db.query(`UPDATE document_analysis_queue SET request=$2,lease_token=$3,lease_expires_at=now()+interval '60 seconds',updated_at=now() WHERE revision_id=$1`, [row.revision_id, JSON.stringify(request), token]);
      return { ...row, request, lease_token: token };
    });
  }
  async function tick() {
    if (!enabled || ticking) return null;
    ticking = true;
    try {
      const row = await claim();
      if (!row) return null;
      try {
        const run = await submit(row.project_id, row.created_by, row.request);
        await pool.query(`UPDATE document_analysis_queue SET status='submitted',error_code=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=now()
          WHERE revision_id=$1 AND lease_token=$2`, [row.revision_id, row.lease_token]);
        return { revision_id: row.revision_id, run_id: run.id, status: 'submitted' };
      } catch (error) {
        const code = /^[A-Z0-9_]{1,90}$/.test(error.code || '') ? error.code : 'DOCUMENT_ANALYSIS_RETRY';
        // Quotas and transient database failures are safe to retry: create() only
        // inserts a run and checks its persisted request ID before doing so.
        const retry = error.status === 429 || !error.status || error.status >= 500;
        await pool.query(`UPDATE document_analysis_queue SET status=$3,error_code=$4,lease_token=NULL,lease_expires_at=NULL,
          next_attempt_at=now()+interval '30 seconds',updated_at=now() WHERE revision_id=$1 AND lease_token=$2`,
        [row.revision_id, row.lease_token, retry ? 'pending' : 'blocked', code]);
        return { revision_id: row.revision_id, status: retry ? 'pending' : 'blocked', error_code: code };
      }
    } finally { ticking = false; }
  }
  return { tick };
}
module.exports = { createDocumentAnalysisScheduler };
