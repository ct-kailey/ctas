# 프로젝트별 외부 업무 도구 연결

## 사용 순서

1. 프로젝트의 **외부 연결**에서 연결 이름과 수집 대상을 지정한다.
2. 대상만 읽을 수 있는 토큰을 입력한다. 저장 직후에는 항상 **중지** 상태다.
3. **연결 테스트**로 대상 접근 권한을 확인한다.
4. **지금 수집**은 한 차례의 제한된 수집을 예약한다. **이 범위 자동 수집**은 지정 간격으로 계속 수집한다.
5. **대화 검토함**에서 원문과 분석을 검토한다. 사람이 등록한 기록만 이후 문서 파이프라인과 Main Context 검토에 사용된다.
6. 일시 중지는 신규 작업의 주장을 취소한다. 이미 수신된 증거·검토 기록은 보존된다.

토큰을 저장해도 메시지를 보내거나 외부 원본을 변경하지 않는다. 실제 사용자 계정·채널은 대상과 인증 정보가 입력되기 전까지 활성화되지 않는다.

## 연결별 수집 범위

| 연결 | 반드시 지정할 범위 | 구현된 수집 | 권한·제약 |
|---|---|---|---|
| Gmail | 라벨 ID + 선택적 검색 조건 | 메일 제목·본문·작성자·발송 시각·원본 링크 | `gmail.readonly` 권한. 첨부파일은 자동 다운로드하지 않음 |
| Google Drive | 폴더 ID | 지정 폴더 바로 아래 Google Docs·텍스트/JSON/XML 본문, 파일 메타데이터·링크 | `drive.readonly` 등 읽기 권한. 하위 폴더 재귀 수집 없음. PDF·Office·이미지는 링크를 수집하고 문서 업로드로 본문 추출 |
| Slack | 채널 ID | 채널 본문, 발견된 스레드의 답글, 수정·원본 조회 불가 감지 | 대상 접근 및 history/replies 권한. 앱 배포 유형별 API 호출 제한 적용 |
| Discord | 채널 ID | 해당 채널 메시지·수정·원본 조회 불가 감지, 첨부파일 이름 | 봇 토큰만 사용. Read Message History 및 필요한 Message Content 권한. 별도 스레드 채널은 별도 연결 지정 |
| GitHub | owner/repo | Issue·PR 제목/본문/상태, Issue·PR 대화 댓글 | Issues/Pull requests 읽기 권한. 코드 diff, 커밋 본문, PR 코드 줄별 review comment는 이 어댑터의 범위가 아님 |
| Microsoft Teams | 팀 ID + 채널 ID | 채널 게시물·답글·수정·삭제 표식 | Microsoft Graph 해당 채널 읽기 권한. 액세스 토큰 만료 시 교체 필요 |
| 카카오톡 | 대화방 식별자 | 한국어 텍스트 내보내기, 메시지 JSON, 사용자 PC 브리지 수신 | 공식 대화방 읽기 API로 가장하지 않음. 실제 PC watch 실행기는 별도로 연결해야 함 |

수집된 외부 원문은 명령이 아닌 자료로 취급한다. 자동 코드 실행, 외부 답변, 승인 또는 Main Context 확정으로 이어지지 않는다.

## 지속 수집 및 변경 처리

- 프로젝트별 암호화된 연결 설정, 페이지 커서, 기존 항목의 해시, 실행 이력, 스레드별 페이지 커서를 Postgres에 보관한다.
- 새 내용이 오래된 자료 뒤로 밀리지 않도록 **최신 페이지 → 스레드 → 기존 항목 재조회 → 과거 페이지**를 번갈아 처리한다. Gmail/Drive/Discord는 스레드 단계를 건너뛴다.
- 한 번에 원본 페이지 15개 항목을 조회한다. Gmail은 세부 메일을 제한된 개수로 조회하고, Drive는 지원 본문을 내보낸다. 워커 전체 실행은 170초, 원격 요청은 20초로 제한한다.
- 스레드는 마지막 조회가 오래된 순서로 조회하며, 다음 페이지 위치를 별도로 저장한다. 많은 스레드·긴 과거 이력의 전체 반영에는 여러 수집 주기가 필요하다.
- 기존 항목도 번갈아 원본을 재조회한다. 본문·상태·작성자·수정 시각 등이 달라지면 새 불변 증거 이벤트를 만든다. 기존 검토·승인 기록은 수정하지 않고 출처 변경 표시를 남긴다.
- **부분 페이지에 없다는 이유로 삭제로 판단하지 않는다.** 명시적인 삭제 표식, 범위 이탈(Drive 폴더/Gmail 라벨), 또는 특정 항목 재조회 결과 원본을 더 이상 찾지 못할 때 철회 이벤트를 만든다. 원본 조회 불가에는 삭제 외에 보관 기간 종료 등이 포함될 수 있다.
- 변경 증거는 DB에 먼저 저장한다. 검토함 전달 후 성공 표식을 기록하므로 프로세스가 중간에 종료되어도 동일 이벤트를 재전송하고 중복 기록을 피한다.
- `FOR UPDATE SKIP LOCKED`와 만료 가능한 lease로 한 연결을 한 워커만 처리한다. 여러 서버 인스턴스가 있어도 연결별 실행을 분리한다.
- 429는 `Retry-After`에 따라 다음 시도를 늦춘다. 일시적 실패는 커서를 보존한다. 인증 만료 또는 연결 생성자의 프로젝트 검토 권한 상실 시 자동 수집을 중지한다.
- 기존 대화 검토함의 프로젝트별 시간당 60배치 제한을 그대로 적용한다. 초과 시 1시간 후 재개한다.

