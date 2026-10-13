// Navigation only: steps never imply automatic approval or completion.
export const WORKFLOW_STEPS = [
  { id: 'prepare', label: '프로젝트 준비', description: '프로젝트·기업 정보와 담당자, 저장소를 준비합니다.', primaryTab: 'settings', tabs: ['settings'] },
  { id: 'contract', label: '계약·기획', description: '제안·견적·계약과 고객 합의 범위를 정리합니다.', primaryTab: 'commercial', tabs: ['commercial'] },
  { id: 'collect', label: '자료 수집', description: '문서·대화·회의를 원문과 함께 모읍니다.', primaryTab: 'documents', tabs: ['documents', 'channels', 'transcriptions', 'integrations', 'overview'] },
  { id: 'context', label: 'Context 검토', description: '요구사항과 결정의 근거를 확인하고 기준을 확정합니다.', primaryTab: 'context', tabs: ['context', 'reviews'] },
  { id: 'plan', label: '실행 준비', description: '영향 범위·담당자·질문을 점검하고 작업을 승인합니다.', primaryTab: 'work-governance', tabs: ['work-governance', 'work-items', 'questions'] },
  { id: 'execute', label: 'AI 실행', description: '승인한 계획을 코드·테스트·PR로 연결합니다.', primaryTab: 'implementation', tabs: ['implementation', 'github-delivery'] },
  { id: 'validate', label: '결과 검수', description: '요구사항·정책과 작업 결과를 대조합니다.', primaryTab: 'work-governance', tabs: ['work-governance', 'work-items'] },
  { id: 'knowledge', label: '지식 재사용', description: '검수 결과와 판단 근거를 다음 업무에 활용합니다.', primaryTab: 'context', tabs: ['context', 'activity'] },
];
export const WORKSPACE_VIEWS = {
  home: { label: '홈', description: '확인할 일부터 살펴보고 프로젝트 업무를 이어가세요.' },
  alerts: { label: '알림함', description: '검토·답변·조치가 필요한 내용을 우선순위대로 확인하세요.' },
  settings: { label: '프로젝트 설정', description: '프로젝트의 목표와 구현할 저장소, 기준 브랜치를 관리합니다.' },
  commercial: { label: '계약·기획', description: '프로젝트 정보와 제안서·견적서·계약서를 정리하고 고객 합의를 기록합니다.' },
  documents: { label: '문서·기록', description: '문서와 대화, 결정을 업무 영역과 버전별로 관리합니다.' },
  channels: { label: '수집·검토함', description: '채널 원문과 AI가 추출한 내용을 확인하고 기록으로 남깁니다.' },
  transcriptions: { label: '회의 전사', description: '회의 녹음을 텍스트로 바꾸고 원문과 대조합니다.' },
  integrations: { label: '채널 연결', description: '수집할 채널과 자료의 범위를 지정합니다.' },
  overview: { label: '문서 처리 현황', description: '문서 분석과 변경 검토의 처리 상태를 확인합니다.' },
  context: { label: 'Main Context', description: '요구사항·결정·질문·변경 이력을 근거와 함께 검토합니다.' },
  reviews: { label: '변경 검토', description: '변경 내용과 영향을 검토하고 다음 기준을 확정합니다.' },
  'work-governance': { label: '사전 검증·결과 검수', description: '작업 범위와 정책을 점검하고 결과를 검수합니다.' },
  'work-items': { label: '기능별 작업', description: '담당자·기한·진행 상태와 작업 결과를 연결합니다.' },
  questions: { label: '질문·응답', description: '고객 확인 사항과 응답 대기, 연결된 작업을 추적합니다.' },
  implementation: { label: 'AI 구현 작업', description: '확정된 요구사항으로 구현 계획을 만들고 승인 후 실행합니다.' },
  'github-delivery': { label: 'GitHub PR', description: '코드 변경·테스트·PR과 검수 결과를 연결합니다.' },
  activity: { label: '활동 이력', description: '자료 등록부터 검토·실행·결정까지의 흐름을 확인합니다.' },
};
export function resolveWorkflowStep(tab, preferred) {
  return WORKFLOW_STEPS.find(step => step.id === preferred && step.tabs.includes(tab)) || WORKFLOW_STEPS.find(step => step.tabs.includes(tab)) || null;
}
