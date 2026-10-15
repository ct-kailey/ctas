'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/implementation-notes-state.mjs');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const revision = () => ({ id: uuid(1), status: 'ready', document_json: { extraction: { complete: true }, segments: [{ segment_id: 'p1', extraction_status: 'ok', text: '확인 전 화면은 목록으로 표시한다. 승인 후 검색을 추가한다.' }] } });

test('implementation note roles keep shared views read only and separate feedback from review', async () => {
  const { implementationNotePermissions } = await state();
  for (const role of ['owner', 'reviewer']) assert.deepEqual(implementationNotePermissions(role, null), { canWrite: true, canReview: true });
  assert.deepEqual(implementationNotePermissions('member', null), { canWrite: true, canReview: false });
  assert.deepEqual(implementationNotePermissions('viewer', null), { canWrite: false, canReview: false });
  for (const role of ['owner', 'reviewer', 'member', 'viewer']) assert.deepEqual(implementationNotePermissions(role, {}), { canWrite: false, canReview: false });
});

test('opening a manual record carries only source and task linkage, never inventing judgments', async () => {
  const { implementationNoteDraft } = await state();
  const draft = implementationNoteDraft({ source_revision_id: uuid(1), task_draft_id: uuid(2), title: 'source title', temporary_approach: 'must not seed' });
  assert.equal(draft.source_revision_id, uuid(1)); assert.equal(draft.task_draft_id, uuid(2));
  for (const key of ['title', 'uncertainty', 'temporary_approach', 'rationale', 'impact', 'replacement_condition']) assert.equal(draft[key], '');
});

test('result evidence must be an exact quote from a completely extracted ready source', async () => {
  const { implementationNoteEvidence } = await state();
  const source = revision(), quote = '승인 후 검색을 추가한다.';
  assert.deepEqual(implementationNoteEvidence(source, 'p1', quote), { type: 'revision', id: source.id, segment_id: 'p1', quote });
  for (const text of ['', ' ', '검색을 구현했습니다.', '  승인 후 검색을 추가한다.', 'x'.repeat(10001)]) assert.equal(implementationNoteEvidence(source, 'p1', text), null);
  assert.equal(implementationNoteEvidence(source, 'missing', quote), null);
  assert.equal(implementationNoteEvidence({ ...source, status: 'extracting' }, 'p1', quote), null);
  assert.equal(implementationNoteEvidence({ ...source, document_json: { ...source.document_json, extraction: { complete: false } } }, 'p1', quote), null);
  assert.equal(implementationNoteEvidence({ ...source, document_json: { ...source.document_json, segments: [{ ...source.document_json.segments[0], extraction_status: 'needs_review' }] } }, 'p1', quote), null);
});

test('manual create payload preserves literal evidence and requires every substantive judgment', async () => {
  const { implementationNoteCreatePayload, implementationNoteDraft } = await state();
  const draft = { ...implementationNoteDraft({ task_draft_id: uuid(2) }), title: ' 임시 목록 ', uncertainty: '검색 조건 확인 전', temporary_approach: '목록만 제공', rationale: '고객 확인 대기', impact: '검색 불가', replacement_condition: '검색 조건 확정' };
  const evidence = { type: 'revision', id: uuid(1), segment_id: 'p1', quote: '원문의  공백 보존' };
  const body = implementationNoteCreatePayload(draft, evidence, uuid(3));
  assert.equal(body.title, '임시 목록'); assert.deepEqual(body.evidence, [{ segment_id: 'p1', quote: evidence.quote }]); assert.equal(body.task_draft_id, uuid(2)); assert.equal(body.source_revision_id, uuid(1));
  assert.equal(body.status, undefined); assert.equal(body.approved, undefined); assert.equal(body.execution_status, undefined);
  for (const key of ['title', 'uncertainty', 'temporary_approach', 'rationale', 'impact', 'replacement_condition']) assert.throws(() => implementationNoteCreatePayload({ ...draft, [key]: '' }, evidence, uuid(3)));
  assert.throws(() => implementationNoteCreatePayload(draft, null, uuid(3)));
  assert.throws(() => implementationNoteCreatePayload({ ...draft, title: 'a'.repeat(301) }, evidence, uuid(3)));
  const gap = implementationNoteCreatePayload({ ...draft, kind: 'work_gap', temporary_approach: '' }, evidence, uuid(3));
  assert.equal(gap.temporary_approach, undefined);
});

