'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/task-draft-state.mjs');
const item = n => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title: '작업 ' + n });
const page = (offset, items, total, limit = 200) => ({ offset, items, total, limit, has_more: offset + items.length < total });

test('manual draft pagination retains every task beyond the 200 item page limit', async () => {
  const { mergeTaskDraftPage } = await state();
  const all = Array.from({ length: 453 }, (_, i) => item(i));
  let current = null;
  for (const offset of [0, 200, 400]) current = mergeTaskDraftPage(current, page(offset, all.slice(offset, offset + 200), all.length));
  assert.deepEqual(current.items, all);
  assert.equal(current.total, 453); assert.equal(current.next_offset, 453); assert.equal(current.has_more, false);
});

test('manual draft duplicate IDs preserve first data and server offset while offset zero resets', async () => {
  const { mergeTaskDraftPage } = await state();
  const original = item(1), first = mergeTaskDraftPage(null, page(0, [original, item(2)], 4, 2));
  const next = mergeTaskDraftPage(first, page(2, [{ ...original, title: '중복된 다른 데이터' }, item(3)], 4, 2));
  assert.deepEqual(next.items, [original, item(2), item(3)]);
  assert.equal(next.next_offset, 4); assert.equal(next.total, 4); assert.equal(next.has_more, false);
  assert.deepEqual(first.items, [original, item(2)], 'previous state remains unchanged');
  assert.deepEqual(mergeTaskDraftPage(next, page(0, [item(9)], 1)), { items: [item(9)], total: 1, has_more: false, next_offset: 1 });
  assert.deepEqual(mergeTaskDraftPage(next, page(0, [], 0)), { items: [], total: 0, has_more: false, next_offset: 0 });
});

test('manual draft pagination rejects stale offsets, stalled pages and malformed contracts', async () => {
  const { mergeTaskDraftPage } = await state();
  const first = mergeTaskDraftPage(null, page(0, [item(1)], 3, 1));
  for (const previous of [null, first, { items: [], next_offset: 3 }]) assert.throws(() => mergeTaskDraftPage(previous, page(2, [item(3)], 3, 1)), /처음부터/);
  assert.throws(() => mergeTaskDraftPage(first, { ...page(1, [], 3), has_more: true }), /비어/);
  for (const change of [{ limit: 201 }, { offset: -1 }, { total: '1' }, { has_more: 'true' }, { has_more: false }, { items: [{ id: 'not-a-uuid' }] }, { items: null }, { items: [item(1), item(2)], limit: 1 }, { total: 0 }]) {
    assert.throws(() => mergeTaskDraftPage(null, { ...page(0, [item(1)], 3), ...change }), /목록/);
  }
});

test('manual draft source links allow HTTP and HTTPS without credentials and preserve board locations', async () => {
  const { taskDraftSourceUrl } = await state();
  const board = 'https://www.figma.com/board/example/Policy?node-id=1-2#section';
  assert.equal(taskDraftSourceUrl(board), board);
  assert.equal(taskDraftSourceUrl('http://example.test/record?version=2#source'), 'http://example.test/record?version=2#source');
  for (const unsafe of [null, {}, '', '/relative', '//example.test', 'javascript:alert(1)', 'data:text/html,unsafe', 'file:///etc/passwd', 'https://user:secret@example.test/', 'https://user@example.test/', 'https://example.test/\nnew']) assert.equal(taskDraftSourceUrl(unsafe), null);
});