## 원본 검색

연결 상세의 **원본 검색**에서 Gmail 또는 Drive를 직접 검색할 수 있다. 수집되어 있지 않은 자료도 제목·발췌·원본 링크로 조회한다.

- Gmail은 항상 등록된 `labelIds`를 별도 API 파라미터로 전송한다. 사용자의 검색식이 등록 라벨 범위를 넓힐 수 없다.
- Drive는 폴더 부모 조건을 유지하며 이름/본문 검색 문자열을 이스케이프한다.
- 외부 검색은 프로젝트 검토자만 실행할 수 있으며, 검색 자체로 원문이 검토함에 저장되지는 않는다.
- 자연어 의도 변환·전체 개인 메일함 통합 검색이 아닌, 연결 범위 안의 원격 키워드/서비스 검색식 검색이다.

## 카카오톡 내보내기 및 브리지

연결 상세에 한국어 카카오톡 내보내기 텍스트를 붙여넣을 수 있다. 지원 예:

```text
--------------- 2026년 10월 12일 월요일 ---------------
[고객] [오전 10:00] 이메일 인증으로 진행합니다.
상세한 예외 조건은 문서로 전달하겠습니다.
[개발] [오후 1:05] 확인했습니다.
```

```text
2026. 10. 12. 오후 1:05, 고객 : 이메일 인증으로 진행합니다.
```

날짜 없는 메시지는 임의 날짜를 붙이지 않고 오류로 반환한다. 작성자, 다중 행 본문, 한국 시간대(+09:00)를 보존한다. 같은 내보내기를 다시 가져오면 내용·작성자·시각 기반 ID로 중복을 줄인다. 내보내기는 카카오톡 네이티브 메시지 ID나 편집/삭제 이벤트를 제공하지 않으므로 편집·삭제 추적에는 안정된 메시지 ID를 공급하는 브리지가 필요하다.

외부 브리지는 다음 주소에 요청한다. 생성 시 직접 입력한 32자 이상의 토큰을 사용한다. 토큰을 URL에 넣지 않는다.

```http
POST /api/integration-bridge/{integration_id}
Authorization: Bearer <bridge-token>
Content-Type: application/json
```

```json
{
  "room_id": "registered-room",
  "batch_id": "stable-batch-id",
  "messages": [{
    "event_id": "stable-event-id",
    "message_id": "stable-message-id",
    "kind": "created",
    "author": "담당자",
    "text": "합의 내용",
    "sent_at": "2026-10-12T10:00:00+09:00",
    "changed_at": null,
    "url": null
  }]
}
```

동일 메시지 편집은 같은 `message_id`와 새로운 `event_id`, `kind: updated`, 실제 `changed_at`을 전달한다. 삭제는 `kind: deleted`, 빈 `text`, 실제 `changed_at`을 전달한다. 한 요청은 1–50개 메시지, 총 본문 20,000자 이하이다. 토큰·연결 ID·등록 room_id가 모두 일치해야 수집하며, 연결이 중지되어 있으면 거부한다.

## 서버 통합 계약

- 마이그레이션: `015_context_integrations.sql`
- `mountIntegrationRoutes(router, { pool, review, encryptionKey?, fetchImpl? })`
  - 기존 인증된 `/api/projects/:p` router에 마운트한다. 쓰기·설정·검색에는 검토자 미들웨어를 적용한다.
- `mountIntegrationBridge(app, { pool, encryptionKey?, fetchImpl? })`
  - cookie/session CSRF 미들웨어 앞에 마운트한다. 해당 단일 경로만 별도 Bearer 검증을 사용한다. 세션 인증 우회 범위를 넓히지 않는다.
- `createIntegrationWorker({ pool, encryptionKey?, fetchImpl?, pollMs? })`
  - `start()`, `stop()`, 테스트용 `runOnce()`를 반환한다.
- UI: `IntegrationsWorkspace({ project, request, canReview, notify, onChanged, onDirty })`

