# Question Tracker

질문을 담당자·요구사항 근거·대기 작업과 연결하고, 수신한 답변의 검토 결과를 Main Context 후보로 넘긴다. 외부 채널 수집과 메시지 발송은 별도 권한·설정이다.

## 화면과 상태

`고객 질문` → 질문 등록 → 외부 발송 이력 기록 또는 승인 발송 → 답변 기록 → 답변 검토 → Main Context 반영 제안.

| 상태 | 의미 | 연결 작업 차단 |
| --- | --- | --- |
| draft | 아직 질문하지 않은 초안 | blocking=true이면 차단 |
| waiting | 누가·언제·누구에게 질문했는지 기록됨 | 차단 |
| answered_pending | 답변 원문을 기록했으나 검토 전 | 차단 유지 |
| resolved | 검토자가 근거를 확인하고 답변 확정 | 최신 근거이면 해제. 근거 변경 시 다시 차단 |
| cancelled | 검토자가 사유를 남기고 질문 종료 | 해제 |

질문 본문과 최초 근거는 변경하지 않는다. 다른 질문은 새 질문으로 등록한다. 담당자·기한·연결 작업의 수정, 답변 보완·추가 확인은 버전과 변경 이력으로 보존한다. 연결 작업을 자동 완료하거나 고객 합의 내용을 자동 수정하지 않는다. 반영 제안은 검토 후보를 만들며 Main Context의 최종 승인 절차를 거친다.

`question`은 Context source catalog에서 출처·버전을 확인할 수 있다. 답변 확인 완료인 질문만 확정 자료로 조회된다. Main Context에 반영된 뒤 원문을 덮어쓰지 않는다.

## 변경된 답변의 후속 확인

확정한 답변의 원문이 수정·삭제되면 질문과 이를 인용한 Main Context에 근거 변경 상태를 표시한다. `blocking=true`인 질문은 연결 작업의 진행·검수 게이트를 다시 막는다. 기존 답변과 확정 이력은 유지한다.

검토자는 **후속 확인 질문 만들기**에서 사유를 입력한다. 새 초안은 담당자·수신자·채널·연결 작업을 이어받으며, 과거의 질문 시각과 변경된 출처를 새 질문의 유효 근거로 복사하지 않는다. 실제로 재질문한 시각을 기록하고 최신 답변·출처를 검토한다. 후속 질문은 현재 유효한 답변 출처가 최소 한 개 있어야 확정할 수 있다.

활성 후속 질문이 대신 작업을 차단한다. 최신 답변을 확정하면 그 질문으로 인한 대기가 해제되고, 후속 질문을 취소하면 이전 질문의 변경된 근거가 다시 차단 사유가 된다. 같은 질문에서 취소되지 않은 후속 질문은 하나만 만들 수 있으며, 기존·후속 질문은 상세 화면에서 서로 조회할 수 있다. 이전 Context의 대체·병합은 기존 사람 검토 절차를 따른다. 후속 질문의 진행 관리에서 작업 대기 여부나 기존 작업 연결을 해제했다면, 답변 확정 전에 원래 대기 작업과 차단 여부를 복원해야 한다. 종료하려면 사유를 남겨 취소하며 이전 질문의 차단은 유지된다.

## 자동 알림

`startQuestionWorker({pool,intervalMs,onError})`는 기본 1분 간격으로 기한이 지났거나 3일 이상 답변을 기다리는 질문을 점검한다. 담당자별 앱 내 알림을 저장하며 프로젝트 검토자는 전체 알림을 조회할 수 있다. 질문 버전과 한국 날짜를 기준으로 일일 중복을 방지하고 최신 알림만 표시한다. 해결·종료하거나 답변 검토 상태가 되면 대기 알림은 숨긴다.

외부 채널 자동 리마인드 발송은 하지 않는다. 후속 확인 메시지 초안을 검토·승인하여 직접 발송할 수 있다.

## Slack / Gmail 발송

1. 프로젝트 소유자가 전용 **발송용 Access Token**과 허용 수신 대상을 설정한다. 기존 읽기 전용 수집 토큰은 재사용하지 않는다.
2. Slack은 `chat:write`와 대상 채널 접근, Gmail은 `gmail.send` 권한이 필요하다. 현재 Gmail Access Token은 만료 시 소유자가 다시 등록해야 한다. OAuth 승인 화면이나 refresh token 자동 갱신은 이 모듈의 범위에 포함하지 않는다.
3. 질문·후속 확인·결과 안내 초안을 작성한다. 질문·확정 답변 기반의 결정적 템플릿으로 초안을 채우며 생성형 AI가 작성했다고 표시하지 않는다.
4. 검토자가 **실제 수신 대상과 전체 본문**을 승인한다. 초안의 내용 해시·질문 버전·발송 설정 버전에 승인을 결합한다.
5. 검토자가 체크박스를 확인하고 `승인한 내용 발송`을 눌러야 실제 provider API를 호출한다. 발송은 백그라운드 알림으로 자동 실행되지 않는다.

발송 대상은 Slack 채널 ID 또는 단일 이메일 주소만 지원한다. Gmail CC/BCC·첨부·스레드 이어보내기, Slack mention·block formatting은 현재 지원하지 않는다. Slack 본문은 plain text, 링크 미리보기를 끄고 보낸다. 이메일에는 고정 Message-ID를 사용하되 이를 provider 멱등성 보장으로 간주하지 않는다.

발송은 DB에서 먼저 `sending`을 기록하고 네트워크를 호출한다. 동일 요청의 동시·반복 발송은 다시 호출하지 않는다. 네트워크 타임아웃, 5xx, 모호한 결과는 `uncertain`; 중단된 sending도 2분 뒤 uncertain으로 전환한다. 자동 재시도하지 않으며 제공사에서 실제 발송 여부를 확인한 후 근거·메시지 ID를 기록한다. 실패한 건도 재전송하지 않고 새 초안을 검토한다. 완벽한 exactly-once 보장을 주장하지 않는다.

