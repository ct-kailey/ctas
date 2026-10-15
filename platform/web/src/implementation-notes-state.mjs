export const IMPLEMENTATION_NOTE_KINDS = { temporary_decision: '임시 구현', work_gap: '작업 공백' };
export const IMPLEMENTATION_NOTE_STATES = { open: '검토 전', feedback_received: '피드백 등록됨', followup_created: '보완 분석 요청됨', accepted: '임시 구현 수용됨', resolved: '공백 해소 검토됨' };
export const IMPLEMENTATION_NOTE_HISTORY = { created: '최초 기록', feedback: '사람의 피드백', followup_created: '새 보완 분석 요청', accepted: '임시 구현 수용', resolved: '공백 해소 검토' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function implementationNotePermissions(role, sharedView) {
  return { canWrite: !sharedView && ['owner', 'reviewer', 'member'].includes(role), canReview: !sharedView && ['owner', 'reviewer'].includes(role) };
}

export function implementationNoteDraft(seed = {}) {
  return { kind: 'temporary_decision', title: '', uncertainty: '', temporary_approach: '', rationale: '', impact: '', replacement_condition: '',
    source_revision_id: seed.source_revision_id || '', automation_task_id: seed.automation_task_id || null, task_draft_id: seed.task_draft_id || null, analysis_id: seed.analysis_id || null };
}

export function implementationNoteEvidence(revision, segmentId, quote) {
  const segment = revision?.document_json?.segments?.find(item => item.segment_id === segmentId);
  return revision?.status === 'ready' && revision?.document_json?.extraction?.complete === true && segment?.extraction_status === 'ok'
    && typeof quote === 'string' && quote.trim() && quote.length <= 10000 && segment.text?.includes(quote)
    ? { type: 'revision', id: revision.id, segment_id: segmentId, quote } : null;
}

export function implementationNoteCreatePayload(draft, evidence, requestId) {
  const body = { request_id: requestId, kind: draft.kind };
  if (!IMPLEMENTATION_NOTE_KINDS[draft.kind] || !UUID.test(requestId || '')) throw new Error('기록 종류와 요청 정보를 확인해 주세요.');
  for (const [key, max] of Object.entries({ title: 300, uncertainty: 5000, rationale: 5000, impact: 5000, replacement_condition: 5000 })) {
    const value = draft[key]?.trim(); if (!value || value.length > max) throw new Error('기록의 제목·미확정 사항·이유·영향·교체 조건을 모두 입력해 주세요.'); body[key] = value;
  }
  if (draft.kind === 'temporary_decision') {
    if (!draft.temporary_approach?.trim() || draft.temporary_approach.length > 10000) throw new Error('기획 확인 전 선택한 임시 구현 방식을 입력해 주세요.');
    body.temporary_approach = draft.temporary_approach.trim();
  }
  if (!evidence || !UUID.test(evidence.id || '') || !evidence.segment_id || !evidence.quote?.trim() || evidence.quote.length > 10000) throw new Error('현재 프로젝트 원문에서 정확한 인용을 연결해 주세요.');
  body.source_revision_id = evidence.id; body.evidence = [{ segment_id: evidence.segment_id, quote: evidence.quote }];
  for (const key of ['automation_task_id', 'task_draft_id', 'analysis_id']) if (draft[key]) body[key] = draft[key];
  return body;
}

export function implementationNoteReviewStatus(note) {
  if (!['open', 'feedback_received', 'followup_created'].includes(note?.status)) return null;
  return note?.kind === 'temporary_decision' ? 'accepted' : note?.kind === 'work_gap' ? 'resolved' : null;
}

export function mergeImplementationNotesPage(previous, page) {
  if (!page || !Array.isArray(page.notes) || !Number.isSafeInteger(page.total) || page.total < 0 || !Number.isSafeInteger(page.offset) || page.offset < 0 || typeof page.has_more !== 'boolean'
    || page.notes.some(note => !UUID.test(note?.id || ''))) throw new Error('기록 목록 응답을 확인할 수 없습니다. 다시 불러와 주세요.');
  if (page.offset && previous?.next_offset !== page.offset) throw new Error('기록 목록 순서가 바뀌었습니다. 처음부터 다시 불러와 주세요.');
  if (page.has_more && (!page.notes.length || !Number.isSafeInteger(page.next_offset) || page.next_offset <= page.offset)) throw new Error('다음 기록 목록을 확인할 수 없습니다. 다시 불러와 주세요.');
  const seen = new Set(), notes = [];
  for (const note of [...(page.offset ? previous.notes : []), ...page.notes]) if (!seen.has(note.id)) { seen.add(note.id); notes.push(note); }
  return { notes, total: page.total, has_more: page.has_more, next_offset: page.next_offset };
}

export function mergeImplementationNoteHistory(previous, page, more) {
  if (!page?.note || !Array.isArray(page.history) || !Number.isSafeInteger(page.history_offset) || page.history_offset < 0
    || page.history_has_more && !page.history.length) throw new Error('이전 이력을 확인할 수 없습니다. 최신 이력을 다시 불러와 주세요.');
  // Offset pages cannot share a snapshot after a concurrent feedback append.
  // Reload page zero before exposing the new version for a follow-up request.
  if (more && previous?.note.version !== page.note.version) return null;
  if (more && previous?.history_next_offset !== page.history_offset) throw new Error('이력 목록 순서가 변경되었습니다. 최신 이력을 다시 불러와 주세요.');
  return { ...page, history_next_offset: page.history_offset + page.history.length,
    history: more ? [...new Map([...previous.history, ...page.history].map(item => [item.id, item])).values()] : page.history };
}