test('review action matches record kind and never turns an archive state into task completion', async () => {
  const { implementationNoteReviewStatus, IMPLEMENTATION_NOTE_STATES } = await state();
  assert.equal(implementationNoteReviewStatus({ kind: 'temporary_decision', status: 'feedback_received' }), 'accepted');
  assert.equal(implementationNoteReviewStatus({ kind: 'work_gap', status: 'followup_created' }), 'resolved');
  for (const status of ['accepted', 'resolved']) assert.equal(implementationNoteReviewStatus({ kind: 'work_gap', status }), null);
  assert.equal(implementationNoteReviewStatus({ kind: 'unknown', status: 'open' }), null);
  assert.match(IMPLEMENTATION_NOTE_STATES.followup_created, /분석 요청/);
  assert.doesNotMatch(IMPLEMENTATION_NOTE_STATES.followup_created, /완료|해소/);
});

test('archive paging keeps all records, detects stale offsets and resets explicit refreshes', async () => {
  const { mergeImplementationNotesPage } = await state();
  const first = mergeImplementationNotesPage(null, { notes: [{ id: uuid(1) }, { id: uuid(2) }], total: 3, offset: 0, has_more: true, next_offset: 2 });
  const all = mergeImplementationNotesPage(first, { notes: [{ id: uuid(3) }], total: 3, offset: 2, has_more: false, next_offset: null });
  assert.deepEqual(all.notes.map(note => note.id), [uuid(1), uuid(2), uuid(3)]);
  assert.throws(() => mergeImplementationNotesPage(first, { notes: [{ id: uuid(3) }], total: 3, offset: 1, has_more: false, next_offset: null }));
  assert.throws(() => mergeImplementationNotesPage(first, { notes: [], total: 3, offset: 2, has_more: true, next_offset: 2 }));
  const refresh = mergeImplementationNotesPage(all, { notes: [{ id: uuid(4) }], total: 1, offset: 0, has_more: false, next_offset: null });
  assert.deepEqual(refresh.notes.map(note => note.id), [uuid(4)]);
});

test('partial development stays visibly partial in QA and does not weaken merge capability checks', async () => {
  const { automationExecutionLabel, automationMergeReadiness } = await import('../web/src/task-automation-state.mjs');
  const task = { status: 'qa', execution_status: 'ready', artifact: { implementation_report: { completion: 'partial' }, head_sha: 'a'.repeat(40), preview_url: 'https://preview.example.test', diff: '+ change', checks: [{ name: 'build', status: 'passed' }] } };
  assert.match(automationExecutionLabel(task), /부분 구현/);
  assert.equal(automationMergeReadiness(task, { merge: false }, { preview_origins: ['https://preview.example.test'] }).allowed, false);
  assert.equal(automationMergeReadiness({ ...task, status: 'blocked' }, { merge: true }, { preview_origins: ['https://preview.example.test'] }).allowed, false);
});

test('uncertainty mode defaults to strict and provisional requires an explicit saved value', async () => {
  const { automationUncertaintyMode } = await import('../web/src/task-automation-state.mjs');
  for (const value of [null, undefined, '', 'strict', 'unknown', true]) assert.equal(automationUncertaintyMode(value), 'strict');
  assert.equal(automationUncertaintyMode('provisional'), 'provisional');
});

test('concurrent feedback resets paginated history before a new note version can be used', async () => {
  const { mergeImplementationNoteHistory } = await state();
  const first = mergeImplementationNoteHistory(null, { note: { id: uuid(1), version: 3 }, history: [{ id: uuid(13) }, { id: uuid(12) }], history_offset: 0, history_has_more: true }, false);
  const next = { note: { id: uuid(1), version: 3 }, history: [{ id: uuid(11) }], history_offset: 2, history_has_more: false };
  assert.deepEqual(mergeImplementationNoteHistory(first, next, true).history.map(item => item.id), [uuid(13), uuid(12), uuid(11)]);
  assert.equal(mergeImplementationNoteHistory(first, { ...next, note: { id: uuid(1), version: 4 } }, true), null);
  assert.equal(first.note.version, 3); assert.equal(first.history.length, 2);
  assert.throws(() => mergeImplementationNoteHistory(first, { ...next, history_offset: 1 }, true));
  assert.throws(() => mergeImplementationNoteHistory(first, { ...next, history: [], history_has_more: true }, true));
});
