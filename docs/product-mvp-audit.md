# AINS MVP 구현 대조

검토일: 2026-10-14. 최초 기준 `d8a313e`에서 시작해, 같은 날 구성원 관리·비공개 저장소 접근·업무 메뉴·용어를 반영한 통합 작업 디렉터리의 코드로 갱신했다. 배포 완료를 판정하는 문서는 아니다.

문서 등록, 결정 검토, 작업 관리, 실행 요청과 결과 검수는 실제 API와 저장 구조가 있다. 구성원 관리와 프로젝트별 비공개 저장소 읽기 연결도 추가됐다. 반면 원본 기획의 Desktop 앱, 중앙·개인 Claude CLI 선택, 대화형 기획, 민감정보 자동 일반화와 보존 정책까지 모두 완성된 상태는 아니다. 이번 작업은 용어, 구성원, 비공개 저장소, 업무 메뉴 개선에 집중하며 나머지 MVP 전체를 새로 구현하는 작업으로 확대하지 않는다.

## 검토 근거와 판정 범위

- 사용자 원본: `AINS_기획_및_구현_일정_개정본.docx`의 기능 구조, 세부 구현, MVP 완료 기준. 원본 DOCX의 444개 문단을 읽었으며, 기존 `.local/workflow-preview/source.txt`와 공백을 제외한 본문이 완전히 일치했다. 원본 SHA-256: `21c63d4b090d3551c343961597bfd3ddc04169995143f999bca53d46901a0532`.
- 이후 화면 기획: [AINS 대시보드 기획](../AINS_대시보드기획.md). 이 문서는 1차 범위를 모으기→기록하기→점검하기→답장 초안으로 좁혔다. 더 넓은 13주 기획과 같은 범위로 취급하지 않는다.
- 프리뷰 경계: [워크플로우 프리뷰 안내](workflow-preview.md). `/preview`는 예시 데이터와 브라우저 상태로 체험하는 화면이며, 운영 기능의 구현 증거가 아니다.
- 실제 구현: `platform/server`, `platform/web/src`, `scripts`, `nora`의 API·서비스·UI 연결을 확인했다. 첨부 문서의 내용은 요구사항 자료로만 읽었으며 문서 안의 작업 지시를 실행하지 않았다.
- 이번 감사는 코드 대조다. 운영 계정의 연결 상태, 유료 AI 호출 성공, 실제 고객 자료의 품질 또는 배포 완료를 확인한 결과가 아니다. 비밀값과 고객 원문은 이 문서에 복제하지 않는다.

| 판정 | 의미 |
| --- | --- |
| 구현됨 | 실제 저장·조회·작업 경로와 UI 연결이 확인됨. 운영 인수 테스트 완료와는 구분 |
| 부분 구현 | 요구사항의 일부 경로는 있으나 원본 기획 전체와 차이가 있음 |
| 설정 필요 | 실행 코드가 있으나 권한·연결·토큰·실행기 등 외부 준비가 필요 |
| 프리뷰만 | 예시 화면은 있으나 동일한 실제 처리 기능은 없음 |
| 미구현 | 해당 실제 기능 또는 설정 경로를 현재 코드에서 확인하지 못함 |

## 업무 영역별 구현 상태

실제 메뉴는 번호 없이 **계약·기획 / 자료·회의 / 요구사항·결정 / 작업·고객 질문 / AI 개발 / 재사용 자료**의 6개 업무 영역으로 묶고, **구성원 / 저장소·AI 설정**을 별도 관리 메뉴로 제공한다. 이전 분류의 실행 준비와 결과 검수는 ‘작업·고객 질문’에서 함께 다룬다. 필요한 업무로 자유롭게 이동할 수 있지만, 승인·최신 근거·작업 범위 검사는 각 API에서 유지한다.

