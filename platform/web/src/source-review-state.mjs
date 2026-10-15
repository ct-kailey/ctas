const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

export function sourceReviewDocuments(documents = []) {
  return documents.map((document) => ({ ...document, revisions: [...(document.revisions || [])].sort(byNewest) }))
    .filter((document) => document.revisions.length)
    .sort((a, b) => byNewest(a.revisions[0], b.revisions[0]));
}

export function sourceReviewSelection(documents, selectedId, initialRevisionId) {
  const requested = selectedId || initialRevisionId;
  for (const document of documents) {
    const revision = document.revisions.find((item) => item.id === requested);
    if (revision) return { document, revision };
  }
  if (requested) return null;
  const document = documents.find((item) => item.revisions[0].id !== item.baseline_revision_id) || documents[0];
  return document ? { document, revision: document.revisions[0] } : null;
}

export function sourceReviewForRevision(reviews = [], revisionId) {
  return [...reviews].filter((review) => review.current_revision_id === revisionId).sort(byNewest)[0] || null;
}

export function sourceRunsForRevision(runs = [], revisionId, sourceType = 'revision') {
  return runs.filter((run) => run.source_refs?.some((ref) => ref.type === sourceType && ref.id === revisionId)).sort(byNewest);
}

export function sourceCandidatesForRevision(candidates = [], revisionId, sourceType = 'revision') {
  return candidates.filter((candidate) => candidate.source_refs?.some((ref) => ref.type === sourceType && ref.id === revisionId));
}

export function candidateBlockers(candidate, version) {
  return {
    stale: candidate.status === 'pending' && candidate.base_version !== version,
    questions: Boolean(candidate.questions?.some((item) => item.blocking && !item.answer?.trim())),
    conflicts: Boolean(candidate.conflicts?.some((item) => item.resolution === 'unresolved')),
  };
}

export function hydratedSourceRevision(loadedRevision, document, revisionId) {
  if (!loadedRevision || document.source_type !== 'commercial_revision') return loadedRevision;
  const metadata = document.revisions.find((revision) => revision.id === revisionId);
  // The structured commercial body may arrive after the catalog text. Derive it
  // from current props while keeping the fetched source text/status authoritative.
  return { ...loadedRevision, ...metadata, source_text: loadedRevision.source_text, status: loadedRevision.status };
}

export function sourceAnalysisDispatch(ai) {
  if (ai?.enabled === true) return { enabled: true, message: null };
  return { enabled: false, message: ai?.dispatch_mode === 'project_workspace' || ai?.disabled_reason === 'NORA_PROJECT_FLOW_SETUP_REQUIRED'
    ? '이전 자료 요약 흐름은 현재 프로젝트 워크스페이스에서 실행할 수 없습니다. 정책 리스크 분석은 별도 흐름으로 진행할 수 있습니다.'
    : '자료 요약·분석 연결이 준비되지 않았습니다. 원문과 기존 분석 이력은 보존되어 있습니다.' };
}

export function sourceAnalysisFailure(run, ai, canOpenPolicy = false) {
  if (run?.error_code === 'CONTEXT_APPROVAL_EXPIRED') return {
    expired: true, title: '이전 분석 승인 대기 만료',
    message: canOpenPolicy ? '이전 자료 분석의 승인 기한이 지났습니다. 원문과 분석 이력은 보존되며, 개발 Task 준비는 현재 프로젝트의 정책 리스크 분석에서 계속할 수 있습니다.'
      : sourceAnalysisDispatch(ai).enabled ? '이전 자료 분석의 승인 기한이 지났습니다. 원문은 보존되어 있습니다. 최신 내용으로 다시 분석한 뒤 검토해 주세요.'
        : '이전 자료 분석의 승인 기한이 지났습니다. 원문과 분석 이력은 보존되어 있습니다. 현재 프로젝트의 자료 분석 연결을 확인해 주세요.',
  };
  return { expired: false, title: run?.status === 'uncertain' ? '이전 실행 결과를 확인해야 합니다' : '분석을 완료하지 못했습니다', message: run?.status === 'uncertain' ? '관리자가 Nora 실행 이력을 확인한 뒤 후속 처리해야 합니다.' : sourceAnalysisDispatch(ai).enabled ? '연결 설정과 원문을 확인한 후 다시 분석할 수 있습니다.' : sourceAnalysisDispatch(ai).message };
}
