# 소통 채널 수집과 사람 검토

## 이번 구현 범위

대상 채널 준비, 공통 메시지 수집 API, 불변 원문 이벤트, Nora 대화 분석, 사람 검토함, 검토 후 기존 문서·기록 등록을 구현한다. 외부 계정 인증이나 실제 대화방 감시는 아직 연결하지 않는다. 모든 소스의 `connection_status`는 `not_connected`다. `enabled`와 `manual_intake_enabled`는 공통 수신 기능의 사용 여부이며 외부 watch 활성화 상태가 아니다.

사용 흐름: 수집·검토함 → 채널 준비 → 대화 가져오기 → Nora 분석 → 원문과 요약 대조 → 내용·업무 영역·유형·결정일 확인 → 검토 후 기록 등록. 미확정 논의와 잡담도 버리지 않고 검토함에서 확인하거나 제외할 수 있다. 이 단계의 등록은 요구사항 승인이나 기준선 발행을 실행하지 않는다.

## 채널별 연결 계획과 확인한 근거

| 채널 | 후속 연결 방식 | 필요한 조건 |
|---|---|---|
| Slack | Events API → 수신 큐, history/replies로 누락 보충 | 앱을 허용 채널에 추가, 해당 대화 읽기 권한, 서명 검증 |
| Discord | Bot Gateway → 생성·수정·삭제 이벤트 | 대상 서버·채널 권한, 필요한 Message Content intent, 재접속·resume |
| Teams | Graph 채널 메시지 구독 → 알림 → 본문 조회 | 조직 동의/RSC 등 읽기 권한, 구독 갱신, lifecycle 처리 |
| 카카오톡 | 별도 macOS 수집기 → 공통 수집 API | 로그인된 Mac 앱과 접근성 권한, 정확한 방 확인, 누락·불명확한 시각 표시 |

Slack·Discord·Teams의 외부 연결 프로세스는 Railway에서 구동할 수 있도록 설계한다. 카카오톡 참고 스킬은 macOS의 `atomacos`와 앱 UI를 이용한다. Railway Linux 컨테이너에서 같은 UI 스킬을 직접 실행하는 방식은 사용할 수 없다. 별도의 Mac 수집기를 두고 지정한 방만 읽어 서버로 전달하는 구성이 필요하다. 이번에는 스킬과 소스 코드를 검토했으며 설치·실행하거나 실제 카카오톡 대화를 읽지 않았다.

참고 스킬의 부분 제목 매칭과 열린 창 fallback은 장기 수집기에 그대로 사용하지 않는다. 후속 수집기는 방 식별이 모호하면 멈추고, 동일 내용 메시지의 충돌 가능성을 고려한 로컬 수신 이력을 유지해야 한다. 화면에서 사라진 메시지를 삭제 이벤트라고 추측해서도 안 된다. 읽음 표시·창 포커스 영향과 Mac 절전 중 수집 공백도 연결 설정에서 안내한다. 날짜를 확정할 수 없는 원문은 수집일을 대화일로 대체하지 않고 `sent_at:null`로 전달하며 원래 표시 문자열을 별도 증거로 보존하는 어댑터 확장이 필요하다.

