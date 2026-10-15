export function draftPolicySourceState(revision) {
  if (!revision) return { ready: false, pending: false, message: '정책 원문의 처리 상태를 확인하고 있습니다.' };
  const pending = ['queued', 'running', 'processing', 'extracting'].includes(revision.status);
  const document = revision.document_json;
  const ready = revision.status === 'ready' && document?.extraction?.complete === true && Array.isArray(document.segments) && document.segments.length > 0 && document.segments.every(segment => segment.extraction_status === 'ok');
  return { ready, pending, message: ready ? '원문 추출이 완료되었습니다. 현재 프로젝트의 Nora 워크스페이스에서 리스크를 분석합니다.' : pending ? '원문 추출이 끝나면 리스크 분석을 요청할 수 있습니다.' : '원문의 추출 상태와 확인이 필요한 구간을 먼저 검토해 주세요.' };
}

export function draftPolicyResults(data, revisionId) {
  const analyses = (data?.analyses || []).filter(analysis => analysis.revision_id === revisionId);
  const ids = new Set(analyses.map(analysis => analysis.id));
  return { analyses, tasks: (data?.tasks || []).filter(task => ids.has(task.analysis_id)), active: analyses.some(analysis => ['queued', 'running'].includes(analysis.status)) };
}

export function draftPolicyResultKey(data, revisionId) {
  const { analyses, tasks } = draftPolicyResults(data, revisionId);
  return [...analyses.map(item => `${item.id}:${item.status}:${item.updated_at || ''}`), ...tasks.map(item => `${item.id}:${item.status}:${item.version || ''}`)].join('|');
}

export function policyAnalysisRetryPayload(analysis, requestId, acknowledged = false) {
  if (analysis?.can_retry !== true || !['failed', 'uncertain'].includes(analysis.status) || !analysis.execution?.id || !['failed', 'uncertain'].includes(analysis.execution.status)) throw new Error('현재 분석은 재시도할 수 없습니다. 최신 상태를 확인해 주세요.');
  if (analysis.status === 'uncertain' && !acknowledged) throw new Error('이전 실행 결과를 확인한 뒤 재시도를 요청해 주세요.');
  return { request_id: requestId, expected_job_id: analysis.execution.id, ...(analysis.status === 'uncertain' ? { acknowledge_uncertain: true } : {}) };
}
