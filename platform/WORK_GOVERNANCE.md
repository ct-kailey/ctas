# 업무 실행 검토와 추적

## 실행 흐름

승인된 요구사항/정책 → 사전 점검 → Nora 분석(선택) → 검토자 범위 승인 → 작업 시작 → 결과물 연결 → 규칙/Nora 검수 → 검토자 실제 대조 → 작업 완료 → 범위 해제.

고객 요청은 별도 분류 검토에서 시작한다. 규칙 분류는 키워드로 `suggested_category`만 제시하며 실제 `category`는 항상 `uncertain`이다. 검토자가 근거를 대조하여 확정한 분류를 `classification_id`로 사전 점검에 연결한다. 승인된 계획의 `plan_id`를 사전 점검하면 작업 등록 이전에 전체 계획 범위를 예약할 수 있고, 이후 기존 작업 등록 흐름을 사용한다. 개별 작업은 `work_item_id`로 더 좁게 점검할 수 있다. 원문에 없는 계약 합의나 작업을 자동 생성하지 않는다.

## 규칙 점검과 AI 판단의 구분

- 규칙 점검: 승인 상태/해시/Context 버전, 등록된 미해결 충돌, 임시 구현 표현, 근거 누락, 기능·경로 중복, 수용 기준과 결과물의 연결, 경로 범위와 테스트 보고 상태를 확인한다.
- 관련 자료: 명시적으로 선택한 근거 + 연결된 계획의 기준선 + 승인된 자료의 키워드 일치 자료를 최대 30개, 총 100,000자로 제한한다. 최근 자료 200개에서 검색하므로 `coverage.catalog_has_more`가 참이면 전체 자료를 확인했다고 해석하면 안 된다.
- Nora 분석: 별도 승인된 AI 실행을 통해 의미 충돌, 누락, 영향 범위와 확인 질문을 제안한다. AI 근거는 제공된 `type:id`만 인용할 수 있다. 결과/버전/실행 ID는 별도 `nora_analysis`에 보존하며 규칙 결과를 덮어쓰지 않는다.
- 사람이 확정: 영향 범위, 담당자, 실제 결과의 수용 기준·정책 반영, 유지보수 분류. `claimed`는 연결을 주장한 상태이며 실제 요구사항 충족을 보장하지 않는다.
- 단순 확인 체크나 사유 입력으로 차단 점검을 무시할 수 없다. 근거 변경, 충돌 해결, 질문 답변 확정, 새 점검/검수가 필요하다.

## 저장 모델

| 테이블 | 저장 내용 |
|---|---|
| `work_preflights` | 요청 ID, 계획/작업, 승인 근거와 해시, Context·설정·저장소 기준선, 수용 기준, 영향 범위 후보, 규칙 결과, Nora 분석, 검토 결정 |
| `work_scope_locks` | 승인한 기능/경로/정책 참조, 담당자, 예약·해제 상태와 이유 |
| `work_result_artifacts` | PR·커밋·문서·테스트·기타 결과, URL/본문, 브랜치/커밋 SHA, 변경 경로, 연결한 수용 기준·정책, 테스트 상태와 제출자 |
| `work_result_validations` | 선택한 결과물 불변 스냅샷, 요구사항/정책/범위 대조표, 규칙/Nora 결과, 사람의 항목별 실제 대조 근거 |
| `maintenance_classifications` | 고객 요청과 근거, 잠정 분류, 불확실성·확인 질문, 검토자가 확정한 분류·사유 |

모든 연결은 프로젝트를 포함한 복합 외래키로 보호된다. 입력 스냅샷·완료 결정·등록 결과물은 덮어쓰거나 삭제할 수 없다. 요청 UUID의 같은 입력 재전송은 재사용하고, 다른 입력은 409를 반환한다. 사람이 확인하는 변경에는 `expected_version`이 필요하다.

## Scope Lock 의미

동일 기능 키 또는 동일/상하위 디렉터리 경로가 겹치는 활성 예약은 프로젝트 단위 advisory transaction lock으로 직렬화하여 둘 다 승인되지 않게 한다. `src/auth`와 `src/auth/login.ts`는 겹치고 `src/authentication`은 겹치지 않는다. 정책은 읽기 근거이므로 같은 정책을 참고한다고 독점 잠금하지 않는다. 이는 애플리케이션의 작업 충돌 예약이며 실제 Git 파일 잠금이 아니다.

범위 승인 후 새로운 Main Context 버전, 근거 수정·철회, 설정 또는 저장소 기준 SHA 변경이 있으면 진행이 중단된다. 새 미확정 충돌은 Main Context 버전 증가 전에도 다시 조회하여 차단한다. 공개된 기존 사전 검토를 덮어쓰지 않고 기존 범위를 해제한 뒤 새 점검을 승인한다. 실행 대기/진행 중인 코드 작업 또는 GitHub 발행 중에는 범위를 해제할 수 없다.

