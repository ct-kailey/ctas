'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/project-journey-state.mjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const event = (n, type = 'revision') => ({ id: id(n), type, stage: 'requirements', title: `기록 ${n}`, occurred_at: '2026-10-14T15:00:00.000001Z', recorded_at: '2026-10-15T04:00:00Z' });
const snapshot = '2026-10-15T05:00:00.123456Z';
const page = (events, total, next_cursor = null) => ({ events, total, next_cursor, has_more: Boolean(next_cursor), snapshot_at: snapshot });
const progress = change => ({ scope: 'execution_tasks', total: 5, done: 1, todo: 1, in_progress: 1, qa: 1, blocked: 1, percent: 20, unvalidated_drafts: 20, open_work_gaps: 3, open_temporary_decisions: 2, completed_partial_tasks: 1, ...change });

test('journey dates use inclusive KST days and exclusive next-day API boundaries', async () => {
  const { journeyDateRange, journeyOccurrence } = await state();
  assert.deepEqual(journeyDateRange('2026-10-15', '2026-10-15'), { from: '2026-10-14T15:00:00.000Z', to: '2026-10-15T15:00:00.000Z' });
  assert.deepEqual(journeyDateRange('2024-02-29', '2024-02-29'), { from: '2024-02-28T15:00:00.000Z', to: '2024-02-29T15:00:00.000Z' });
  assert.deepEqual(journeyDateRange(), {});
  assert.deepEqual(journeyDateRange('', '2026-12-31'), { to: '2026-12-31T15:00:00.000Z' });
  assert.equal(journeyOccurrence('2026-10-15T00:00'), '2026-10-14T15:00:00.000Z');
  assert.equal(journeyOccurrence('2026-10-15T23:59'), '2026-10-15T14:59:00.000Z');
  for (const date of ['2026-02-29', '2026-04-31', '2026-1-1', '2026-13-01']) assert.throws(() => journeyDateRange(date, ''), /날짜/);
  assert.throws(() => journeyDateRange('2026-10-16', '2026-10-15'), /종료일/);
  for (const date of ['2026-10-15', '2026-10-15T24:00', '2026-10-15T12:60', '2026-10-15T00:00Z']) assert.throws(() => journeyOccurrence(date));
});

test('day groups retain same-timestamp events across KST midnight, without timezone guessing', async () => {
  const { journeyDay, groupJourneyEvents, journeyDateTime, journeyLocalDateTime } = await state();
  const before = { ...event(1), occurred_at: '2026-10-14T14:59:59.999999Z' }, after = event(2), same = event(3);
  assert.equal(journeyDay(before.occurred_at), '2026-10-14'); assert.equal(journeyDay(after.occurred_at), '2026-10-15');
  assert.equal(journeyDay('2026-10-15T00:00:00+09:00'), '2026-10-15');
  assert.deepEqual(groupJourneyEvents([before, after, same]), [{ day: '2026-10-14', events: [before] }, { day: '2026-10-15', events: [after, same] }]);
  for (const value of [null, 'bad', '2026-10-15', '2026-10-15T12:00:00']) { assert.equal(journeyDay(value), 'unknown'); assert.equal(journeyDateTime(value), '시각 정보 없음'); }
  assert.equal(journeyLocalDateTime('2026-10-14T15:00:00Z'), '2026-10-15T00:00');
});

test('query preserves date/stage/type filters and encodes cursor without adding unknown parameters', async () => {
  const { journeyEventQuery } = await state();
  const filter = { stage: 'contract', type: 'milestone', from: '2026-10-15', to: '2026-10-15' };
  const first = new URLSearchParams(journeyEventQuery(filter)), next = new URLSearchParams(journeyEventQuery(filter, 'opaque/+?='));
  for (const [key, value] of first) assert.equal(next.get(key), value);
  assert.equal(next.get('cursor'), 'opaque/+?='); assert.equal(next.get('limit'), '12');
  for (const value of ['constructor', '__proto__', 'missing']) { assert.throws(() => journeyEventQuery({ stage: value })); assert.throws(() => journeyEventQuery({ type: value })); }
});

test('execution progress excludes unvalidated drafts and open gaps while retaining both warnings', async () => {
  const { journeyProgress } = await state();
  const value = journeyProgress(progress());
  assert.equal(value.percent, 20); assert.equal(value.total, 5); assert.equal(value.unvalidated_drafts, 20); assert.equal(value.open_work_gaps, 3);
  const complete = journeyProgress(progress({ total: 1, done: 1, todo: 0, in_progress: 0, qa: 0, blocked: 0, percent: 100 }));
  assert.equal(complete.percent, 100); assert.equal(complete.open_work_gaps, 3); assert.equal(complete.completed_partial_tasks, 1);
  const empty = journeyProgress(progress({ total: 0, done: 0, todo: 0, in_progress: 0, qa: 0, blocked: 0, percent: 0 }));
  assert.equal(empty.percent, null); assert.equal(empty.unvalidated_drafts, 20);
  for (const patch of [{ total: 10 }, { done: -1 }, { percent: NaN }, { percent: 100 }, { total: '5' }, { scope: 'all_events' }]) assert.throws(() => journeyProgress(progress(patch)), /진행률|완료율/);
});

test('timeline cursor pagination retains more than 200 records and identical timestamps', async () => {
  const { mergeJourneyPage } = await state();
  const all = Array.from({ length: 253 }, (_, n) => event(n)); let current = null;
  for (let offset = 0; offset < all.length; offset += 50) {
    const cursor = current?.next_cursor || '', next = offset + 50 < all.length ? `cursor_${offset + 50}` : null;
    current = mergeJourneyPage(current, page(all.slice(offset, offset + 50), all.length, next), cursor);
  }
  assert.deepEqual(current.events, all); assert.equal(current.has_more, false); assert.equal(current.total, 253); assert.equal(current.snapshot_at, snapshot);
});

