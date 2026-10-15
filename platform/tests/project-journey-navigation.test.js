'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const id = '00000000-0000-4000-8000-000000000001';
const navigation = () => import('../web/src/project-journey-navigation.mjs');

test('journey sources open the exact document, version or task, without changing projects', async () => {
  const { journeySourceTarget } = await navigation();
  for (const [type, tab, key] of [
    ['revision', 'source-review', 'revisionId'],
    ['work_item', 'work-items', 'workItemId'], ['automation_task', 'work-items', 'automationTaskId'],
    ['task_draft', 'work-items', 'taskDraftId'], ['implementation_note', 'work-items', 'implementationNoteId'],
    ['question', 'questions', 'questionId'], ['review', 'reviews', 'reviewId'],
  ]) assert.deepEqual(journeySourceTarget({ type, id, project_id: 'different-project', url: 'https://untrusted.example' }), { tab, target: { [key]: id } });
  assert.deepEqual(journeySourceTarget({ type: 'context_record', id }), { source: { type: 'context_record', id } });
  const documentId = '00000000-0000-4000-8000-000000000002';
  assert.deepEqual(journeySourceTarget({ type: 'commercial_revision', id, document_id: documentId }), { tab: 'source-review', target: { commercialRevisionId: id, commercialDocumentId: documentId } });
  for (const document_id of [undefined, '../private']) assert.deepEqual(journeySourceTarget({ type: 'commercial_revision', id, document_id }), { journeySource: { type: 'commercial_revision', id } });
  for (const type of ['implementation_plan','implementation_request','work_preflight','work_validation','analysis']) {
    assert.deepEqual(journeySourceTarget({ type, id }), { journeySource: { type, id } });
  }
});

test('malformed and unknown journey links cannot become paths or external navigation', async () => {
  const { journeySourceTarget, journeyTaskSelection } = await navigation();
  for (const ref of [null, {}, { type: 'revision', id: '../private' }, { type: 'revision', id: 'https://other.example' }, { type: 'settings', id }, { type: 'toString', id }]) assert.equal(journeySourceTarget(ref), null);
  for (const target of [null, {}, { type: 'automation_task', id: '../private' }]) assert.deepEqual(journeyTaskSelection(target), { taskId: null, draftId: null, noteId: null });
});

test('opening an archived item selects only its own detail rather than another task type', async () => {
  const { journeyTaskSelection } = await navigation();
  assert.deepEqual(journeyTaskSelection({ type: 'automation_task', id }), { taskId: id, draftId: null, noteId: null });
  assert.deepEqual(journeyTaskSelection({ type: 'task_draft', id }), { taskId: null, draftId: id, noteId: null });
  assert.deepEqual(journeyTaskSelection({ type: 'implementation_note', id }), { taskId: null, draftId: null, noteId: id });
});