공통 잠금 순서는 `ains-work-items:<project>` → `ains-context:<project>` → 설정/근거 → 업무 행이다. 호출자는 업무 행 잠금 이전에 `lockGovernanceProject()`를 호출한다. 네트워크 요청을 DB 트랜잭션 안에서 기다리지 않는다.

## API

프로젝트 경로 `/api/projects/:p/work-governance` 아래:

| 메서드/경로 | 용도 |
|---|---|
| GET `/` | 사전 검토, 예약, 결과물, 검수, 분류 각 최신 100개 |
| POST `/preflights` | `{request_id,work_item_id?,plan_id?,requirement?,title?,source_refs?,resources?,assignee_id?,classification_id?}` |
| GET `/preflights/:id` | 동결 근거, 점검, 현재 staleness, 중복 범위, 승인/예약 조회 |
| POST `/preflights/:id/approve` | `{expected_version,note,acknowledge_findings:true,resources?,assignee_id?,resolutions?}` |
| POST `/locks/:id/release` | `{note}`; `/scope-locks/:id/release` 별칭 지원 |
| POST `/artifacts` | 결과물 등록. 종류, 제목, 링크/본문, 변경 경로, 수용 기준·정책 연결, 테스트 상태 |
| POST `/validations` | `{request_id,preflight_id,artifact_ids}`; 이전 실패 결과를 제외하고 수정 결과를 선택 가능 |
| GET `/validations/:id` | 대조표와 최신 근거 여부 |
| POST `/validations/:id/review` | `{expected_version,decision:'accepted'|'changes_requested',note,matrix_checks:[{id,status:'verified'|'not_applicable',reason}]}` |
| POST `/classifications` | `{request_id,text,source_refs?}` |
| GET `/classifications/:id` | 분류 근거와 현재 유효성 |
| POST `/classifications/:id/review` | `{expected_version,category,note}` |
| GET `/trace/:workItemId` | 원문 → 요구사항/계획 → 업무 → 범위 → 구현 실행/커밋·PR/결과물 → 결과 검수 |

범주: `in_scope_maintenance`, `bug_fix`, `requirement_change`, `new_feature`, `commercial_review`, `uncertain`. 범위 내 유지보수 확정에는 승인된 계약 근거가 필요하다. 그 밖의 확정도 승인된 근거 없이 진행할 수 없다.

코드 결과 수용에는 변경 파일과 범위 내 경로, 통과한 테스트 결과물이 필요하다. 모든 수용 기준은 선택한 결과물에 연결되어야 하고 검토자가 `verified` 근거를 기록해야 한다. 정책은 실제 적용 검증 또는 적용 제외 사유가 필요하다. Nora가 누락 또는 차단 사항을 제시했다면 새 결과로 다시 검수한다. 파일/테스트 상태를 직접 등록한 경우 출처는 `user_submitted`이고 독립 실행 검증 완료로 표시하지 않는다. GitHub PR/커밋은 별도 신뢰된 실행 결과와 함께 대조한다.

## 통합 함수

- `assertWorkGovernance(db,p,workId,{completion:false})`: 업무 시작/QA 진행에 활성 승인 범위, 최신 근거, 미해결 충돌과 차단 질문 확인.
- `assertWorkGovernance(...,{completion:true})`: 위 조건 + 최신 결과 검수 승인 + 이 작업 수용 기준 포함.
- `assertPlanGovernance(db,p,planId)`: 계획 전체 범위 또는 모든 작업의 승인 범위 필요. 일부 작업 승인만으로 전체 계획 실행 불가.
- `releaseWorkScope(db,p,workId,actor)`: 작업 완료 후 해당 범위 해제. 계획 범위는 모든 작업 완료 후 해제.
- `getAnalysisInput(db,p,type,id)`: 근거/수용 기준/구성원/입력 해시를 Nora 작업 분석에 제공. 결과 검수는 선택한 `work_artifact` 근거도 포함.
- `recordNoraAnalysis(db,p,type,id,{input_sha256,result,trace_id,actor_id?})`: 승인된 Nora 결과를 검토 대기 대상에 한 번 연결한다.

`type`은 `preflight`, `validation`, `classification`. 외부 통신 전 입력을 저장하고, 완료 후 해시/현재 근거를 다시 대조해야 한다. Nora 실행·승인·재시도는 `work-ai` 모듈이 관리한다.

## 확인한 오류 경로

403 프로젝트/역할 권한, 409 요청 ID 재사용·버전 충돌·변경된 근거·작업 중복·미해결 질문·검수 차단, 413 입력 크기, 502 알 수 없는 AI 근거/검수 항목. 원본·보고서·결정은 실패 후에도 보존된다. 외부 메시지 전송이나 Git 실행은 이 모듈 자체에서 수행하지 않는다.

## 실행 결과 → 검수 → Context 연결

`work-result-bridge.js`는 서로 분리되어 있던 실행 결과, 검수, 질문, Context 후보를 연결한다.

