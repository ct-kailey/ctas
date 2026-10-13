'use strict';
// Explicit live check against the existing synthetic domain-records project.
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  if (process.env.REGISTRATION_ALLOW_LIVE_NORA !== '1') throw new Error('Explicit live Nora opt-in required');
  const access = JSON.parse(fs.readFileSync('.local/production-access.json', 'utf8'));
  const fixture = JSON.parse(fs.readFileSync('platform/domain-records-production-smoke.json', 'utf8'));
  assert.equal(fixture.synthetic, true);
  const base = access.url.replace(/\/$/, ''), prefix = '/api/projects/' + fixture.project_id;
  let cookie, csrf;
  async function call(route, body) {
    const response = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept:'application/json', ...(cookie ? { Cookie:cookie } : {}), ...(body !== undefined ? { Origin:base, 'X-CSRF-Token':csrf || '', 'Content-Type':'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(60000), redirect:'error',
    });
    const data = await response.json();
    assert.equal(response.status, 200, route + ': ' + (data.error?.code || response.status));
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return data;
  }
  const login = await call('/api/auth/login', { email:access.email, password:access.password });
  csrf = login.csrfToken;
  try {
    const before = await call(prefix + '/documents');
    const cases = [
      {id:'existing-document-revision', body:{title:'합성 정산 정책 v3',text:'기존 합성 정산 정책의 세 번째 버전입니다. 정산 한도를 5건에서 50건으로 변경합니다.',record_kind:'specification',domain_id:fixture.domain_id},action:'new_revision',document:fixture.document_id},
      {id:'separate-slack-conversation',body:{title:'정산 한도 Slack 논의',text:'#qa-settlement 채널의 새로운 대화입니다. 정산 한도를 변경할지 다음 회의에서 검토하자는 논의이며 확정된 결정은 없습니다.',record_kind:'conversation',domain_id:fixture.domain_id},action:'new_document',document:null},
      {id:'filename-only',body:{title:'합성 정산 정책 v4',filename:'합성_정산_정책_v4.docx',text:'',record_kind:'specification',domain_id:fixture.domain_id},action:'new_document',document:null,maxConfidence:0.5},
    ];
    const results = [];
    for (const item of cases) {
      const started = Date.now(), result = await call(prefix + '/registration-suggestions', item.body);
      assert.equal(result.status, 'suggested');
      assert.equal(result.suggestion.action, item.action);
      assert.equal(result.suggestion.document_id, item.document);
      assert.equal(result.suggestion.domain_id, fixture.domain_id);
      assert.equal(result.suggestion.record_kind, item.body.record_kind);
      if (item.maxConfidence) assert.ok(result.suggestion.confidence <= item.maxConfidence);
      assert.ok(result.trace_id && result.request_id);
      results.push({id:item.id,passed:true,request_id:result.request_id,trace_id:result.trace_id,duration_ms:Date.now()-started,suggestion:result.suggestion,context:result.context,limitations:result.limitations});
    }
    assert.deepEqual(await call(prefix + '/documents'), before, 'Suggestion must not register records or move baselines');
    const {feed} = await call(prefix + '/feed');
    for (const result of results) assert.ok(feed.some(event => event.kind === 'registration.suggested' && event.entity_id === result.request_id));
    const report = {verified_at:new Date().toISOString(),url:base,synthetic:true,project_id:fixture.project_id,passed:results.length,results,documents_and_baselines_unchanged:true,audit_events_verified:true};
    fs.writeFileSync('platform/registration-production-smoke.json', JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:results.length,report:'platform/registration-production-smoke.json'}));
  } finally { await call('/api/auth/logout', {}); }
}
main().catch(error => { console.error('Registration smoke failed: ' + error.message); process.exitCode=1; });