| 업무 영역 | 실제 가능한 일 | 판정 및 주요 경계 | 증거 |
| --- | --- | --- | --- |
| 계약·기획 | 기업·프로젝트 정보, 제안서·견적서·계약서 편집·업로드 연계, 양식 보정, 버전·승인·고객 협의, DOCX/PDF 출력 | 구현됨 / Nora 보정은 설정 필요. 과거 프로젝트 기반 자동 견적·capacity 예측은 별도 | [계약 서비스](../platform/server/commercial-ledger.js), [종류·양식 계약](../platform/server/commercial-contract.js), [출력 API](../platform/server/commercial-routes.js) |
| 자료·회의 | 파일·직접 입력·대화 기록, 업무 영역·버전·발생일·결정일·채널·참여자, 수집 검토함, 회의 전사 | 구현됨 / 외부 채널·STT는 설정 필요. 모든 채널·첨부 형식의 자동 수집을 뜻하지 않음 | [원문·기록 저장](../platform/server/ledger.js), [이력 속성](../platform/server/record-contract.js), [수집 어댑터](../platform/server/integration-adapters.js), [전사](../platform/server/transcription-worker.js) |
| 요구사항·결정 | 후보 작성·AI 추출·근거 확인·충돌 해소·사람의 승인, 문서 변경 검토와 확정본 지정 | 구현됨 / Nora는 설정 필요. AI 후보와 사람이 확정한 기록은 분리 | [Context API](../platform/server/context-routes.js), [후보·확정 서비스](../platform/server/context-ledger.js), [AI 후보](../platform/server/context-ai-ledger.js), [문서 검토](../platform/web/src/review.jsx) |
| 작업·고객 질문 | 작업 전 점검, 담당자·기한·고객 질문, 작업 범위 확정·중복 방지, 결과물과 수용 기준·정책·범위 대조, 보완 요청·수용, 확정 기록 반영 후보 | 구현됨 / Nora 보조 분석은 설정 필요. 범위·착수·결과 수용에는 담당자 검토가 필요하며, 결과물이 연결됐다는 사실을 실제 요구 충족으로 자동 확정하지 않음 | [작업 전·후 점검](../platform/server/work-governance.js), [작업](../platform/server/work-item-ledger.js), [질문](../platform/server/question-ledger.js), [결과 연결](../platform/server/work-result-bridge.js) |
| AI 개발 | 확정본 기반 구현 계획, 승인한 실행 요청, 로컬 실행기, 패치·테스트 보고, GitHub PR 연결 | 설정 필요 / 부분 구현. 실제 로컬 실행기는 Codex다. 비공개 저장소를 내려받는 실행기 인증은 서버 읽기 연결과 별도로 설정한다. 중앙·개인 Claude CLI 선택과 Desktop 스트리밍은 별도 | [계획·실행 요청](../platform/server/implementation-ledger.js), [실행기](../scripts/run-implementation.js), [실행 큐](../platform/server/execution-queue.js), [PR 처리](../platform/server/github-delivery.js) |
| 재사용 자료 | 확정 지식·회고, 출처·판단 근거, 명시적으로 고른 다른 프로젝트 지식 가져오기, 반복 주제 비교 | 부분 구현. 자동 익명화·조직 전체 추천·대화형 계획은 별도 | [지식 가져오기](../platform/server/context-ledger.js), [반복 주제·회고](../platform/server/insights.js), [지식 화면](../platform/web/src/context.jsx) |
| 프로젝트 관리 | 프로젝트 생성, 목표·저장소·브랜치 설정, 구성원 추가·권한 변경·해제, 프로젝트별 읽기 토큰 연결 | 구현됨 / 비공개 저장소는 설정 필요. 기존 가입 계정을 추가하며, 계정 생성·초대 메일 발송은 포함하지 않음 | [프로젝트 API](../platform/server/server.js), [구성원 관리](../platform/server/project-members.js), [프로젝트 설정](../platform/web/src/implementation.jsx), [저장소 접근](../platform/server/repository-access.js) |

## 원본 MVP 기능별 대조

