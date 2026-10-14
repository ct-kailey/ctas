function reviewError(message, code) { return Object.assign(new Error(message), { code, status: 409 }); }

// Called only from an explicit human confirmation. Polling never changes the selected
// items or approves a newer result; an interrupted response reuses this exact payload.
export async function confirmSourceAnalysis({ request, route, runId, payload, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), attempts = 4 }) {
  const runRoute = `${route}/ai-runs/${encodeURIComponent(runId)}`;
  let run = (await request(runRoute)).run;
  if (run.reviewed_sha256 !== payload.expected_sha256) throw reviewError('분석 내용이 바뀌었습니다. 원문과 최신 분석을 다시 확인해 주세요.', 'CONTEXT_REVIEW_STALE');
  if (['uncertain', 'failed', 'rejected'].includes(run.status)) throw reviewError('Nora 실행 상태를 확인한 뒤 다시 검토해 주세요.', 'CONTEXT_AI_STATE');
  if (run.status === 'waiting_approval' || (run.status === 'ready' && !run.decision)) {
    run = (await request(`${runRoute}/decision`, { method: 'POST', body: { decision: 'approved', reason: payload.reason, expected_sha256: payload.expected_sha256 } })).run;
  }
  for (let index = 0; index < attempts && run.status === 'finalizing'; index += 1) {
    await wait(1500);
    run = (await request(runRoute)).run;
    if (run.reviewed_sha256 !== payload.expected_sha256) throw reviewError('분석 내용이 바뀌었습니다. 다시 검토해 주세요.', 'CONTEXT_REVIEW_STALE');
  }
  if (run.status === 'finalizing') return { pending: true, run };
  if (run.status !== 'ready' || run.decision?.decision !== 'approved') throw reviewError('Nora의 검토 결과 처리가 아직 완료되지 않았습니다.', 'CONTEXT_AI_NOT_READY');
  return request(`${runRoute}/confirm`, { method: 'POST', body: payload });
}