토큰은 서버의 `AINS_CREDENTIAL_ENCRYPTION_KEY`로 AES-256-GCM 암호화한다. AAD는 프로젝트·제공사·발송 용도를 포함한다. GET API, 감사 이벤트, 오류에 토큰을 반환하지 않는다. 저장소의 테스트는 제공사 응답 fixture만 사용하고 실제 메시지를 발송하지 않는다.

공식 API 근거:
- [Slack chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/)
- [Gmail messages.send](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail OAuth scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)

## 서버 계약

```js
const {mountQuestionRoutes} = require('./question-routes');
const {startQuestionWorker,getBlockingQuestions,lockQuestionWorkflow} = require('./question-ledger');
mountQuestionRoutes(projectRouter,{pool,write,review,encryptionKey,fetchImpl});
const worker = startQuestionWorker({pool,onError});
// shutdown: await worker.stop();
```

프로젝트 라우터는 세션 인증, 프로젝트 접근 확인, CSRF 검증 뒤에 연결한다. 서비스에서도 프로젝트·역할을 재검증한다.

- `GET/POST /questions`
- `GET/PATCH /questions/:id`
- `POST /questions/:id/asked`, `/answer`, `/resolve`, `/propose-context`
- `POST /questions/:id/follow-up` (`request_id`, `expected_version`, `reason`; 검토자)
- `GET /question-reminders`, `POST /question-reminders/refresh`, `POST /question-reminders/:id/acknowledge`
- `GET /question-outbound`, `PUT /question-outbound/:provider` (소유자만 설정 저장)
- `GET/POST /questions/:id/deliveries`
- `POST /question-deliveries/:id/review`, `/send`, `/reconcile`

질문 등록에는 request_id, title, question, recipient, channel, assigned_to, due_at, blocking, work_item_ids, source_refs가 필요하다. 이미 질문했다면 asked_by와 asked_at을 추가한다. 모든 일시는 시간대를 포함한 ISO 날짜다. source_refs는 `{type,id,sha256}`이며 프로젝트 원문과 대조한다.

쓰기 작업은 `expected_version`을 검사한다. 생성 및 발송 초안 등록은 request_id와 입력 해시로 멱등성을 보장한다. 질문→Main Context 제안은 별도로 expected_context_version을 검사한다.

진행/검수 게이트는 트랜잭션 안에서 `getBlockingQuestions(db,projectId,workItemId)`를 호출한다. 질문 상태·작업 연결을 수정하는 트랜잭션은 기존 작업 관리와 같은 `ains-work-items:<project>` advisory lock을 사용한다. Context lock도 필요하면 work-items → context 순서로 획득한다.

UI export: `QuestionsPanel({project,request,canWrite,canReview,notify,onChanged,onDirty})`.

## 검증

`TEST_DATABASE_URL`을 지정해 `node --test platform/tests/question-workflow.test.js`를 실행한다. 격리한 PostgreSQL schema를 매번 생성·삭제하며 프로젝트 격리, 역할, 동시 수정, 차단 해제, 알림 중복, 암호화, 승인/발송 중복, 모호한 네트워크 결과, MIME, Context 반영, CSRF를 검증한다.

## 검수 결과 → 고객 안내 초안

`GET /api/projects/:p/questions/:id/result-response-draft?expected_version=1`은 프로젝트 구성원에게만 제공되는 read-only 템플릿 API입니다. 질문에 연결한 각 작업의 최신 사전 검토와 최신 결과 검수가 승인된 경우에만 생성합니다. 최신 검수가 검토 대기·반려이면 과거 승인으로 대체하지 않습니다. 질문 버전, 원문 해시, Main Context 버전, 프로젝트 설정·저장소 기준, 현재 정책 충돌 및 필수 질문을 확인합니다. 범위 잠금이 해제된 완료 작업도 조회할 수 있습니다.

반환값은 `method: reviewed_result_template`, `generated_at`, `data_sha256`, `source_refs`, 검수/결과물/PR 연결 및 10,000자 이내 `subject`/`body`입니다. LLM 답변으로 표시하지 않습니다. 테스트의 `unknown`·`not_run` 상태를 통과로 바꾸지 않으며, 검수한 실행 ID·패치 해시와 일치하는 실제 `published` PR 발행 기록만 포함합니다. PR 병합이나 서비스 배포를 확인했다는 표현은 만들지 않습니다.

질문 상세의 **고객 메시지 작성 → 검토한 작업 결과로 초안 채우기 → 미리본 초안 적용**에서 사용합니다. 조회만으로 기존 입력을 바꾸지 않습니다. 수정한 제목·본문을 교체하려면 별도 체크가 필요하고, 수신 대상은 그대로 유지합니다. 적용 이후에도 담당자가 편집하고 기존 초안 등록·검토 승인·직접 발송 절차를 거칩니다. 이 API는 조회 시점의 근거를 제공하며 별도 발송 시점의 자동 재검증을 보장하지 않습니다. 초안에 조회 시점을 포함하고, 검토자가 발송 전 변경 내용을 확인합니다.

권장 순서: **결과 검수 → PR 발행 → 작업 완료 → 고객 결과 안내 초안 검토/발송 → 마지막 Main Context 회고 반영**. 회고 병합도 Main Context 버전을 바꾸므로, 병합 후에는 이전 검수 기준의 자동 초안을 생성하지 않습니다. 새 기준으로 다시 검토하거나 사실관계를 확인하여 직접 작성합니다.