확인한 문서(2026-09-27):
- [카카오톡 참고 스킬](https://github.com/team-attention/plugins-for-claude-natives/blob/main/plugins/kakaotalk/skills/kakaotalk/SKILL.md), [읽기 구현](https://github.com/team-attention/plugins-for-claude-natives/blob/main/plugins/kakaotalk/scripts/kakao_read.py)
- [Slack Events API](https://docs.slack.dev/apis/events-api/), [서명 검증](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [메시지 이력](https://docs.slack.dev/reference/methods/conversations.history/), [스레드 답글](https://docs.slack.dev/reference/methods/conversations.replies/)
- [Discord Gateway와 Message Content](https://docs.discord.com/developers/events/gateway)
- [Teams 채널 메시지 구독](https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage), [Graph 구독 만료](https://learn.microsoft.com/en-us/graph/api/resources/subscription?view=graph-rest-1.0), [Webhook 검증](https://learn.microsoft.com/en-us/graph/change-notifications-delivery-webhooks)

후속 우선순위는 Slack → Discord → Teams → 카카오톡을 제안한다. 실제 업무가 Teams에 집중되어 있다면 Teams를 먼저 연결한다. 연결 전 프로젝트, 조직/서버 ID, 정확한 채널 ID, 과거 수집 시작점, 담당 검토자를 지정한다. 광범위한 접근 권한을 받더라도 실제 수집은 별도 allowlist로 제한한다.

## 공통 데이터 모델

- `channel_sources`: 프로젝트 소속 채널의 제공자·외부 워크스페이스/채널 ID·기본 업무 영역·수신 사용 여부. 현재 외부 인증 정보는 저장하지 않는다.
- `channel_events`: 외부 이벤트/메시지 ID, 생성·수정·삭제 종류, 작성자·원문·링크, 원본 시각 문자열과 정규화된 시각, 수집 시각, payload 해시. 수정·삭제 이벤트도 새 행이며 기존 행을 덮어쓰지 않는다.
- `channel_inbox`: 분석 대상의 고정된 메시지 묶음, 입력 해시, 분석 결과와 Nora trace, 사람 검토, 등록 결과 ID. 원문이 변경되면 `evidence_changed`, 이미 등록했다면 `provenance_changed`도 표시한다.
- `channel_batches`: 배치 재전송의 멱등성 영수증. 동일 이벤트 묶음의 다른 배치 ID도 같은 검토 항목을 참조한다.

작성자 이름은 채널에서 관찰된 값이며 플랫폼의 승인 권한을 뜻하지 않는다. 날짜·채널·참여자 등의 원본 정보와 실제 검토자/검토 시각은 분리한다. 현재 원문 보존은 영구 이력 모델을 따르며 자동 파기 작업은 없다. 실제 조직 연결 전 보존 기간과 접근 범위를 설정할 별도 정책 단계를 추가한다.

## API

모든 경로는 `/api/projects/:p` 아래이며 기존 세션·프로젝트 권한·Origin·CSRF 검사를 적용한다. 아직 외부 서비스가 호출하는 공개 webhook 또는 장기 수집기 토큰 endpoint는 없다.

- `GET /channel-sources` → `{sources}`
- `POST /channel-sources` → `{source}`. owner/reviewer만 가능. 입력: `provider`, `name`, `external_workspace_id?`, `external_channel_id`, `default_domain_id?`.
- `PATCH /channel-sources/:id` → `{source}`. owner/reviewer, `{enabled?,manual_intake_enabled?}`.
- `POST /channel-sources/:id/ingest` → HTTP202 `{inbox,replayed}`. member 이상, `{batch_id,conversation_key,messages}`.
- `GET /channel-inbox` → `{items}`. 최근100건.
- `GET /channel-inbox/:id` → `{item}`. 원본 이벤트 증거 포함.
- `POST /channel-inbox/:id/accept` → `{item}`. owner/reviewer, `{title,text,domain_id,record_kind,decided_on?,reason,acknowledge_evidence:true}`.
- `POST /channel-inbox/:id/dismiss` → `{item}`. owner/reviewer, `{reason}`.

수신 메시지 예시:

```json
{
  "event_id": "provider-event-123",
  "message_id": "provider-message-123",
  "kind": "created",
  "author": "담당자",
  "text": "인증 만료 시간을 10분으로 확정합니다.",
  "sent_at": "2026-09-27T10:00:00+09:00",
  "changed_at": null,
  "url": null
}
```

배치당 최대50개 메시지, 전체 본문20,000자, 프로젝트당 시간당60개 새 검토 항목이다. 한 배치에는 메시지별 최신 버전 하나만 포함한다. 삭제 이벤트는 `text:""`이며 삭제 시각을 알면 `changed_at`으로 전달한다. 파일 첨부 다운로드는 이번 범위에 없다. 수신 ID가 같은데 내용이 다르면409로 거부한다. 수정·삭제로 근거가 바뀐 항목은 과거 결과를 그대로 등록할 수 없다.

## Nora 분석과 검토 경계

`ains-channel-triage-v1`의 단일 OpenAI `gpt-5.4-mini` 에이전트가 `channel_request`를 분석한다. 기본 reasoning effort는 low다. 출력은 다음 필드만 허용한다:

```text
classification: decision | action_item | requirement_change | discussion | noise
title, summary, reason: 검토용 한국어 텍스트
record_kind: decision | work_item | conversation | note
confidence: 0..1
evidence_event_ids: 입력에 있는 삭제되지 않은 내부 이벤트 UUID 목록
```

외부 이벤트 ID와 내부 근거 UUID는 구분한다. 모델이 지어낸 ID나 다른 프로젝트의 ID는 서버가 거부한다. 데이터 안의 명령문은 신뢰하지 않으며 결과는 기록 생성 권한을 갖지 않는다. 프롬프트와 선언 도구 목록만으로 시스템 차원의 도구 격리를 입증하지는 않는다. 합성 실행 trace에서도 도구·메모리 사용 여부를 확인한다.

검토자는 AI 요약과 원문을 대조하고 내용을 수정할 수 있다. 등록 시 수정한 본문과 수집 원문·메시지 ID·채널·시각을 함께 저장한다. 사람의 확인 결과는 `channel_inbox.review`에 남기며 기록은 기존 `documents/revisions/jobs`로 원자적으로 생성한다. 중복 클릭·응답 유실 후 같은 등록 요청을 재전송해도 같은 결과를 반환한다. 기준선 발행은 기존 업무 절차에서 따로 수행한다.

## 운영과 오류 처리

`queued → running → needs_review → accepted/dismissed`. 실패는 `failed`, 완료 여부를 알 수 없으면 `uncertain`이다. 실패한 AI 분석도 검토자가 원문을 직접 확인하여 수동 등록할 수 있다. 분석 중에는 등록을 막는다.

Postgres 큐의 `FOR UPDATE SKIP LOCKED`, 120초 작업 점유, 외부 호출 전 감사 이벤트를 사용한다. 작업 중 프로세스가 종료되거나 응답이 불명확하면 자동 재호출하지 않는다. Nora 토큰/발행 정보가 없으면 `TRIAGE_UNAVAILABLE`로 수동 검토를 안내한다. 운영 토큰은 `NORA_CHANNEL_TRIAGE_TOKEN`으로 주입하고 manifest 변경 후 재배포한다. 소스 원문과 비밀값을 로그에 출력하지 않는다.

후속 실제 watch에서는 채널별 수신과 대화 묶음을 만드는 단계를 추가한다. 단일 메시지마다 모델을 부르지 않고 스레드/주제와 짧은 대기 구간으로 묶되, 허용 범위를 넘으면 명시적으로 분할한다. Slack은 빠른 ACK와 서명 검증, Discord는 Gateway resume와 sequence, Teams는 구독 갱신과 본문 조회, Mac 수집기는 로컬 커서·연결 상태·공백 안내가 필요하다. 이 외부 watch 단계는 현재 활성화되지 않았다.

## 배포·검증 결과

2026-09-27 Railway 배포 `00ecc6e2-7171-4d46-b6a8-1ee86afa66d7`에서 공통 수집·검토함을 활성화했다. 전체 자동 테스트 342개(실패·스킵 0개), 감사 표시 보완 후 관련 DB 테스트 10개, 실제 Nora 합성 사례 6개가 통과했다. 로컬 브라우저에서 직접 입력·사람 검토·등록과 390px 화면을 확인했고, 운영에서는 새 합성 프로젝트로 9개 검증 항목을 통과했다. 운영 화면에서 등록 이후 원문 변경 표시와 고정된 원문·검토 결과를 확인했다.

- [통합 검증](../channel-verification.json)
- [운영 합성 검증](../channel-production-smoke.json)
- [로컬 UI 검증](../channel-inbox-ui-verification.json)
- [운영 백업 복원·마이그레이션 검증](../channel-backup-verification.json)

실제 소통 채널의 계정 연결이나 자동 감시는 시작하지 않았다.