test('timeline identity is type+ID; duplicates do not replace first record and refresh resets snapshot', async () => {
  const { mergeJourneyPage } = await state();
  const first = mergeJourneyPage(null, page([event(1)], 3, 'a'));
  const next = mergeJourneyPage(first, page([{ ...event(1), title: '늦은 중복' }, event(1, 'milestone'), event(2)], 3), 'a');
  assert.deepEqual(next.events, [event(1), event(1, 'milestone'), event(2)]); assert.equal(first.events.length, 1);
  assert.deepEqual(mergeJourneyPage(next, { ...page([], 0), snapshot_at: '2026-10-15T05:01:00Z' }).events, []);
});

test('cursor paging rejects snapshot changes, wrong cursor, cycles, stalled pages and malformed data', async () => {
  const { mergeJourneyPage } = await state();
  const first = mergeJourneyPage(null, page([event(1)], 3, 'a'));
  assert.throws(() => mergeJourneyPage(first, page([event(2)], 3, 'b'), 'wrong'), /기준/);
  assert.throws(() => mergeJourneyPage(first, { ...page([event(2)], 3, 'b'), snapshot_at: '2026-10-15T05:01:00Z' }, 'a'), /기준/);
  assert.throws(() => mergeJourneyPage(first, page([event(2)], 4, 'b'), 'a'), /기준/);
  assert.throws(() => mergeJourneyPage(first, page([event(2)], 3, 'a'), 'a'), /이동/);
  const second = mergeJourneyPage(first, page([event(2)], 3, 'b'), 'a');
  assert.throws(() => mergeJourneyPage(second, page([event(3)], 3, 'a'), 'b'), /이동/);
  assert.throws(() => mergeJourneyPage(first, page([event(1)], 3, 'b'), 'a'), /반복/);
  for (const patch of [{ events: [] }, { events: [event(1, 'constructor')] }, { events: [{ ...event(1), id: 'invalid' }] }, { events: [{ ...event(1), occurred_at: '2026-10-15' }] }, { total: -1 }, { has_more: 'true' }, { next_cursor: '' }]) assert.throws(() => mergeJourneyPage(null, { ...page([event(1)], 3, 'a'), ...patch }));
});

test('source refs only allow internal typed UUIDs, dedupe by type and never accept a URL destination', async () => {
  const { journeySourceRefs } = await state();
  const refs = [{ type: 'revision', id: id(1), title: '<script>data</script>' }, { type: 'revision', id: id(1) }, { type: 'analysis', id: id(1) }, { type: 'constructor', id: id(2) }, { type: 'revision', id: 'https://example.test' }, { type: 'revision', url: 'javascript:alert(1)' }];
  assert.deepEqual(journeySourceRefs(refs), [refs[0], refs[2]]); assert.deepEqual(journeySourceRefs(refs, true), [refs[0]]);
});

test('milestone payload records an actual KST occurrence, canonical refs and idempotency UUID', async () => {
  const { journeyMilestonePayload } = await state();
  const draft = { kind: 'contract_signed', title: ' 계약 체결 ', description: ' 실제 협의 후 기록 ', occurred_at: '2026-10-15T09:00', stage: 'closure' };
  const refs = [{ type: 'revision', id: id(1), title: '계약서', url: 'https://example.test' }], now = Date.parse('2026-10-15T01:00:00Z');
  const body = journeyMilestonePayload(draft, refs, id(99), now);
  assert.deepEqual(body, { request_id: id(99), kind: 'contract_signed', title: '계약 체결', description: '실제 협의 후 기록', occurred_at: '2026-10-15T00:00:00.000Z', source_refs: [{ type: 'revision', id: id(1) }] });
  assert.equal(journeyMilestonePayload({ ...draft, kind: 'custom', stage: 'review' }, [], id(99), now).stage, 'review');
  for (const patch of [{ kind: 'constructor' }, { title: '' }, { title: 'a'.repeat(301) }, { description: 'a'.repeat(10001) }, { kind: 'custom', stage: 'constructor' }, { occurred_at: '2026-10-16T00:00' }]) assert.throws(() => journeyMilestonePayload({ ...draft, ...patch }, [], id(99), now));
  assert.throws(() => journeyMilestonePayload(draft, Array.from({ length: 21 }, (_, n) => ({ type: 'revision', id: id(n) })), id(99), now));
  assert.throws(() => journeyMilestonePayload(draft, [{ type: 'analysis', id: id(1) }], id(99), now));
});

test('milestone recording needs write context, explicit server permission and no shared view', async () => {
  const { journeyCanRecord } = await state();
  assert.equal(journeyCanRecord(true, null, { record_milestone: true }), true);
  for (const [write, shared, permissions] of [[true, {}, { record_milestone: true }], [false, null, { record_milestone: true }], [true, null, null], [true, null, { record_milestone: false }], [true, null, { record_milestone: 'true' }]]) assert.equal(journeyCanRecord(write, shared, permissions), false);
});

test('occurrence labels distinguish original occurrence from system registration fallback', async () => {
  const { journeyTimeLabel } = await state();
  assert.equal(journeyTimeLabel({ occurred_time_source: 'occurred' }), '발생 시각');
  assert.equal(journeyTimeLabel({ occurred_time_source: 'recorded' }), '기록 시각');
  assert.match(journeyTimeLabel({ occurred_time_source: 'recorded_fallback' }), /발생일 미확인/);
  assert.equal(journeyTimeLabel({}), '타임라인 기준 시각');
});
