import { getLocale } from './ui-language-state.mjs';

// These rule codes identify fixed instructions emitted by readAttention in
// server/dashboard.js. This is not a translator for project or customer text.
const ATTENTION_INSTRUCTIONS_EN = Object.freeze({
  review_pending: 'Compare the requirements change analysis with the original source and complete the review.',
  review_no_change: 'Verify the analysis finding that the requirements have not changed, then complete the review.',
  job_failed: 'The analysis failed. Check the cause and decide whether to process it again.',
  job_uncertain: 'The execution result is unconfirmed. Check the run history before deciding what to do next.',
  context_pending: 'A candidate is ready to add to the project context. Review its sources and decisions.',
  question_draft: 'This question has not been sent. Review the content and record when it is sent.',
  question_answer_review: 'An answer has arrived. Check its evidence and impact before confirming it.',
  question_overdue: 'The response deadline has passed. Check the response status and the tasks waiting for it.',
  question_waiting_long: 'The answer has been pending for at least 3 days. Check whether a follow-up is needed.',
  question_waiting: 'Waiting for the customer’s answer. Add it to the question history when it arrives.',
  task_blocked_overdue: 'This blocked task is past its deadline. Check the blocker and any schedule changes needed.',
  task_blocked: 'This task is blocked. Check the reason and what is needed to resolve it.',
  task_overdue: 'This unfinished task is past its deadline. Check its progress and schedule.',
  channel_evidence_changed: 'The collected source has changed. Collect the latest conversation and check the existing review items.',
  channel_failed: 'Conversation analysis failed. Check the original conversation and the cause.',
  channel_uncertain: 'The conversation analysis result is unconfirmed. Check the run history and original conversation.',
  channel_review: 'The collected conversation contains candidate records to review. Check the original before adding or excluding them.',
});

export function attentionInstruction(item, locale = getLocale()) {
  const original = typeof item?.description === 'string' ? item.description : '';
  return locale === 'en' && Object.hasOwn(ATTENTION_INSTRUCTIONS_EN, item?.rule)
    ? ATTENTION_INSTRUCTIONS_EN[item.rule]
    : original;
}