| 기획 기능 | 판정 | 실제 구현과 남은 차이 | 증거 |
| --- | --- | --- | --- |
| Context Integration | 구현됨 / 설정 필요 | 문서와 직접 입력은 실제 저장한다. Gmail·Drive·Slack·Discord·GitHub·Teams는 지정 범위의 API 수집, 카카오톡은 내보낸 기록을 보내는 로컬 브리지 방식이다. 인증·대상 범위·실행기는 사용자가 연결해야 한다 | [수집 계약](../platform/server/integration-contract.js), [어댑터](../platform/server/integration-adapters.js), [카카오 브리지](../scripts/watch-kakao-export.cjs), [수집 검토](../platform/server/channel-ledger.js) |
| Context Traceability | 구현됨 | 원문 참조·해시·시각, 결정의 대안·이유, 변경·대체 이력, 요구사항→계획→작업→결과 추적을 저장한다. 자유로운 모든 지식 그래프 관계를 자동 추론하는 기능과는 구분한다 | [Context 저장](../platform/server/context-ledger.js), [통합 출처](../platform/server/context-sources.js), [작업 추적](../platform/server/work-governance.js) |
| Smart Retrieval | 구현됨 / 설정 필요 | 출처가 있는 키워드 검색과 승인된 자료의 의미·키워드 결합 검색이 있다. 의미 검색은 OpenAI 연결·색인 활성화가 필요하다. 미설정 시 키워드 검색으로 전환하며, 검색 결과를 생성형 답변으로 꾸미지 않는다 | [검색 서비스](../platform/server/semantic-service.js), [검색 화면](../platform/web/src/semantic-search.jsx) |
| Risk Detection | 부분 구현 | 미해결 충돌·필수 질문·근거 변경·범위 변경·기한 초과·보류를 규칙으로 탐지하고 Nora 보조 분석을 연결한다. 모든 사업 정책의 의미 충돌이나 미래 위험을 완전 탐지하는 것은 아니다 | [규칙 기반 제안](../platform/server/insights.js), [사전 검증·분류](../platform/server/work-governance.js), [Nora 분석](../platform/server/work-ai-ledger.js) |
| Pre-flight Check | 구현됨 / 설정 필요 | 최신 근거·요구사항·정책·범위·고객 확인 사항을 점검하고 승인 결과를 실행 조건에 연결한다. AI 분석은 별도 Nora 설정이 필요하다 | [검증·승인·실행 조건](../platform/server/work-governance.js), [분석 실행](../platform/server/work-ai-routes.js) |
| Progress Monitoring | 구현됨 | 작업 담당자·상태·기한·보류와 고객 답변 대기, 일일 기록, 알림을 확인한다. 담당자별 생산성 예측 또는 완성된 일정 간트는 별도다 | [작업](../platform/server/work-item-ledger.js), [질문](../platform/server/question-ledger.js), [알림](../platform/server/dashboard.js), [Daily 기록](../platform/server/insights.js) |
| Scope & Conflict Control | 구현됨 | 기능·경로 범위의 중복 점검과 잠금, 정책·근거 변경 시 재검토, 실행 결과의 범위 이탈 확인이 있다. Nora가 제안해도 담당자가 범위를 확정한다 | [범위 승인·충돌 검사](../platform/server/work-governance.js), [실행 범위 검사](../scripts/run-implementation.js) |
| Task Automation | 부분 구현 / 설정 필요 | 요청 분류→검토→계획→작업 등록→실행 요청→패치·PR→검수 연결이 있다. 무인 병합·배포·고객 발송까지 자동 완료하는 흐름은 아니다 | [채널 업무 연계](../platform/server/channel-workflow.js), [계획](../platform/server/implementation-ledger.js), [결과 연결](../platform/server/work-result-bridge.js), [질문 발송](../platform/server/question-routes.js) |
| Auto Deliverables | 부분 구현 | 제안서·견적서·계약서의 템플릿 작성·Nora 보정·출력은 있다. 회의록·보고서·WBS를 같은 템플릿 엔진으로 자동 생성하는 범용 산출물 기능은 확인되지 않았다. AI 구현 계획의 작업 목록을 정식 WBS 문서 생성으로 보지 않는다 | [지원 문서 종류](../platform/server/commercial-contract.js), [출력](../platform/server/commercial-export.js), [예시 지식 화면](../platform/web/src/preview-work.jsx) |
| Knowledge Reuse | 부분 구현 | 접근 가능한 원본 프로젝트의 확정 지식을 검토해 선택한 요약만 새 프로젝트 후보로 가져온다. 원문 권한·최신 근거를 재확인한다. 과거 사례의 자동 추천은 제한적이다 | [명시적 지식 가져오기](../platform/server/context-ledger.js), [지식 UI](../platform/web/src/context.jsx) |
| Pattern Library | 부분 구현 | 같은 쟁점 식별자에 연결된 확정 지식·회고를 선택한 프로젝트 사이에서 비교한다. 반복 원인·해결법의 자동 추출·정규화·추천 라이브러리는 아니다 | [patterns 구현](../platform/server/insights.js), [비교 UI](../platform/web/src/insights.jsx) |
| Planning Intelligence | 프리뷰만 / 부분 구현 | 실제로는 기한·보류·회고 관련 규칙 제안이 있다. 과거 일정·변경 실적으로 capacity를 예측하거나 근거를 이어가며 기획 대화를 수행하는 실제 서비스는 확인되지 않았다 | [현황 제안](../platform/server/insights.js), [기획 체험](../platform/web/src/preview-work.jsx), [프리뷰 범위](workflow-preview.md) |
| Access Control | 구현됨 | 로그인·역할·프로젝트 참여자 기준 조회·승인 제한과 구성원 관리 UI/API가 있다. 관리자가 기존 계정을 추가하고 권한을 바꾼다. 본인·마지막 관리자, 진행 중 담당 업무, 담당 이력 보호를 적용한다. 신규 계정 생성은 기존 별도 절차다 | [인증](../platform/server/auth.js), [구성원 API](../platform/server/project-members.js), [구성원 UI](../platform/web/src/project-members.jsx), [기존 계정 생성 도구](../scripts/provision-user.js) |
| Data Isolation | 구현됨 | API·출처 검색·의미 검색은 프로젝트 범위를 확인하고, 교차 프로젝트 지식은 명시적인 권한 검사와 검토를 거친다. 고객별 물리 DB 분리는 현재 구조의 목적이 아니다 | [API 권한](../platform/server/server.js), [검색](../platform/server/semantic-service.js), [지식 반영](../platform/server/context-ledger.js) |
| Secure Abstraction | 부분 구현 / 프리뷰만 | 공유할 본문을 사람이 선택하고 검토하는 절차는 있다. 고객 식별정보를 자동 탐지·마스킹하고 일반화 품질을 검사하는 실제 서비스는 확인되지 않았다. 마스킹 화면은 예시다 | [선택한 요약 반영](../platform/server/context-ledger.js), [마스킹 예시](../platform/web/src/preview-support.jsx) |
| Compliance | 부분 구현 / 프리뷰만 | 변경·승인·실행 감사 이벤트는 저장한다. 고객 원본·검색 색인·실행 로그·백업의 보존 기한과 삭제 작업을 통합 관리하는 실제 기능은 확인되지 않았다. 보존 설정 화면은 예시다 | [이벤트 저장](../platform/server/ledger.js), [감사 이력](../platform/server/work-governance.js), [보존 정책 예시](../platform/web/src/preview-support.jsx) |
| Execution Routing / CLI Adapter | 부분 구현 / 설정 필요 | 승인 작업 큐·실행기 토큰·heartbeat·결과 표준화·만료 처리가 있다. 현재 실행 스크립트는 Codex이고 프로젝트 큐에서 승인 작업을 받는다. 중앙·개인 장치 지정 라우팅과 Claude Code 어댑터는 확인되지 않았다 | [실행 큐](../platform/server/execution-queue.js), [실행기 프로토콜](../platform/server/implementation-runner.js), [Codex 실행](../scripts/run-implementation.js) |
| Desktop App / Streaming / Offline | 프리뷰만 | 중앙·개인 실행 대상 선택, 오프라인·미설치·인증 오류 체험은 있다. 실제 Electron/Tauri 패키지, 개인 장치 연결 UI, CLI 응답의 실시간 대화 스트리밍은 확인되지 않았다. 기존 웹 실행 요청의 상태·오류·결과 조회는 별도로 존재한다 | [실행 프리뷰](../platform/web/src/preview-work.jsx), [실제 실행 UI](../platform/web/src/implementation.jsx), [실행기 설정](../platform/web/src/execution-queue.jsx) |