### 환경 변수

`AINS_CREDENTIAL_ENCRYPTION_KEY`: 정확히 32바이트를 base64로 인코딩한 키. 호환 별칭 `INTEGRATION_ENCRYPTION_KEY`도 지원한다. AES-256-GCM을 사용하고 프로젝트·연결·provider를 추가 인증 데이터에 바인딩한다. 키를 잃으면 저장된 인증 정보를 복구할 수 없으므로 배포 secret으로 관리해야 한다. API 응답·실행 로그에는 평문 또는 암호문 인증 정보를 노출하지 않는다.

Google은 액세스 토큰 또는 `refresh_token + client_id + client_secret`을 저장할 수 있다. 갱신은 고정 Google 토큰 엔드포인트에서 수행한다. 다른 provider의 액세스/봇 토큰은 만료 시 재입력한다. 전체 OAuth 앱 등록·동의 화면을 대신하지 않는다.

### 프로젝트 API

| 메서드 | 상대 경로 | 용도 |
|---|---|---|
| GET | `/integrations` | 안전한 연결 상태 목록 |
| POST | `/integrations` | 범위가 고정된 중지 상태 연결 생성 |
| PATCH | `/integrations/:id` | 활성/중지, 간격, 인증 교체 |
| POST | `/integrations/:id/test` | 대상 접근 확인 |
| POST | `/integrations/:id/sync` | 제한된 수집 1회 예약 |
| GET | `/integrations/:id/runs` | 최근 실행 이력 |
| POST | `/integrations/:id/search` | Gmail/Drive 범위 내 검색 |
| POST | `/integrations/:id/import` | 카카오톡 내보내기·JSON 가져오기 |

## 검증

독립 Postgres 스키마에서 권한 격리, 암호화/비밀 응답 제거, 중복 제거, 수정·철회·복원, 동시 claim, 호출 제한, 인증 만료, 브리지 범위, 내보내기 재입력을 검증한다. 원격 API는 결정적인 모의 응답으로 검증하며 실제 사용자 계정은 연결하거나 수집하지 않았다. 운영 채널별 초기 연결 테스트는 선택한 실제 대상과 적절한 토큰으로 수행해야 한다.

## 공식 API 근거

- [Gmail messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Google Drive files.list](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
- [Slack conversations.history](https://docs.slack.dev/reference/methods/conversations.history/), [conversations.replies](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Discord 채널 메시지 API](https://docs.discord.com/developers/resources/channel#get-channel-messages)
- [GitHub repository issues](https://docs.github.com/en/rest/issues/issues#list-repository-issues), [issue comments](https://docs.github.com/en/rest/issues/comments#list-issue-comments-for-a-repository)
- [Microsoft Teams channel messages](https://learn.microsoft.com/en-us/graph/api/channel-list-messages?view=graph-rest-1.0), [replies](https://learn.microsoft.com/en-us/graph/api/chatmessage-list-replies?view=graph-rest-1.0)

## 로컬 내보내기 파일 계속 확인하기

저장소에서 제공하는 `scripts/watch-kakao-export.cjs`는 사용자가 지정한 **단일 내보내기 파일**을 5초 간격으로 확인한다. 카카오톡 앱에서 대화를 자동으로 읽거나 내보내기를 실행하지 않는다. 사용자 또는 별도의 승인된 로컬 수집기가 해당 파일을 갱신하면 새 메시지를 자동으로 전송한다.

1. AINS에 카카오톡 연결을 만들고 대화방 식별자·브리지 토큰을 정한다.
2. 연결 테스트 후 해당 범위 자동 수집을 시작한다.
3. 터미널 환경 변수 `AINS_KAKAO_BRIDGE_TOKEN`에 같은 토큰을 설정한다. 토큰을 명령 인자나 파일 내용에 넣지 않는다.
4. 다음 명령을 실행한다.

```sh
node scripts/watch-kakao-export.cjs --file '/absolute/path/chat-export.txt' --integration '<connection-id>' --room '<registered-room>'
```

`--once`는 1회 수집 후 종료한다. `--state`로 체크포인트 위치를 바꿀 수 있다. 기본 체크포인트는 내보내기 파일 옆 `.ains-checkpoint.json`이며 원문·토큰은 저장하지 않고 전달된 이벤트 ID와 파일 해시만 기록한다. 체크포인트 권한은 0600으로 설정한다. 전송 결과가 불확실하면 동일 이벤트를 재전송해 서버 중복 제거를 이용한다. 429·일시 장애에는 대기 후 재시도하고, 인증 실패에는 종료한다. 원본 파일은 수정하지 않는다.

현재 배포의 기본 주소는 `https://ains-workspace-production.up.railway.app`이다. 다른 배포는 `AINS_BASE_URL`을 HTTPS 원점 주소로 설정한다.
