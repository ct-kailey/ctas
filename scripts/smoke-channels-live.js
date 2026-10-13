'use strict';

// Explicitly synthetic HTTP smoke. No real Discord/Slack/Teams/Kakao connection is made.
// Writes only to the newly created project; root runs this after deployment.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (process.env.CHANNEL_SMOKE_ALLOW_LIVE_NORA !== '1') throw Object.assign(Error('Explicit live Nora opt-in required'), { code: 'LIVE_OPT_IN_REQUIRED' });
  const access = JSON.parse(fs.readFileSync(process.env.CHANNEL_SMOKE_ACCESS_FILE || '.local/production-access.json', 'utf8'));
  const parsed = new URL(access.url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw Object.assign(Error('Expected an HTTPS app origin'), { code: 'INVALID_APP_ORIGIN' });
  }
  const base = parsed.origin;
  let cookie, csrf, loggedIn = false, step = 'login', failed;
  const report = { started_at: new Date().toISOString(), url: base, synthetic: true, real_channel_connected: false,
    status: 'running', checks: [], trace_ids: [] };
  async function call(route, { method = 'GET', body, expected = 200 } = {}) {
    const headers = { Accept: 'application/json', ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== 'GET' ? { Origin: base, 'X-CSRF-Token': csrf || '' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) };
    const response = await fetch(base + route, { method, headers, redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (response.status !== expected) throw Object.assign(Error(`HTTP ${response.status}`), {
      code: /^[A-Z][A-Z0-9_]{0,63}$/.test(data.error?.code || '') ? data.error.code : 'UNEXPECTED_HTTP_STATUS',
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return data;
  }
  async function waitInbox(prefix, id) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { item } = await call(prefix + '/channel-inbox/' + id);
      if (item.status === 'needs_review') {
        assert.equal(item.error_code, null, 'A real Nora analysis must complete without fallback');
        assert.match(item.trace_id, /^trc_[A-Za-z0-9_-]+$/);
        assert.ok(item.analysis && typeof item.analysis.summary === 'string');
        return item;
      }
      if (['failed', 'uncertain', 'accepted', 'dismissed'].includes(item.status)) {
        throw Object.assign(Error('Unexpected triage terminal state'), { code: 'TRIAGE_NOT_REVIEWABLE' });
      }
      await delay(1200);
    }
    throw Object.assign(Error('Triage wait exceeded'), { code: 'TRIAGE_WAIT_EXCEEDED' });
  }
  async function waitRevision(prefix, id) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { revision } = await call(prefix + '/revisions/' + id);
      if (revision.status === 'ready') return revision;
      if (['failed', 'uncertain'].includes(revision.status)) throw Object.assign(Error('Intake did not succeed'), { code: 'INTAKE_NOT_READY' });
      await delay(1200);
    }
    throw Object.assign(Error('Intake wait exceeded'), { code: 'INTAKE_WAIT_EXCEEDED' });
  }
  try {
    const login = await call('/api/auth/login', { method: 'POST', body: { email: access.email, password: access.password } });
    csrf = login.csrfToken; loggedIn = true;
    step = 'create_synthetic_project';
    const { project } = await call('/api/projects', { method: 'POST', expected: 201,
      body: { name: '합성 검증 · 대화 수집 ' + new Date().toISOString().slice(0, 16) } });
    report.project_id = project.id;
    const prefix = '/api/projects/' + project.id;
    const { domain } = await call(prefix + '/domains', { method: 'POST', expected: 201,
      body: { name: '합성 정산', description: '대화 이력 수집과 사람 검토를 검증하는 합성 업무 영역' } });
    report.domain_id = domain.id;
    const { source } = await call(prefix + '/channel-sources', { method: 'POST', expected: 201, body: {
      provider: 'discord', name: '합성 Discord · 정산 정책', external_workspace_id: 'synthetic-guild-' + randomUUID(),
      external_channel_id: 'synthetic-channel-' + randomUUID(), default_domain_id: domain.id,
    } });
    report.source_id = source.id;
    assert.equal(source.connection_status, 'not_connected');
    report.checks.push('Discord source is explicitly not connected to a real channel');

    step = 'ingest_and_deduplicate';
    const batch = { batch_id: 'synthetic-batch-' + randomUUID(), conversation_key: 'synthetic-settlement-thread', messages: [
      { event_id: 'synthetic-event-1', message_id: 'synthetic-message-1', kind: 'created', author: '합성 기획 담당자',
        text: '합성 검증 프로젝트의 정산 한도는 50건으로 최종 확정합니다. 팀 검토를 마쳤으며 이 값을 적용하기로 결정했습니다.',
        sent_at: '2026-09-27T10:00:00+09:00', changed_at: null, url: 'https://example.test/synthetic-discord/messages/1' },
      { event_id: 'synthetic-event-2', message_id: 'synthetic-message-2', kind: 'created', author: '합성 개발 담당자',
        text: '정산 한도를 50건으로 확정한 결정에 동의합니다. 이 합의 내용을 결정 이력에 보관하기로 했습니다.',
        sent_at: '2026-09-27T10:02:00+09:00', changed_at: null, url: 'https://example.test/synthetic-discord/messages/2' },
    ] };
    const ingestRoute = prefix + '/channel-sources/' + source.id + '/ingest';
    const first = await call(ingestRoute, { method: 'POST', expected: 202, body: batch });
    report.inbox_id = first.inbox.id;
    assert.equal(first.replayed, false);
    const sameBatch = await call(ingestRoute, { method: 'POST', expected: 202, body: batch });
    assert.equal(sameBatch.inbox.id, first.inbox.id); assert.equal(sameBatch.replayed, true);
    const sameEvents = await call(ingestRoute, { method: 'POST', expected: 202,
      body: { ...batch, batch_id: 'synthetic-receipt-' + randomUUID() } });
    assert.equal(sameEvents.inbox.id, first.inbox.id); assert.equal(sameEvents.replayed, true);
    assert.equal((await call(prefix + '/channel-inbox')).items.length, 1);
    report.checks.push('same batch and new batch with identical event set reuse one inbox item');

    step = 'wait_real_triage';
    const analyzed = await waitInbox(prefix, first.inbox.id);
    assert.equal(analyzed.analysis.classification, 'decision'); assert.equal(analyzed.analysis.record_kind, 'decision');
    assert.ok(analyzed.analysis.evidence_event_ids.length > 0);
    const evidenceIds = new Set(analyzed.input_snapshot.messages.map(message => message.event_id));
    assert.ok(analyzed.analysis.evidence_event_ids.every(id => evidenceIds.has(id)));
    assert.equal(analyzed.review, null); assert.equal(analyzed.document_id, null);
    assert.equal((await call(prefix + '/documents')).documents.length, 0);
    report.trace_ids.push(analyzed.trace_id);
    report.checks.push('published Nora decision analysis has scoped evidence and waits for review without creating a document');

    step = 'accept_and_wait_intake';
    const review = { title: '합성 검증 · 정산 한도 확정',
      text: '합성 대화 원문을 검토했습니다. 정산 한도를 50건으로 확정한 합의가 확인되어 결정 이력으로 보관합니다.',
      domain_id: domain.id, record_kind: 'decision', decided_on: '2026-09-27',
      reason: '자동 분석과 두 명의 합성 대화 원문을 대조한 운영 기능 검증입니다.', acknowledge_evidence: true };
    const acceptRoute = prefix + '/channel-inbox/' + first.inbox.id + '/accept';
    const accepted = (await call(acceptRoute, { method: 'POST', body: review })).item;
    assert.equal(accepted.status, 'accepted'); assert.equal(accepted.review.acknowledge_evidence, true);
    report.document_id = accepted.document_id; report.revision_id = accepted.revision_id;
    const repeated = (await call(acceptRoute, { method: 'POST', body: review })).item;
    assert.equal(repeated.document_id, accepted.document_id); assert.equal(repeated.revision_id, accepted.revision_id);
    const ready = await waitRevision(prefix, accepted.revision_id);
    assert.equal(ready.history.source_type, 'discord'); assert.equal(ready.history.channel, source.name);
    assert.equal(ready.history.decided_on, '2026-09-27'); assert.equal(ready.domain_id, domain.id);
    assert.ok(ready.source_text.includes(review.text));
    for (const message of batch.messages) { assert.ok(ready.source_text.includes(message.text)); assert.ok(ready.source_text.includes(message.sent_at)); }
    const docs = (await call(prefix + '/documents')).documents;
    assert.equal(docs.length, 1); assert.equal(docs[0].baseline_revision_id, null);
    report.checks.push('explicit review creates one Discord decision record with original messages and source times',
      'real intake reaches ready while baseline stays unpublished', 'accept replay is idempotent');

    step = 'edit_source_and_preserve_accepted_record';
    const editedBatch = { batch_id: 'synthetic-edit-' + randomUUID(), conversation_key: batch.conversation_key,
      messages: [{ ...batch.messages[0], event_id: 'synthetic-event-1-edited', kind: 'updated',
        text: '앞서 확정한 정산 한도 50건 결정을 철회합니다. 정산 한도는 다시 검토하며 아직 새 값은 결정하지 않았습니다.',
        changed_at: '2026-09-27T10:10:00+09:00' }] };
    const edited = (await call(ingestRoute, { method: 'POST', expected: 202, body: editedBatch })).inbox;
    report.followup_inbox_id = edited.id; assert.notEqual(edited.id, first.inbox.id);
    const original = (await call(prefix + '/channel-inbox/' + first.inbox.id)).item;
    assert.equal(original.status, 'accepted'); assert.equal(original.evidence_changed, true); assert.equal(original.provenance_changed, true);
    assert.deepEqual(original.review, accepted.review); assert.equal(original.revision_id, accepted.revision_id);
    const originalRevision = (await call(prefix + '/revisions/' + accepted.revision_id)).revision;
    assert.equal(originalRevision.source_text, ready.source_text);
    const followup = await waitInbox(prefix, edited.id); report.trace_ids.push(followup.trace_id);
    const dismissed = (await call(prefix + '/channel-inbox/' + edited.id + '/dismiss', { method: 'POST',
      body: { reason: '합성 원본 수정 감지와 검토 동작을 확인했으므로 후속 검증 후보는 제외합니다.' } })).item;
    assert.equal(dismissed.status, 'dismissed');
    report.checks.push('source edit flags accepted record provenance without changing its immutable original',
      'followup analysis completes and is explicitly dismissed');

    step = 'pause_source';
    const paused = (await call(prefix + '/channel-sources/' + source.id, { method: 'PATCH', body: { enabled: false } })).source;
    assert.equal(paused.enabled, false); assert.equal(paused.connection_status, 'not_connected');
    const blocked = await call(ingestRoute, { method: 'POST', expected: 409, body: {
      ...batch, batch_id: 'synthetic-paused-' + randomUUID(),
      messages: [{ ...batch.messages[0], event_id: 'synthetic-paused-event', message_id: 'synthetic-paused-message' }],
    } });
    assert.equal(blocked.error.code, 'CHANNEL_PAUSED');
    const finalItems = (await call(prefix + '/channel-inbox')).items;
    assert.equal(finalItems.length, 2); assert.ok(finalItems.every(item => ['accepted', 'dismissed'].includes(item.status)));
    assert.equal((await call(prefix + '/documents')).documents.length, 1);
    report.checks.push('paused source rejects fresh intake and leaves no queued smoke items');
    report.status = 'passed';
  } catch (error) {
    failed = error; report.status = 'failed'; report.failed_step = step;
    report.error_code = /^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code || '') ? error.code : 'SMOKE_CHECK_FAILED';
  } finally {
    if (loggedIn) {
      try { await call('/api/auth/logout', { method: 'POST', body: {} }); report.logged_out = true; }
      catch { report.logged_out = false; report.status = 'failed'; report.error_code ||= 'SMOKE_LOGOUT_FAILED'; failed ||= Error('Logout failed'); }
    }
    report.completed_at = new Date().toISOString();
    fs.writeFileSync('platform/channel-production-smoke.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  }
  if (failed) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error('Channel smoke failed: ' + (/^[A-Z][A-Z0-9_]{0,63}$/.test(error?.code || '') ? error.code : 'SMOKE_SETUP_FAILED'));
  process.exitCode = 1;
});

module.exports = { main };