## 대시보드 기획에서 추가로 확인한 차이

| 기획 내용 | 판정 | 실제 경계와 후속 판단 |
| --- | --- | --- |
| 팀원별 Gmail 연결·고객 주소로 수집·첨부 포함 | 부분 구현 / 설정 필요 | 현재는 프로젝트별 Gmail 라벨·검색 조건과 자격증명을 설정한다. 메일 본문은 수집하지만 첨부파일은 자동 수집하지 않는다. 개인별 OAuth 연결·고객 주소 관리 UX는 추가 설계가 필요하다. [근거](../platform/server/integration-adapters.js) |
| 회의록을 회사 양식으로 정리하고 Drive에 사본 자동 저장 | 부분 구현 / 미구현 | 음성 전사·텍스트 등록·출처 저장은 있다. 회의록 전용 회사 양식 변환과 Drive로 사본을 쓰는 경로는 확인되지 않았다. Drive 연결은 현재 읽기 수집이다. [전사](../platform/server/transcription-worker.js), [Drive 어댑터](../platform/server/integration-adapters.js) |
| 자료 등록→결정 후보→점검→고객 확인 메일 초안 | 부분 구현 | 필요한 개별 서비스는 있지만 모든 자료 유형을 등록 즉시 이 순서로 끝내는 단일 자동 흐름은 아니다. 사람의 검토와 기준 반영을 거친 다음 질문·작업으로 이어간다. [후보](../platform/server/context-ai-ledger.js), [질문·초안](../platform/server/question-routes.js) |
| 자료를 올린 사람이 결정을 확정 | 부분 구현 | 확정 권한은 현재 관리자·검토자다. 업로더가 일반 실무자일 경우 직접 확정할 수 없다. 업로더 검토와 공식 기준 승인 역할을 같게 둘지 제품 정책 결정이 필요하다. [역할 검사](../platform/server/context-ledger.js) |
| 프로젝트별 AI 허용·금지 | 부분 구현 | OpenAI 연결의 `enabled`는 의미 검색·STT 자격증명 사용을 제어한다. Nora 문서·Context·업무 분석을 모두 막는 프로젝트 전체 AI 금지 정책은 아니다. 화면에서 전체 AI 금지로 안내하면 안 된다. [Provider 설정](../platform/server/provider-settings.js), [개별 Nora 실행 설정](../platform/server/start.js) |
| 고객 회신 자동 인식·고객별 3일/7일 알림 기준 | 부분 구현 | 질문·발송·답변·검토·지연 추적은 있다. 모든 메일 회신을 고객 확인 상태로 자동 확정하지 않으며, 알림함은 실제 상태·기한을 규칙으로 집계한다. 고객별 임계값 관리와 기획 기준 전체 반영은 후속 확인이 필요하다. [질문](../platform/server/question-ledger.js), [알림](../platform/server/dashboard.js) |
| 확인·재촉·답장 메일은 초안만, 사람이 발송 | 구현됨 / 범위 확인 필요 | 초안과 명시적 검토·발송 경로가 있고 자동 발송과 구분한다. 운영 정책이 외부 메일 도구에서만 보내기로 확정되면 AINS 발송 버튼의 제공 범위를 맞춰야 한다. [발송 API](../platform/server/question-routes.js), [발송 서비스](../platform/server/question-outbound.js) |