- `POST /work-governance/import-execution {request_id,execution_id}`: `patch_ready` 실행에 동결된 사전 검토 ID별로 변경안 결과물·명령 관찰 결과물·검수 초안을 원자적으로 생성한다. 실제 중복 방지 기준은 실행 ID와 사전 검토 ID이며 다른 호출자가 재시도해도 동일한 결과물 ID를 반환한다. `request_id`는 호출 상관관계 입력이고 실행 자체가 영구 중복 방지 키다.
- `importExecutionResult(pool,project,executionId,user)`: 실행 완료 트랜잭션을 커밋한 후 호출한다. 근거 변경 등으로 실패해도 완료된 원본 실행을 되돌리지 말고 검수 연결 보류를 표시한다. 나중에 수동 가져오기로 재시도할 수 있다. 기존 가져오기 결과의 재조회는 기준선이 바뀌어도 원본 이력을 반환한다.
- 미커밋 패치는 `kind:other`, `payload.result_kind:code_patch`로 구분한다. 이를 커밋이나 발행된 PR로 표시하지 않는다. 원본 전체 패치 해시와 인증이 필요한 다운로드 경로를 저장하며, AI/화면용 패치 본문은 30,000자까지 표시한다. 명령/AI 보고 내용도 미리보기 한도를 명시하고 원본 실행에 연결한다.
- 수용 기준은 승인 계획의 의도된 연결을 그대로 표시하며 `coverage_mapping:intended_from_execution_plan_not_verified`이다. 종료 코드 0이나 AI의 “테스트 통과” 주장으로 테스트 상태를 확정하지 않는다. 자동 등록한 테스트 결과는 `unknown`이고 실제 테스트 근거와 사람 검토 전까지 검수 수용이 차단된다.
- 작업별 범위를 나누어 실행한 경우 각 검수는 자기 범위의 파일과 전체 예약 어디에도 포함되지 않은 파일을 포함한다. 범위 밖 변경이 작업별 분할 뒤에 숨지 않게 한다.
- `POST /work-governance/preflights/:id/questions {assigned_to,recipient,channel,due_at?,question_ids?,expected_version?}`: 규칙/Nora의 확인 질문을 담당자와 고객 대상을 지정한 질문 초안으로 등록한다. 실제 메시지를 전송하지 않는다. 동일 질문 재시도는 기존 초안을 반환하고 다른 대상으로 중복 등록하려 하면 충돌을 반환한다.
- 사전 검토 질문은 아직 Task가 없어도 원래 계획과 연결되어 차단 여부가 적용된다. Task가 생기면 `attachPreflightQuestionsToWorkItems(db,project,planId)`가 기존 질문의 이력을 해당 작업에 연결한다.
- `POST /work-governance/validations/:id/propose-context {request_id,expected_context_version,expected_version,title?,reason}`: 사람이 수용한 검수 결과만 요구사항·결과물 원문 근거를 포함한 회고 후보로 등록한다. Main Context에는 자동 반영하지 않으며 기존 최종 검토를 거친다. 근거가 20개를 넘거나 요약이 40,000자를 넘으면 작업별로 분리하도록 안내한다.
- 작업 Trace 응답의 `github_deliveries`는 같은 계획의 실제 GitHub 발행 상태, 커밋 SHA, 브랜치, PR 링크만 보여주며 자격 증명은 포함하지 않는다.

## 완료 순서와 시작 전 실행 취소

코드 작업은 결과 검수 수용 → 필요한 GitHub 초안 PR 발행 → 연결 작업 완료 확정 → 결과 Context 후보 등록·최종 반영 순서로 진행한다. 결과 회고를 먼저 Main Context에 반영하여 그 작업 자신의 기준선을 오래된 상태로 만들지 않도록, 결과 Context 후보는 연결한 작업이 모두 완료된 후에 등록할 수 있다. 계획을 연결했지만 작업을 아직 등록하지 않았다면 작업 등록·완료를 먼저 요구한다. 작업/계획이 없는 독립 문서 검수는 이 제한에서 제외한다.

`POST /implementation-requests/:id/cancel {reason}`는 프로젝트 관리자만 사용한다. 실행기가 아직 시작하지 않은 `awaiting_runner` 요청을 `failed / EXECUTION_CANCELLED`로 종료하고 기존 실행 연결 파일을 같은 트랜잭션에서 폐기하며 취소 사유를 기록한다. 기준선이 변경된 대기 요청도 취소할 수 있으므로, 실행 불가와 범위 해제 불가가 서로 막히는 상태를 해소한다. 진행 중이거나 완료한 실행을 이 경로로 취소하지 않는다. 화면의 실행 상세에는 취소 사유 입력과 취소 버튼이 제공된다.

Nora 분석은 적용 가능한 형식인지 원격 승인 전에 확인한다. 빈 요약, 근거 없는 점검 주장, 너무 긴 기능/정책 키, 저장소 밖 또는 와일드카드 경로를 승인해 놓고 적용 단계에서 실패하는 상황을 방지한다. 승인 Webhook과 승인 요청 모두 실제 적용 정규화 검증을 거친다.
