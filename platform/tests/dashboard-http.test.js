'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { createPool, migrate } = require('../server/db');
const { sha256 } = require('../server/auth');
const { createApp } = require('../server/server');
const { readDashboard, readAttention } = require('../server/dashboard');

test('live dashboard reads existing project records with bounded lists and exact scoped totals', {
  skip: !process.env.TEST_DATABASE_URL,
}, async t => {
  const schema = 'dashboard_' + randomUUID().replaceAll('-', '');
  const admin = createPool(process.env.TEST_DATABASE_URL);
  let pool, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema},public` });
  await migrate(pool);
  const users = {}, cookies = {};
  for (const role of ['owner', 'viewer', 'outsider']) {
    users[role] = (await pool.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id', [`${role}@dashboard.test`, role, 'unused'])).rows[0].id;
    const token = randomBytes(32).toString('hex');
    await pool.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,'unused',now()+interval '1 hour')", [sha256(token), users[role]]);
    cookies[role] = 'ains_session=' + token;
  }
  const project = async (id, owner = users.owner) => {
    await pool.query('INSERT INTO projects(id,name) VALUES($1,$2)', [id, id + ' name']);
    await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [id, owner]);
  };
  await project('populated'); await project('empty'); await project('private', users.outsider);
  await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('populated',$1,'viewer')", [users.viewer]);
  server = createApp({ pool }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (id, as = 'owner') => fetch(`${base}/api/projects/${id}/dashboard`, { headers: as ? { Cookie: cookies[as] } : {} });
  const attention = (id, as = 'owner') => fetch(`${base}/api/projects/${id}/attention`, { headers: as ? { Cookie: cookies[as] } : {} });

  await t.test('authentication and membership apply, including empty and unknown projects', async () => {
    assert.equal((await get('populated', null)).status, 401);
    assert.equal((await get('populated', 'outsider')).status, 404);
    assert.equal((await get('private')).status, 404);
    assert.equal((await get('unknown')).status, 404);
    const response = await get('empty');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.deepEqual(data.project, { id: 'empty', name: 'empty name', role: 'owner' });
    assert.deepEqual(Object.values(data.counts), Array(9).fill(0));
    assert.deepEqual(data.items, { documents: [], reviews: [], tasks: [], questions: [], activity: [] });
    assert.equal((await attention('populated', null)).status, 401);
    assert.equal((await attention('populated', 'outsider')).status, 404);
    assert.equal((await attention('private')).status, 404);
    assert.equal((await attention('unknown')).status, 404);
    const emptyAttention = await attention('empty');
    assert.equal(emptyAttention.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await emptyAttention.json(), { items: [], counts: { all: 0, urgent: 0, check: 0, info: 0 }, truncated: false });
  });

  // All fixtures are synthetic. They do not invoke Nora, jobs, messaging, or Git.
  const docs = [], revisions = [];
  for (let i = 0; i < 10; i++) {
    const created = i === 9 ? '2026-03-01T00:00:00Z' : '2026-01-01T00:00:00Z';
    docs.push((await pool.query("INSERT INTO documents(project_id,title,created_at) VALUES('populated',$1,$2) RETURNING id", [`Document ${i}`, created])).rows[0].id);
    const revisionCount = i === 0 ? 17 : i === 9 ? 0 : 1;
    for (let r = 0; r < revisionCount; r++) {
      const createdAt = new Date(Date.UTC(2026, 1, i + 1, 0, r)).toISOString();
      const result = await pool.query(`INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,status,created_by,created_at)
        VALUES('populated',$1,'synthetic.txt','text/plain',$2,$3,$4,$5,$6) RETURNING id`,
      [docs[i], 'a'.repeat(64), Buffer.from('SOURCE_BODY_MUST_NOT_LEAK'), i === 8 ? 'uncertain' : 'queued', users.owner, createdAt]);
      if (i === 0) revisions.push(result.rows[0].id);
    }
  }
  const reviewStatuses = [...Array(7).fill('needs_review'), 'no_change', 'queued', 'running', 'blocked', 'failed', 'uncertain', 'approved', 'rejected', 'published'];
  for (const [i, status] of reviewStatuses.entries()) {
    await pool.query(`INSERT INTO reviews(project_id,document_id,baseline_revision_id,current_revision_id,request,status,decision,created_by,created_at)
      VALUES('populated',$1,$2,$3,'{"private":"SOURCE_BODY_MUST_NOT_LEAK"}',$4,$5,$6,$7)`,
    [docs[0], revisions[0], revisions[i + 1], status, ['approved', 'rejected', 'published'].includes(status) ? '{}' : null, users.owner, new Date(Date.UTC(2026, 1, 1, 0, i)).toISOString()]);
  }
  for (const [i, status] of ['queued', 'running', 'succeeded', 'failed', 'uncertain'].entries()) {
    await pool.query("INSERT INTO jobs(project_id,kind,revision_id,status) VALUES('populated','intake',$1,$2)", [revisions[i], status]);
  }
  for (const [i, status] of [...Array(8).fill('pending'), 'merged', 'merged', 'merged', 'rejected', 'replaced'].entries()) {
    const candidate = randomUUID();
    await pool.query(`INSERT INTO context_candidates(id,project_id,base_version,payload,content_sha256,request_sha256,status,created_by,decision)
      VALUES($1,'populated',0,'{}',$2,$2,$3,$4,$5)`, [candidate, 'b'.repeat(64), status, users.owner, status === 'pending' ? null : '{}']);
    if (status === 'merged') await pool.query(`INSERT INTO context_records(id,project_id,candidate_id,context_version,kind,title,body,occurred_at,payload,content_sha256,created_by,reviewed_by)
      VALUES($1,'populated',$2,$3,'decision','Approved decision','SOURCE_BODY_MUST_NOT_LEAK',now(),'{}',$4,$5,$5)`, [randomUUID(), candidate, i - 7, 'b'.repeat(64), users.owner]);
  }
  const plan = randomUUID();
  await pool.query(`INSERT INTO implementation_plans(id,project_id,requested_revision_ids,request_sha256,input_snapshot,input_sha256,created_by)
    VALUES($1,'populated',$2,$3,'{}',$3,$4)`, [plan, [revisions[0]], 'c'.repeat(64), users.owner]);
  for (const [i, status] of ['todo', 'in_progress', 'blocked', 'qa', 'todo', 'todo', 'todo', 'todo', 'done', 'done'].entries()) {
    const source = { id: `TASK-${i + 1}`, title: `Task ${i}`, description: 'SOURCE_BODY_MUST_NOT_LEAK' };
    await pool.query(`INSERT INTO work_items(project_id,plan_id,source_task_id,source_task,status,blocker,due_on,created_by,updated_at)
      VALUES('populated',$1,$2,$3,$4,$5,$6,$7,$8)`, [plan, source.id, JSON.stringify(source), status, status === 'blocked' ? 'Awaiting confirmation' : '', i === 7 ? null : '2026-10-20', users.owner, new Date(Date.UTC(2026, 1, i + 1)).toISOString()]);
  }
  for (const [i, status] of ['draft', 'waiting', 'answered_pending', 'waiting', 'draft', 'draft', 'draft', 'waiting', 'resolved', 'cancelled'].entries()) {
    await pool.query(`INSERT INTO project_questions(id,project_id,title,question,recipient,channel,assigned_to,created_by,asked_at,due_at,status,request_sha256,updated_at)
      VALUES($1,'populated',$2,'SOURCE_BODY_MUST_NOT_LEAK','client@example.test','email',$3,$3,now(),$4,$5,$6,$7)`, [randomUUID(), `Question ${i}`, users.owner, i === 7 ? null : '2026-10-20T03:00:00Z', status, 'd'.repeat(64), new Date(Date.UTC(2026, 1, i + 1)).toISOString()]);
  }
  for (const kind of ['proposal', 'estimate', 'contract']) await pool.query("INSERT INTO commercial_documents(project_id,kind,title,created_by) VALUES('populated',$1,$2,$3)", [kind, 'Commercial ' + kind, users.owner]);
  for (let i = 0; i < 9; i++) await pool.query("INSERT INTO events(project_id,kind,entity_id,detail,created_at) VALUES('populated','synthetic.'||$1,'synthetic','{\"private\":\"SOURCE_BODY_MUST_NOT_LEAK\"}',$2)", [String(i), new Date(Date.UTC(2026, 1, i + 1)).toISOString()]);
  await pool.query("INSERT INTO documents(project_id,title) VALUES('private','PRIVATE_PROJECT_MUST_NOT_LEAK')");
  await pool.query("INSERT INTO events(project_id,kind,entity_id) VALUES('private','PRIVATE_PROJECT_MUST_NOT_LEAK','private')");

  await t.test('totals are independent of six-item limits and terminal states are excluded', async () => {
    const response = await get('populated', 'viewer');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.project, { id: 'populated', name: 'populated name', role: 'viewer' });
    assert.deepEqual(data.counts, { documents: 10, revisions: 25, pending_reviews: 8, failed_jobs: 2, context_entries: 3, context_pending: 8, open_tasks: 8, open_questions: 8, commercial_documents: 3 });
    for (const items of Object.values(data.items)) assert.equal(items.length, 6);
    assert.deepEqual({ ...data.items.documents[0], updated_at: Date.parse(data.items.documents[0].updated_at) }, { id: docs[9], title: 'Document 9', status: 'draft', updated_at: Date.parse('2026-03-01T00:00:00Z') });
    assert.equal(data.items.documents[1].status, 'uncertain');
    assert.equal(data.items.reviews[0].status, 'no_change');
    assert.ok(data.items.reviews.every(item => ['needs_review', 'no_change'].includes(item.status)));
    assert.equal(data.items.tasks[0].title, 'Task 7');
    assert.equal(data.items.tasks[0].due_at, null);
    assert.equal(data.items.tasks[1].due_at, '2026-10-20');
    assert.equal(data.items.questions[0].title, 'Question 7');
    assert.equal(data.items.questions[0].due_at, null);
    assert.equal(Date.parse(data.items.questions[1].due_at), Date.parse('2026-10-20T03:00:00Z'));
    assert.equal(data.items.activity[0].kind, 'synthetic.8');
    assert.doesNotMatch(JSON.stringify(data), /SOURCE_BODY_MUST_NOT_LEAK|PRIVATE_PROJECT_MUST_NOT_LEAK|password_hash|csrf_token/);
  });

  await t.test('attention reflects real unresolved work, deadline semantics, and source destinations', async () => {
    await project('attention');
    await pool.query("INSERT INTO memberships(project_id,user_id,role) VALUES('attention',$1,'viewer')", [users.viewer]);
    const doc = (await pool.query("INSERT INTO documents(project_id,title) VALUES('attention','알림 검증 문서') RETURNING id")).rows[0].id;
    const versions = [];
    for (let i = 0; i < 3; i++) versions.push((await pool.query(`INSERT INTO revisions(project_id,document_id,filename,mime_type,sha256,content,created_by)
      VALUES('attention',$1,'sample.txt','text/plain',$2,$3,$4) RETURNING id`, [doc, 'a'.repeat(64), Buffer.from('SOURCE_BODY_MUST_NOT_LEAK'), users.owner])).rows[0].id);
    for (const [i, status] of ['needs_review', 'no_change'].entries()) await pool.query(`INSERT INTO reviews(project_id,document_id,baseline_revision_id,current_revision_id,request,status,created_by)
      VALUES('attention',$1,$2,$3,'{}',$4,$5)`, [doc, versions[0], versions[i + 1], status, users.owner]);
    for (const [i, status] of ['failed', 'uncertain'].entries()) await pool.query("INSERT INTO jobs(project_id,kind,revision_id,status,stage_data) VALUES('attention','intake',$1,$2,'{\"private\":\"SOURCE_BODY_MUST_NOT_LEAK\"}')", [versions[i], status]);
    const candidate = randomUUID();
    await pool.query(`INSERT INTO context_candidates(id,project_id,base_version,payload,content_sha256,request_sha256,created_by)
      VALUES($1,'attention',0,'{"title":"검토할 결정","body":"SOURCE_BODY_MUST_NOT_LEAK"}',$2,$2,$3)`, [candidate, 'b'.repeat(64), users.owner]);
    const questionFixtures = [
      ['draft', '질문 초안', 1, 0], ['draft', '기한이 지났지만 미전달인 초안', -1, 0],
      ['waiting', '정상 응답 대기', 1, 0], ['waiting', '답변 기한 초과', -1, 0],
      ['waiting', '기한 없이 3일 이상 응답 대기', null, -4], ['answered_pending', '기한 후 도착한 답변 검토', -1, 0],
      ['resolved', '확정된 질문', -1, -4], ['cancelled', '취소된 질문', -1, -4],
    ];
    for (const [status, title, dueDays, waitingDays] of questionFixtures) await pool.query(`INSERT INTO project_questions(id,project_id,title,question,recipient,channel,assigned_to,created_by,asked_at,waiting_since,due_at,status,request_sha256)
      VALUES($1,'attention',$2,'SOURCE_BODY_MUST_NOT_LEAK','client@example.test','email',$3,$3,now()-interval '5 days',now()+$4*interval '1 day',now()+$5*interval '1 day',$6,$7)`,
    [randomUUID(), title, users.owner, waitingDays, dueDays, status, 'd'.repeat(64)]);
    const alertPlan = randomUUID();
    await pool.query(`INSERT INTO implementation_plans(id,project_id,requested_revision_ids,request_sha256,input_snapshot,input_sha256,created_by)
      VALUES($1,'attention',$2,$3,'{}',$3,$4)`, [alertPlan, [versions[0]], 'c'.repeat(64), users.owner]);
    const taskFixtures = [['blocked', '보류 작업', null], ['blocked', '마감 지난 보류 작업', -1], ['todo', '마감 지난 업무', -1], ['todo', '오늘 마감 업무', 0], ['done', '완료된 업무', -1]];
    for (const [i, [status, title, days]] of taskFixtures.entries()) await pool.query(`INSERT INTO work_items(project_id,plan_id,source_task_id,source_task,status,blocker,due_on,created_by)
      VALUES('attention',$1,$2,$3,$4,$5,(now() AT TIME ZONE 'Asia/Seoul')::date+$6::integer,$7)`,
    [alertPlan, `TASK-${i + 1}`, JSON.stringify({ id: `TASK-${i + 1}`, title }), status, status === 'blocked' ? 'SOURCE_BODY_MUST_NOT_LEAK' : '', days, users.owner]);
    const source = (await pool.query("INSERT INTO channel_sources(project_id,provider,name,external_channel_id,created_by) VALUES('attention','slack','수집 채널','example-channel',$1) RETURNING id", [users.owner])).rows[0].id;
    for (const [i, status] of ['needs_review', 'failed', 'uncertain', 'needs_review', 'queued', 'running', 'dismissed'].entries()) await pool.query(`INSERT INTO channel_inbox(id,project_id,source_id,batch_id,conversation_key,batch_sha256,input_snapshot,input_sha256,evidence_sha256,message_ids,status,evidence_changed,created_by,review)
      VALUES($1,'attention',$2,$3,$3,$4,'{"private":"SOURCE_BODY_MUST_NOT_LEAK"}',$4,$4,ARRAY['message'],$5,$6,$7,$8)`,
    [randomUUID(), source, `batch-${i}`, String(i).repeat(64), status, i === 3, users.owner, status === 'dismissed' ? '{}' : null]);

    const response = await attention('attention', 'viewer');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.counts, { all: 18, urgent: 8, check: 9, info: 1 });
    assert.equal(data.truncated, false);
    assert.equal(data.items.length, 18);
    assert.equal(new Set(data.items.map(item => item.id)).size, 18);
    assert.deepEqual(data.items.map(item => item.grade), [...Array(8).fill('urgent'), ...Array(9).fill('check'), 'info']);
    const byRule = rule => data.items.filter(item => item.rule === rule);
    assert.equal(byRule('question_draft').length, 2);
    for (const rule of ['review_pending', 'review_no_change', 'job_failed', 'job_uncertain', 'context_pending', 'question_waiting', 'question_waiting_long', 'question_overdue', 'question_answer_review', 'task_blocked', 'task_blocked_overdue', 'task_overdue', 'channel_review', 'channel_failed', 'channel_uncertain', 'channel_evidence_changed']) assert.equal(byRule(rule).length, 1, rule);
    assert.equal(byRule('question_answer_review')[0].grade, 'check');
    assert.equal(byRule('channel_evidence_changed')[0].grade, 'check');
    const targetKeys = { review: ['reviews', 'reviewId'], job: ['documents', 'revisionId'], context: ['context', 'candidateId'], question: ['questions', 'questionId'], task: ['work-items', 'workItemId'], channel: ['channels', 'inboxId'] };
    for (const item of data.items) {
      assert.equal(item.tab, targetKeys[item.kind][0]);
      assert.deepEqual(Object.keys(item.target), [targetKeys[item.kind][1]]);
      assert.match(item.id, new RegExp('^' + item.kind + ':[a-f0-9-]{36}$'));
      assert.ok(Number.isFinite(Date.parse(item.created_at)));
      assert.ok(item.title && item.description);
    }
    assert.doesNotMatch(JSON.stringify(data), /SOURCE_BODY_MUST_NOT_LEAK|PRIVATE_PROJECT_MUST_NOT_LEAK|오늘 마감 업무|완료된 업무|확정된 질문|취소된 질문|password_hash|csrf_token/);
    assert.deepEqual(await (await attention('attention')).json(), data, 'reading does not acknowledge or remove alerts');

    await pool.query("UPDATE context_candidates SET status='rejected',decision='{}' WHERE id=$1", [candidate]);
    const updated = await (await attention('attention')).json();
    assert.equal(updated.counts.all, 17);
    assert.ok(!updated.items.some(item => item.id === `context:${candidate}`), 'source resolution removes derived alert');

    await pool.query(`INSERT INTO context_candidates(id,project_id,base_version,payload,content_sha256,request_sha256,created_by,created_at)
      SELECT gen_random_uuid(),'attention',0,jsonb_build_object('title','추가 결정 '||g),$1,$1,$2,'2026-01-01'::timestamptz FROM generate_series(1,100) g`, ['b'.repeat(64), users.owner]);
    const limited = await (await attention('attention')).json();
    assert.deepEqual(limited.counts, { all: 117, urgent: 8, check: 108, info: 1 });
    assert.equal(limited.items.length, 100);
    assert.equal(limited.truncated, true);
    assert.deepEqual(limited.items.slice(0, 8).map(item => item.grade), Array(8).fill('urgent'));
    assert.deepEqual(await (await attention('attention')).json(), limited, 'ties have a stable ID ordering');
  });

  await t.test('summary itself succeeds in a read-only transaction and rechecks membership', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const data = await readDashboard(client, 'populated', users.owner);
      assert.equal(data.counts.documents, 10);
      await assert.rejects(() => readDashboard(client, 'populated', users.outsider), { code: 'NOT_FOUND' });
      const alerts = await readAttention(client, 'attention', users.owner);
      assert.equal(alerts.counts.all, 117);
      await assert.rejects(() => readAttention(client, 'attention', users.outsider), { code: 'NOT_FOUND' });
    } finally { await client.query('ROLLBACK'); client.release(); }
    await pool.query("DELETE FROM memberships WHERE project_id='populated' AND user_id=$1", [users.viewer]);
    assert.equal((await get('populated', 'viewer')).status, 404);
    assert.equal((await attention('populated', 'viewer')).status, 404);
    assert.deepEqual((await (await get('empty')).json()).counts.documents, 0);
  });
});