## 이번 개선 변경 확인

| 개선 | 반영한 기능 | 실제 제한과 확인할 조건 | 근거 |
| --- | --- | --- | --- |
| 한국어 업무 용어 | ‘확정본’, ‘버전’, ‘요구사항·결정’, ‘작업 전·후 점검’으로 화면 표시를 정리하고 확정본의 뜻을 사용 안내에 설명 | 내부 API·DB 식별자와 이미 저장된 원문·AI 결과는 그대로 유지. 확정본은 새 자료 등록만으로 자동 교체되지 않음 | [사용 안내·메뉴 연결](../platform/web/src/App.jsx), [문서 상태·확정 동작](../platform/web/src/operations.jsx), [문서 변경 검토](../platform/web/src/review.jsx) |
| 자유로운 업무 메뉴 | 번호 없는 6개 업무 영역과 구성원·설정 관리 메뉴, 재사용 자료의 지식 탭 진입, 기존 `validate` URL의 작업 영역 호환 | 업무 종류별 탐색이며 완료율이나 순차 진행 상태가 아님. 작업 전 점검·결과 검수는 ‘작업·고객 질문’ 안에서 제공. 전역 이동 시 편집 보호 유지 | [업무 영역](../platform/web/src/workspace-flow.mjs), [메뉴](../platform/web/src/workspace-shell.jsx), [URL 호환](../platform/web/src/workspace-navigation.mjs), [편집 보호](../platform/web/src/App.jsx) |
| 구성원 관리 | 구성원 목록·역할·담당 작업/질문/활성 범위 수, 관리자에 의한 가입 계정 추가·역할 변경·해제, 변경 감사 이력 | 신규 계정 생성·초대 메일 발송 없음. 작업별 대표 담당자는 1명. 본인 변경·마지막 관리자 제거를 막고, 진행 중 담당 업무가 있으면 열람자 전환을 막음. 담당 이력이 남아 있으면 해제 대신 권한 조정 | [구성원 서비스](../platform/server/project-members.js), [화면](../platform/web/src/project-members.jsx), [HTTP 검증](../platform/tests/project-members-http.test.js) |
| 서버의 비공개 저장소 확인 | 관리자가 프로젝트별 읽기 토큰을 등록·교체·삭제. 프로젝트와 저장소에 묶어 암호화 저장하고 실제 브랜치 확인에 사용. 인증·권한·호출 제한·빈 저장소·브랜치 없음 상태를 구분 | 토큰 저장에는 서버 암호화 키가 필요. 인증 연결 우선순위는 프로젝트 읽기 토큰→동일 프로젝트·동일 저장소의 활성 PR 연결→서버 읽기 연결→공개 조회. 읽기 연결 자체는 PR 쓰기 권한을 추가하지 않음 | [접근 서비스](../platform/server/repository-access.js), [읽기 연결 UI](../platform/web/src/repository-access.jsx), [브랜치 확인](../platform/server/repository-check.js), [접근 검증](../platform/tests/repository-access.test.js) |
| 실행기의 비공개 저장소 다운로드 | 개인 PC의 실행기에 `AINS_GITHUB_READ_TOKEN`을 설정하면 승인된 저장소·브랜치를 Git으로 내려받을 수 있음 | 서버에 저장한 읽기 토큰은 실행기로 전달하지 않음. 실행기 토큰은 Git 다운로드 프로세스 환경에만 사용하며 모델 프롬프트·모델 프로세스 환경·저장소 URL에는 넣지 않음. 코드 패치는 검토 후 별도 PR 절차로 연결 | [실행기 인증 처리](../scripts/run-implementation.js), [실행기 검증](../platform/tests/implementation-executor.test.js), [PR 서비스](../platform/server/github-delivery.js) |

