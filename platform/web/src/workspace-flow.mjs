// These are work areas, not ordered stages. Existing step URLs remain compatible.
export const WORKFLOW_STEPS = [
  { id: 'contract', label: '계약·기획', description: '제안서·견적서·계약서를 작성하고 고객 합의를 기록합니다.', primaryTab: 'commercial', tabs: ['commercial'] },
  { id: 'collect', label: '자료·회의', description: '문서를 올리거나 대화·회의 기록을 추가합니다.', primaryTab: 'documents', tabs: ['documents', 'channels', 'transcriptions', 'integrations', 'overview'] },
  { id: 'context', label: '요구사항·결정', description: '요구사항과 결정 내용을 검색하고 변경사항을 검토합니다.', primaryTab: 'context', tabs: ['context', 'reviews', 'activity'] },
  { id: 'plan', label: '작업·고객 질문', description: '작업을 배정하고 기한·답변·작업 전후 점검을 관리합니다.', primaryTab: 'work-items', tabs: ['work-items', 'questions', 'work-governance'] },
  { id: 'execute', label: 'AI 개발', description: '확정한 요구사항으로 개발 계획을 만들고 코드·테스트·PR을 검토합니다.', primaryTab: 'implementation', tabs: ['implementation', 'github-delivery'] },
  { id: 'knowledge', label: '재사용 자료', description: '검토한 해결 사례를 찾아 현재 프로젝트에 적용합니다.', primaryTab: 'context', tabs: ['context'] },
  { id: 'prepare', label: '프로젝트 관리', description: '구성원과 개발 저장소, 실행 환경을 설정합니다.', primaryTab: 'members', tabs: ['members', 'settings'], management: true },
];
export const WORKSPACE_VIEWS = {
  home: { label: '홈', description: '확인할 알림과 진행 중인 업무를 살펴보세요.' },
  alerts: { label: '알림함', description: '프로젝트를 선택해 검토할 내용과 지연된 업무를 확인하세요.' },
  settings: { label: '저장소·AI 설정', description: '개발할 저장소를 연결하고 AI 실행 환경을 설정하세요.' },
  members: { label: '구성원', description: '함께 일하는 사람과 권한, 담당 업무를 확인하세요.' },
  commercial: { label: '계약·기획', description: '프로젝트 정보와 제안서·견적서·계약서를 작성하고 고객 합의를 기록하세요.' },
  documents: { label: '문서·기록', description: '파일을 올리거나 직접 작성하세요. 새 버전은 기존 확정본과 비교할 수 있습니다.' },
  channels: { label: '수집한 대화 검토', description: '수집한 대화와 AI 정리 결과를 대조한 뒤 저장하세요.' },
  transcriptions: { label: '회의 녹음·회의록', description: '녹음을 텍스트로 변환하고 회의 내용을 확인하세요.' },
  integrations: { label: '외부 도구 연결', description: '자료를 가져올 도구와 수집 범위를 설정하세요.' },
  overview: { label: '문서 처리 상태', description: '진행 중이거나 실패한 분석을 확인하고 필요한 작업을 다시 실행하세요.' },
  context: { label: '요구사항·결정', description: '관련 자료를 찾고, 검토함에서 요구사항과 결정 내용을 확정하세요.' },
  reviews: { label: '문서 변경 검토', description: '확정본과 새 버전을 비교하고 반영할 변경을 승인하세요.' },
  'work-governance': { label: '작업 전·후 점검', description: '작업 전에는 충돌과 범위를 확인하고, 완료 후에는 결과를 요구사항과 대조하세요.' },
  'work-items': { label: '작업 배정·진행', description: '작업별 대표 담당자와 기한을 정하고 진행 상태를 갱신하세요.' },
  questions: { label: '고객 질문·답변', description: '질문할 내용과 답변 기한을 기록하고, 받은 답변을 연결된 작업에 반영하세요.' },
  implementation: { label: '개발 계획·실행', description: '확정본을 선택해 개발 계획을 요청하고, 계획과 작업 범위를 승인한 뒤 실행하세요.' },
  'github-delivery': { label: '변경 코드·PR', description: '코드 변경과 테스트 결과를 검토하고 승인한 변경을 Draft PR로 보내세요.' },
  activity: { label: '활동 이력', description: '문서 등록·변경 승인·작업 실행 이력을 확인하세요.' },
};
export function resolveWorkflowStep(tab, preferred) {
  const area = preferred === 'validate' ? 'plan' : preferred;
  return WORKFLOW_STEPS.find(step => step.id === area && step.tabs.includes(tab)) || WORKFLOW_STEPS.find(step => step.tabs.includes(tab)) || null;
}
