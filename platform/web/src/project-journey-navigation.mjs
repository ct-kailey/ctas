const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Journey links only select an existing record inside the current project.
// A URL, title or another project's identifier must never become a destination.
export function journeySourceTarget(ref) {
  if (!ref || typeof ref.id !== 'string' || !UUID.test(ref.id)) return null;
  const id = ref.id;
  switch (ref.type) {
    case 'revision': return { tab: 'source-review', target: { revisionId: id } };
    case 'commercial_revision': return UUID.test(ref.document_id || '')
      ? { tab: 'source-review', target: { commercialRevisionId: id, commercialDocumentId: ref.document_id } }
      : { journeySource: { type: 'commercial_revision', id } };
    case 'work_item': return { tab: 'work-items', target: { workItemId: id } };
    case 'automation_task': return { tab: 'work-items', target: { automationTaskId: id } };
    case 'task_draft': return { tab: 'work-items', target: { taskDraftId: id } };
    case 'implementation_note': return { tab: 'work-items', target: { implementationNoteId: id } };
    case 'question': return { tab: 'questions', target: { questionId: id } };
    case 'review': return { tab: 'reviews', target: { reviewId: id } };
    case 'channel_inbox': return { tab: 'channels', target: { inboxId: id } };
    case 'context_record': return { source: { type: 'context_record', id } };
    case 'context_candidate': return { tab: 'context', target: { candidateId: id } };
    case 'implementation_plan':
    case 'implementation_request':
    case 'work_preflight':
    case 'work_validation':
    case 'analysis': return { journeySource: { type: ref.type, id } };
    default: return null;
  }
}

export function journeyTaskSelection(target) {
  if (!target || !UUID.test(target.id || '')) return { taskId: null, draftId: null, noteId: null };
  return {
    taskId: target.type === 'automation_task' ? target.id : null,
    draftId: target.type === 'task_draft' ? target.id : null,
    noteId: target.type === 'implementation_note' ? target.id : null,
  };
}