// Only audit titles below are wholly system-authored. Other timeline titles
// combine prefixes with user records and must remain intact.
const JOURNEY_AUDIT_TITLES_EN = Object.freeze({
  'project.created': 'Project created',
  'baseline.initial_published': 'Initial document baseline set',
  'review.requested': 'Document change review requested',
  'review.question_answered': 'Document review question answered',
  'review.approved': 'Document change approved',
  'review.rejected': 'Document change rejected',
  'baseline.published': 'Document baseline updated',
  'commercial.stage_changed': 'Contract stage changed',
  'commercial.confirmation_invalidated': 'Contract confirmation requires review',
  'commercial.feedback_recorded': 'Customer clarification request recorded',
  'commercial.feedback_answered': 'Customer clarification answered',
  'implementation.plan_requested': 'Implementation plan requested',
  'implementation.plan_needs_review': 'Implementation plan awaiting review',
  'implementation.plan_approved': 'Implementation plan approved',
  'implementation.plan_rejected': 'Implementation plan rejected',
  'implementation.plan_failed': 'Implementation plan processing failed',
  'implementation.plan_uncertain': 'Implementation plan result unconfirmed',
  'implementation.execution_requested': 'Implementation run requested',
  'implementation.execution_patch_ready': 'Code changes awaiting review',
  'implementation.execution_failed': 'Implementation run failed',
  'implementation.execution_uncertain': 'Implementation run result unconfirmed',
  'implementation.execution_cancelled': 'Implementation request cancelled',
  'governance.preflight_created': 'Pre-flight review created',
  'governance.scope_locked': 'Work scope approved',
  'governance.validation_created': 'Work result validation requested',
  'governance.validation_accepted': 'Work result validation accepted',
  'governance.validation_changes_requested': 'Work result changes requested',
  'task_automation.tasks_created': 'Policy analysis and tasks created',
  'task_automation.questions_drafted': 'Policy clarification questions drafted',
  'task_automation.development_requested': 'AI development requested',
  'task_automation.review_ready': 'AI work awaiting review',
  'task_automation.development_blocked': 'AI implementation gap recorded',
  'task_automation.merge_approved': 'Reviewed changes approved for merge',
  'task_automation.merged': 'AI work merge confirmed',
  'task_area.updated': 'Screen, server or database work area updated',
  'task_automation.execution_awaiting_connection': 'Automated work awaiting connection',
  'task_automation.execution_failed': 'Automated work failed',
  'task_automation.execution_uncertain': 'Automated work result unconfirmed',
  'github_delivery.published': 'Draft PR published for review',
});
const JOURNEY_STATIC_EVENT_DESCRIPTIONS_EN = Object.freeze({
  'analysis:risk_analysis_requested': 'Requesting an analysis does not mean the work is complete.',
  'audit:github_delivery.published': 'A PR was published for review. This does not indicate a merge, final delivery or contract closure.',
  'audit:governance.artifact_registered': 'The registered artifact still requires validation against the requirements.',
});
const JOURNEY_SOURCE_TITLES_EN = Object.freeze({
  review: 'Document change review', implementation_plan: 'Implementation plan',
  implementation_request: 'Implementation run', work_validation: 'Work result validation', analysis: 'Policy analysis',
});
const JOURNEY_SOURCE_DESCRIPTIONS_EN = Object.freeze({
  implementation_request: 'The status of code generation or execution is separate from final delivery or merge completion.',
  analysis: 'Completing the analysis is separate from completing the implementation work.',
});
const JOURNEY_FIELD_LABELS_EN = Object.freeze({
  '현재 상태': 'Current status', '현재 실행 상태': 'Current execution status', '등록 일시': 'Recorded at',
  '발생 일시': 'Occurred at', '원문 발생일': 'Source event date', '원문 생성일': 'Source created at', '원문 SHA-256': 'Source SHA-256',
  '문서 버전': 'Document version', '문서 분류': 'Document category', '문서 종류': 'Document type', '시간 기준': 'Time basis',
  '기록 종류': 'Record type', '구현 결과': 'Implementation outcome', '임시 구현 방식': 'Provisional implementation',
  '판단 근거': 'Rationale', '영향': 'Impact', '교체·해결 조건': 'Replacement or resolution criteria', '오류 코드': 'Error code',
  '기록 당시 판단': 'Decision at the time', '맥락 버전': 'Context version', '진행률 포함': 'Progress calculation',
  '이전 상태': 'Previous status', '기록 당시 상태': 'Status at the time', 'QA 근거': 'QA evidence', '이력 동작': 'History action',
  '기록 버전': 'Record version', '의미': 'Meaning', '이전 계약 진행 단계': 'Previous contract stage', '변경된 계약 진행 단계': 'Updated contract stage',
  '작업 영역': 'Work area', '변경 전 상태': 'Status before change', '변경 후 상태': 'Status after change', '변경 항목': 'Changed fields',
  '주의': 'Note', '발행 PR': 'Published PR', '결과물 종류': 'Artifact type', '기록 방식': 'Recording method',
  '요청 내용': 'Request', '요약': 'Summary', '계획 제목': 'Plan title', '검토 결과': 'Review outcome',
  '작업 내용': 'Work details', '위험·확인 사항': 'Risks and open questions', '확인 질문': 'Clarification questions',
  '검수 확인 사항': 'Validation issues', '점검 결과': 'Findings', '수용 기준 점검': 'Acceptance criteria checks',
  '정책 적용 점검': 'Policy checks', '작업 범위 점검': 'Scope checks', '남은 확인 사항': 'Remaining checks',
});

export function journeyEventTitle(item, locale = getLocale()) {
  return locale === 'en' && item?.type === 'audit' && Object.hasOwn(JOURNEY_AUDIT_TITLES_EN, item.kind)
    ? JOURNEY_AUDIT_TITLES_EN[item.kind] : item?.title;
}
export function journeyEventDescription(item, description = item?.description, locale = getLocale()) {
  const key = `${item?.type}:${item?.kind}`;
  return locale === 'en' && Object.hasOwn(JOURNEY_STATIC_EVENT_DESCRIPTIONS_EN, key)
    ? JOURNEY_STATIC_EVENT_DESCRIPTIONS_EN[key] : description;
}
export function journeySourceTitle(source, locale = getLocale()) {
  return locale === 'en' && Object.hasOwn(JOURNEY_SOURCE_TITLES_EN, source?.type)
    ? JOURNEY_SOURCE_TITLES_EN[source.type] : source?.title;
}
export function journeySourceDescription(source, description, locale = getLocale()) {
  return locale === 'en' && Object.hasOwn(JOURNEY_SOURCE_DESCRIPTIONS_EN, source?.type)
    ? JOURNEY_SOURCE_DESCRIPTIONS_EN[source.type] : description;
}
export function journeyFieldLabel(label, sourceType, locale = getLocale()) {
  // Commercial source sections/tables can have arbitrary user-authored titles;
  // the API does not distinguish these from metadata labels. Preserve all of them.
  return locale === 'en' && sourceType !== 'commercial_revision' && Object.hasOwn(JOURNEY_FIELD_LABELS_EN, label)
    ? JOURNEY_FIELD_LABELS_EN[label] : label;
}
