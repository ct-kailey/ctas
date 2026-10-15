'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { transaction } = require('./db');
const { assertLegacyNoraDispatch } = require('./project-nora');
const { extractDocument, validateExtractedDocument, validateSource, ADAPTER_CODES } = require('./extractor');
const { checkRequest, runDocumentPipeline, runPublishedChangeReview } = require('../../nora/client/nora-client');
const { validateDocumentSchema, validateResultSchema } = require('../../nora/client/schema-validator');
const { finalizeReview } = require('../../nora/flow/review-core');
const pipelineManifest = require('../../nora/pipeline/manifest.json');
const flowManifest = require('../../nora/flow/manifest.json');

const KNOWN_CODES = new Set([...ADAPTER_CODES,
  'NORA_PROJECT_FLOW_SETUP_REQUIRED',
  'SOURCE_BYTES_REQUIRED', 'SOURCE_MIME_MISMATCH', 'SOURCE_HASH_MISMATCH', 'EXTRACTION_IDENTITY_MISMATCH',
  'EXTRACTION_TIMEOUT', 'EXTRACTOR_UNAVAILABLE', 'EXTRACTION_FAILED', 'EXTRACTION_OUTPUT_LIMIT',
  'EXTRACTION_OUTPUT_INVALID', 'DOCUMENT_SCHEMA_INVALID', 'REQUEST_SCHEMA_INVALID', 'RESULT_SCHEMA_INVALID',
  'INVALID_INPUT', 'PROJECT_MISMATCH', 'DOCUMENT_MISMATCH', 'MISSING_LOCATOR', 'AMBIGUOUS_REQUIREMENT_KEY',
  'INPUT_TOO_LARGE', 'OUTPUT_IDENTITY_MISMATCH', 'OUTPUT_SCHEMA_INVALID', 'OUTPUT_TOO_LARGE', 'ILLEGAL_APPROVAL',
  'MODEL_BLOCKED', 'OUTPUT_COVERAGE_INVALID', 'EVIDENCE_MISMATCH', 'CRITICAL_CHANGE_DOWNGRADED',
  'UNSUPPORTED_IMPACT', 'OMITTED_CHANGE', 'WORKER_RECORD_MISSING', 'WORKER_RECORD_CONFLICT', 'WORKER_LEASE_EXPIRED',
  'WORKER_LEASE_LOST', 'WORKER_INTERNAL', 'PIPELINE_AUTH_REQUIRED', 'FLOW_AUTH_REQUIRED', 'FLOW_NOT_PUBLISHED',
  'PIPELINE_TRANSPORT_UNKNOWN', 'FLOW_TRANSPORT_UNKNOWN', 'PIPELINE_RESPONSE_INVALID', 'FLOW_RESPONSE_INVALID',
  'PIPELINE_RUN_NOT_SUCCEEDED', 'PIPELINE_REPORT_INVALID', 'PIPELINE_STAGE_INVALID', 'PIPELINE_STAGE_FAILED',
  'PIPELINE_RECORD_FAILED', 'PIPELINE_RECORD_COUNT_INVALID', 'PIPELINE_STAGE_MISSING', 'PIPELINE_OUTPUT_INVALID',
  'PIPELINE_IDENTITY_CHANGED', 'PIPELINE_SOURCE_CHANGED', 'PIPELINE_EXTRACTION_CHANGED', 'PIPELINE_SEGMENTS_CHANGED',
  'PIPELINE_SEGMENT_CHANGED', 'PIPELINE_NORMALIZED_TEXT_INVALID', 'PIPELINE_NORMALIZATION_INVALID',
  'PIPELINE_SINGLE_DOCUMENT_REQUIRED', 'PIPELINE_PROJECT_CONTEXT_REQUIRED', 'PIPELINE_SCRIPT_ERROR',
  'PIPELINE_OPTIONS_INVALID', 'PIPELINE_ID_MISMATCH', 'FLOW_RUN_NOT_SUCCEEDED', 'FLOW_OUTPUT_INVALID',
  'FLOW_OUTPUTS_INCOMPLETE', 'FLOW_OUTPUT_MISMATCH', 'NORA_RESULT_INVALID',
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function safeErrorCode(error) {
  return KNOWN_CODES.has(error?.code) || /^(PIPELINE|FLOW)_HTTP_[1-5]\d\d$/.test(error?.code || '')
    ? error.code : 'WORKER_INTERNAL';
}
function classifyFailure(error, externalStarted = false) {
  const code = safeErrorCode(error);
  const unknown = externalStarted && (code === 'WORKER_INTERNAL' ||
    code === 'NORA_RESULT_INVALID' ||
    /_TRANSPORT_UNKNOWN$/.test(code) || /_HTTP_(5\d\d|408)$/.test(code) ||
    /^(PIPELINE|FLOW)_(RESPONSE_INVALID|RUN_NOT_SUCCEEDED)$/.test(code));
  return { status: unknown ? 'uncertain' : 'failed', code };
}
function safeTraceId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : undefined; }
function hashJson(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function verifyNormalization(original, output) {
  validateDocumentSchema(output);
  const retained = structuredClone(output);
  delete retained.normalization;
  for (const segment of retained.segments) delete segment.normalized_text;
  const source = structuredClone(original);
  delete source.normalization;
  for (const segment of source.segments) delete segment.normalized_text;
  if (!isDeepStrictEqual(source, retained)) fail('PIPELINE_SOURCE_CHANGED');
  if (!output.normalization || output.normalization.segment_count !== output.segments.length ||
      !output.segments.every(segment => typeof segment.normalized_text === 'string')) fail('PIPELINE_NORMALIZATION_INVALID');
  return output;
}

/** One in-flight job per process. Database leases coordinate multiple worker processes. */
function createWorker({
  pool, pipelineToken, flowToken, python,
  extract = extractDocument, normalize = runDocumentPipeline, review = runPublishedChangeReview,
  leaseMs = 10 * 60 * 1000, heartbeatMs = 20000, pollMs = 1500,
  onError = () => {},
} = {}) {
  if (!pool || typeof pool.connect !== 'function') throw new TypeError('pool is required');
  if (!Number.isFinite(leaseMs) || leaseMs < 1000 || !Number.isFinite(heartbeatMs) ||
      heartbeatMs < 10 || heartbeatMs >= leaseMs / 2) throw new TypeError('Invalid lease configuration');
  let running = false, loop, wake, processing;
  function report(code) { try { onError({ code }); } catch { /* Diagnostics cannot alter job state. */ } }

  async function audit(client, job, kind, extra = {}) {
    await client.query(`INSERT INTO events (project_id,actor_id,kind,entity_id,detail)
      VALUES ($1,NULL,$2,$3,$4::jsonb)`, [job.project_id, kind, job.id, JSON.stringify({
      job_kind: job.kind, revision_id: job.revision_id, review_id: job.review_id,
      attempt: job.attempt, stage: job.stage, ...extra,
    })]);
  }

  async function recoverExpired() {
    return transaction(pool, async client => {
      const { rows } = await client.query(`SELECT * FROM jobs WHERE status='running'
        AND (lease_expires_at IS NULL OR lease_expires_at <= now())
        ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`);
      for (const job of rows) {
        await client.query(`UPDATE jobs SET status='uncertain',error_code='WORKER_LEASE_EXPIRED',
          lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`, [job.id]);
        if (job.kind === 'intake') {
          await client.query(`UPDATE revisions SET status='uncertain',error_code='WORKER_LEASE_EXPIRED'
            WHERE id=$1 AND project_id=$2 AND status='running'`, [job.revision_id, job.project_id]);
        } else {
          await client.query(`UPDATE reviews SET status='uncertain' WHERE id=$1 AND project_id=$2
            AND status='running'`, [job.review_id, job.project_id]);
        }
        await audit(client, job, 'job.uncertain', { error_code: 'WORKER_LEASE_EXPIRED' });
      }
      return rows.length;
    });
  }

  async function claim() {
    return transaction(pool, async client => {
      const selected = await client.query(`SELECT id FROM jobs WHERE status='queued'
        ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`);
      if (!selected.rowCount) return null;
      const { rows: [job] } = await client.query(`UPDATE jobs SET status='running',
        stage=CASE WHEN kind='intake' THEN 'extracting' ELSE 'review_preparing' END,
        attempt=attempt+1,error_code=NULL,lease_token=$2,
        lease_expires_at=now()+($3 * interval '1 millisecond'),updated_at=now()
        WHERE id=$1 RETURNING *`, [selected.rows[0].id, randomUUID(), leaseMs]);
      const updated = job.kind === 'intake'
        ? await client.query(`UPDATE revisions SET status='running',error_code=NULL WHERE id=$1
            AND project_id=$2 AND status='queued'`, [job.revision_id, job.project_id])
        : await client.query(`UPDATE reviews SET status='running' WHERE id=$1 AND project_id=$2
            AND status='queued'`, [job.review_id, job.project_id]);
      if (updated.rowCount !== 1) fail('WORKER_RECORD_CONFLICT');
      await audit(client, job, 'job.started');
      return job;
    });
  }

  async function heartbeat(job) {
    const result = await pool.query(`UPDATE jobs SET lease_expires_at=now()+($3 * interval '1 millisecond'),
      updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now()`,
    [job.id, job.lease_token, leaseMs]);
    return result.rowCount === 1;
  }

  async function intent(job, stage, data) {
    const result = await pool.query(`UPDATE jobs SET stage=$3,stage_data=stage_data || $4::jsonb,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_expires_at>now()`,
    [job.id, job.lease_token, stage, JSON.stringify({ run_id: null, trace_id: null,
      completed_at: null, failed_at: null, idempotency_key: null, ...data })]);
    if (result.rowCount !== 1) fail('WORKER_LEASE_LOST');
    job.stage = stage;
  }

  async function finish(job, { status, code = null, data = {}, document, result }) {
    return transaction(pool, async client => {
      const lock = await client.query(`SELECT id FROM jobs WHERE id=$1 AND lease_token=$2
        AND status='running' AND lease_expires_at>now() FOR UPDATE`, [job.id, job.lease_token]);
      if (!lock.rowCount) return false;
      let updated;
      if (job.kind === 'intake') {
        updated = await client.query(`UPDATE revisions SET status=$3,error_code=$4,
          document_json=CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE document_json END
          WHERE id=$1 AND project_id=$2 AND status='running'`, [job.revision_id, job.project_id,
          status === 'succeeded' ? 'ready' : status, code, document ? JSON.stringify(document) : null]);
      } else {
        updated = await client.query(`UPDATE reviews SET status=$3,
          result=CASE WHEN $4::jsonb IS NOT NULL THEN $4::jsonb ELSE result END
          WHERE id=$1 AND project_id=$2 AND status='running'`, [job.review_id, job.project_id,
          status === 'succeeded' ? result.status : status, result ? JSON.stringify(result) : null]);
      }
      if (updated.rowCount !== 1) fail('WORKER_RECORD_CONFLICT');
      await client.query(`UPDATE jobs SET status=$3,error_code=$4,stage_data=stage_data || $5::jsonb,
        stage=CASE WHEN $3='succeeded' THEN 'completed' ELSE stage END,
        lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2`,
      [job.id, job.lease_token, status, code, JSON.stringify(data)]);
      await audit(client, job, 'job.' + status, { error_code: code,
        ...(data.trace_id ? { trace_id: data.trace_id } : {}), ...(data.run_id ? { run_id: data.run_id } : {}),
      });
      return true;
    });
  }

  async function execute(job) {
    let externalStarted = false, lostLease = false, pulseBusy = false;
    const references = {};
    const pulse = setInterval(async () => {
      if (pulseBusy) return;
      pulseBusy = true;
      try { if (!(await heartbeat(job))) lostLease = true; }
      catch { report('WORKER_HEARTBEAT_FAILED'); }
      finally { pulseBusy = false; }
    }, heartbeatMs);
    pulse.unref();
    try {
      let completion;
      if (job.kind === 'intake') {
        const { rows: [revision] } = await pool.query(`SELECT * FROM revisions WHERE id=$1 AND project_id=$2`,
          [job.revision_id, job.project_id]);
        if (!revision) fail('WORKER_RECORD_MISSING');
        validateSource(revision);
        const document = await extract(revision, { python });
        validateExtractedDocument(document, revision);
        if (lostLease) fail('WORKER_LEASE_LOST');
        await intent(job, 'extracted', { extracted_document: document, request_sha256: hashJson(document) });
        const selectedWorkspace=await require('./project-nora').binding(pool,job.project_id);
        if(selectedWorkspace){
          const normalized=verifyNormalization(document,require('./document-normalization').normalizeLocal(document));
          completion={status:'succeeded',document:normalized,data:{normalization:'local_lossless',completed_at:new Date().toISOString()}};
        }else{
        await assertLegacyNoraDispatch(pool, job.project_id);
        if (typeof pipelineToken !== 'string' || !pipelineToken.trim()) fail('PIPELINE_AUTH_REQUIRED');
        // Save the key before dispatch. JSONB can reorder keys, so reconstructing
        // this JSON.stringify-based identity from the stored document is unsafe.
        const idempotencyKey = hashJson([pipelineManifest.workspace_id, pipelineManifest.pipeline_id,
          pipelineManifest.publication_version, document]);
        await intent(job, 'pipeline_intent', { extracted_document: document,
          request_sha256: hashJson(document), idempotency_key: idempotencyKey,
          external_call: { kind: 'pipeline', attempt: job.attempt,
            started_at: new Date().toISOString(), pipeline_id: pipelineManifest.pipeline_id,
            publication_version: pipelineManifest.publication_version },
        });
        externalStarted = true;
        const response = await normalize(structuredClone(document), { expectedProjectId: job.project_id, token: pipelineToken });
        if (safeTraceId(response?.runId)) references.run_id = response.runId;
        if (!safeTraceId(response?.runId)) fail('NORA_RESULT_INVALID');
        const normalized = verifyNormalization(document, response.document);
        completion = { status: 'succeeded', document: normalized, data: {
          run_id: response.runId, idempotency_key: idempotencyKey,
          completed_at: new Date().toISOString(),
        } };
        }
      } else {
        await assertLegacyNoraDispatch(pool, job.project_id);
        if (typeof flowToken !== 'string' || !flowToken.trim()) fail('FLOW_AUTH_REQUIRED');
        const { rows: [stored] } = await pool.query(`SELECT * FROM reviews WHERE id=$1 AND project_id=$2`,
          [job.review_id, job.project_id]);
        if (!stored) fail('WORKER_RECORD_MISSING');
        const request = structuredClone(stored.request);
        checkRequest(request, job.project_id);
        if (request.baseline.document_id !== stored.document_id || request.current.document_id !== stored.document_id ||
            request.baseline.revision_id !== stored.baseline_revision_id || request.current.revision_id !== stored.current_revision_id ||
            request.request_id !== stored.id) fail('WORKER_RECORD_CONFLICT');
        if (lostLease) fail('WORKER_LEASE_LOST');
        await intent(job, 'review_intent', { request_sha256: hashJson(request),
          external_call: { kind: 'review', attempt: job.attempt, started_at: new Date().toISOString(),
            flow_slug: flowManifest.slug, publication_version: flowManifest.published_version || flowManifest.publication_version },
        });
        externalStarted = true;
        const response = await review(structuredClone(request), { expectedProjectId: job.project_id, token: flowToken });
        if (safeTraceId(response?.traceId)) references.trace_id = response.traceId;
        if (!safeTraceId(response?.traceId)) fail('NORA_RESULT_INVALID');
        validateResultSchema(response.review);
        const verified = finalizeReview(request, structuredClone(response.review));
        validateResultSchema(verified);
        completion = { status: 'succeeded', result: verified, data: {
          trace_id: response.traceId, completed_at: new Date().toISOString(),
        } };
      }
      const committed = !lostLease && await finish(job, completion);
      if (!committed) {
        await recoverExpired();
        return { jobId: job.id, status: 'discarded', code: 'WORKER_LEASE_LOST' };
      }
      return { jobId: job.id, status: 'succeeded' };
    } catch (error) {
      const failure = classifyFailure(error, externalStarted);
      const traceId = safeTraceId(error?.traceId);
      const runId = safeTraceId(error?.runId);
      const committed = !lostLease && await finish(job, { ...failure,
        data: { failed_at: new Date().toISOString(), ...references,
          ...(traceId ? { trace_id: traceId } : {}), ...(runId ? { run_id: runId } : {}) },
      });
      if (!committed) {
        await recoverExpired();
        return { jobId: job.id, status: 'discarded', code: 'WORKER_LEASE_LOST' };
      }
      return { jobId: job.id, ...failure };
    } finally { clearInterval(pulse); }
  }

  async function processOne() {
    // Public calls cannot accidentally overlap this worker's single active job.
    if (processing) return processing;
    processing = (async () => {
      await recoverExpired();
      const job = await claim();
      return job ? execute(job) : null;
    })();
    try { return await processing; } finally { processing = null; }
  }

  function start() {
    if (running) return;
    running = true;
    loop = (async () => {
      while (running) {
        try { const result = await processOne(); if (result) continue; }
        catch { report('WORKER_DATABASE_UNAVAILABLE'); }
        if (running) await new Promise(resolve => {
          const timer = setTimeout(() => { wake = undefined; resolve(); }, pollMs);
          wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
        });
      }
    })();
  }
  async function stop() { running = false; if (wake) wake(); if (loop) await loop; if (processing) await processing; }
  return { start, stop, processOne, recoverExpired };
}

module.exports = { createWorker, classifyFailure, safeErrorCode, verifyNormalization };