위 항목은 실제 코드·UI 연결을 읽어 반영했다. 연결 토큰의 유효성, 조직의 SSO·승인 상태, 개인 PC의 CLI 설치·인증은 실행 환경별로 확인해야 한다. 관련 테스트 파일 링크는 검증 범위의 근거이며, 이 감사에서 테스트를 직접 실행했다는 의미는 아니다.

## 다음 인수 검증

- 별도 테스트 프로젝트에서 구성원 역할별 접근, 비공개 저장소의 서버 확인과 실행기 다운로드, 업무 영역 왕복과 편집 보호를 먼저 확인한다.
- 선정한 문서 한 개와 업무 채널 한 종으로 수집→원문 확인→결정 승인→사전 점검→작업·질문→실행 결과→검수→지식 후보의 근거가 끊기지 않는지 확인한다.
- 개인 Claude CLI/Desktop이 이번 MVP 출시 필수인지 먼저 결정한다. 필수라면 현재 Codex 실행기와의 차이를 별도 구현 범위·인수 조건으로 둔다.
- 회의록·보고서·WBS 중 실제 MVP 산출물 1~2종, 프로젝트 전체 AI 금지 정책, 재사용할 정보와 보존·삭제 범위를 별도로 확정한다. 화면 체험이 있다는 이유로 완료 처리하지 않는다.

감사 중 테스트를 새로 실행하거나 운영 데이터를 읽지는 않았다. 코드·스키마·관련 테스트 파일의 존재를 확인한 결과를 실제 운영 성공 또는 고객 인수 완료로 표기하지 않는다.
