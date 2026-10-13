# 문서·대화 적재 데이터와 이력 정리 가이드

2026-09-28 현재 구현 기준. 팀원에게 자료 준비와 전달 방법을 안내하기 위한 문서다. 아래의 **실제 컬럼**, **JSON 내부 항목**, **본문 작성 권장 항목**을 구분한다. 이 문서는 DB나 운영 데이터를 변경하지 않는다.

## 1. 팀원에게 전달할 안내

> 자료마다 프로젝트, 업무 영역, 기록 유형, 제목, 원문, 신규 기록인지 기존 기록의 수정본인지를 알려주세요. 수정본은 기존 문서 ID를 함께 전달해 주세요. 원문의 출처, 발생·대화일, 결정일, 채널, 참여자, 원본 링크·외부 ID를 아는 범위에서 첨부해 주세요. 결정 내용에는 결정자·사유·적용 시점과 관련 요구사항을 본문에 적어 주세요. 모르는 날짜나 결정 여부는 추측하지 말고 미확정으로 남겨 주세요. 등록 시각과 등록자는 시스템이 자동 기록합니다.

자료 준비의 단위는 **원문 1개 + 등록 정보 1묶음**이다. 여러 파일을 모으면 파일명별로 정보를 매핑한다. 한 파일에 서로 다른 업무 영역이나 독립된 의사결정이 섞여 있으면 분리하거나 구간별 제목·관련 ID를 명시한다. 현재 API는 파일 1개씩 등록하며 일괄 manifest 업로드 기능은 없다.

## 2. 전체 구조

```text
projects                         프로젝트
  └─ project_domains             업무 영역
       └─ documents              문서·기록의 고정된 정체성
            ├─ revisions         버전별 원문 + history + 추출 결과
            │    └─ jobs         추출·정규화 실행 상태
            └─ reviews           기준선과 수정본 비교 + 사람의 결정
                 └─ answers      확인 질문의 답변과 근거

events                           등록·검토·승인·발행 등의 감사 이력
documents.baseline_revision_id   현재 발행된 기준선 리비전
```

`events.entity_id`는 여러 종류의 객체를 가리키는 텍스트 식별자다. 위 도식에서 모든 객체와 DB 외래키로 연결된다는 뜻은 아니다.

**같은 기획의 수정본은 같은 `document_id` 아래 새 `revision_id`**, 다른 주제·업무 영역·기록 유형은 새 `document_id`로 등록한다. `domain_id`는 업무 영역이고, `domain_pack`은 분석 설정·용어집이다. 두 값은 다르다.

## 3. 등록할 때 준비하는 데이터

‘필수’는 API 요건이다. 기본값이 있는 항목도 팀 전달 시에는 명시하는 편이 좋다.

| 전달 항목 | 입력/API 필드 | 구분 | 저장 위치·규칙 |
|---|---|---|---|
| 프로젝트 | URL의 `:project_id` | 필수 | `documents.project_id`, `revisions.project_id`. 프로젝트 이름을 전달하면 등록 담당자가 기존 ID와 매핑 |
| 업무 영역 | `domain_id` | 명시 권장 | `documents.domain_id`. 신규 등록에서 생략하면 기본 업무 영역, 수정본은 기존 문서 값 유지 |
| 기록 유형 | `record_kind` | 명시 권장 | `documents.record_kind`. 신규 등록에서 생략하면 `specification`, 수정본은 기존 문서 값 유지 |
| 제목 | `title` | 직접 입력은 필수, 파일은 권장 | `documents.title`, 최대 300자. 파일 등록에서 생략하면 파일명 |
| 원문 | `file` 또는 `text` | 둘 중 등록 방식에 맞는 값 필수 | 파일 API와 에디터 API가 별도. 저장은 `revisions.content` |
| 신규/수정본 구분 | `document_id` | 수정본일 때 필수 | 신규는 생략. 수정본은 기존 문서 ID를 지정하여 새 리비전 생성 |
| 출처·날짜·채널 등 | `history` | 선택, 출처는 명시 권장 | `revisions.history` JSONB. 허용 항목은 아래 표 참조 |

기록 유형의 허용값:

| 값 | 의미 | 자료 예시 |
|---|---|---|
| `specification` | 기획·요구사항 | 정책, 요구사항 명세, User Story와 수용 기준 |
| `conversation` | 대화 기록 | 회의, Slack·카카오톡 스레드 원문 |
| `decision` | 업무 결정 | 확정한 정책과 결정 근거 |
| `work_item` | 작업 기록 | DevOps 작업, 장애 조치, 구현 진행 내용 |
| `note` | 참고 메모 | 조사 자료, 참고 의견 |

출처와 유형은 별개다. Azure DevOps에서 가져온 User Story도 `specification`일 수 있고, Slack에서 나온 확정 사항은 `decision`일 수 있다.

파일은 PDF·DOCX·PPTX·XLSX·TXT·MD, 1바이트 이상 20 MiB 이하를 지원한다. 직접 입력은 공백뿐인 본문을 허용하지 않으며 UTF-8 기준 200,000바이트까지다. 한글은 글자 수와 바이트 수가 다르다. 직접 입력도 내부에서는 UTF-8 `record.md` 원문으로 보존한다.

Git 저장소와 브랜치는 문서 적재 자체의 필수값이 아니다. AI 구현 계획과 코드 실행을 진행하려면 별도의 `project_settings`에 목표·저장소·브랜치를 설정해야 한다.

## 4. `revisions.history`에 넣는 정보

아래 항목은 **별도 SQL 컬럼이 아니라 하나의 JSONB 컬럼 내부 키**다. 날짜·시각도 이 JSON 안에서는 문자열로 저장한다.

| 키 | JSON 타입·기본값 | 의미·입력 예시 | 제한 |
|---|---|---|---|
| `source_type` | 문자열 | 원문 출처: `azure_devops`, `slack` 등 | 파일 등록 기본 `file`, 직접 입력 기본 `editor` |
| `occurred_on` | 문자열 또는 `null` | 실제 업무·회의·대화 발생일 `2026-09-24` | 실제 날짜, `YYYY-MM-DD` |
| `decided_on` | 문자열 또는 `null` | 업무상 결정이 확정된 날짜 `2026-09-25` | 실제 날짜, `YYYY-MM-DD`; 미확정이면 `null` |
| `source_created_at` | 문자열 또는 `null` | 원본 시스템의 생성 시각 `2026-09-24T14:30:00+09:00` | 초와 시간대가 포함된 ISO 8601 시각; 원래 오프셋 보존 |
| `channel` | 문자열 또는 `null` | `#검사운영`, `Semi-auto 기획회의` | 최대 200자; 표시명이며 고유 채널 ID와 다름 |
| `url` | 문자열 또는 `null` | 원문·회의록·DevOps 항목 링크 | API 최대 2,048자, 화면 입력은 2,000자; 인증정보 없는 HTTP/HTTPS |
| `external_id` | 문자열 또는 `null` | `ADO-US-11363`, 원본 메시지/문서 ID | 최대 300자; 현재 자동 중복 제거 키는 아님 |
| `participants` | 문자열 배열, `[]` | `["기획 담당자", "개발 담당자"]` | 최대 50명, 항목당 200자; 플랫폼 사용자 FK는 아님 |
| `tags` | 문자열 배열, `[]` | `["semi-auto", "정책 변경", "v1.2"]` | 최대 30개, 항목당 100자 |

`source_type` 허용값은 `file`, `editor`, `slack`, `azure_devops`, `teams`, `kakaotalk`, `discord`, `email`, `meeting`, `other`다. 직접 붙여넣어도 실제 출처가 Slack이면 `slack`을 지정한다. 이 값만 지정해도 외부 채널이 연결되는 것은 아니다.

현재 `history`에는 위 9개 키만 허용한다. 임의의 `author`, `decision_maker`, `version`, `created_at` 등을 추가하면 거절된다. 배열의 미입력은 `[]`, 모르는 선택 날짜·문자열은 `null`로 전달한다. `history` 전체를 `null`로 전달하지 말고, 생략하거나 객체로 전달한다.

### 날짜는 네 가지를 구분한다

| 사례 | 저장 값 |
|---|---|
| 9월 24일 14:30에 원본 회의록 생성 | `history.source_created_at = "2026-09-24T14:30:00+09:00"` |
| 9월 24일에 업무 논의 진행 | `history.occurred_on = "2026-09-24"` |
| 9월 25일에 실제 정책 결정 | `history.decided_on = "2026-09-25"` |
| 9월 28일에 AINS에 등록 | `revisions.created_at`을 시스템이 자동 저장 |

`decided_on`은 과거 업무의 결정일이다. AINS에서 검토를 승인한 시각 `reviews.decision.decided_at`이나 기준선 발행 이벤트의 `events.created_at`과 다르다. 날짜 입력만으로 승인·발행되지 않는다. `created_at`을 과거 업무 날짜로 바꾸지 않는다.

## 5. 실제 DB 컬럼

아래는 문서 적재에 직접 관계있는 실제 컬럼이다. PK는 기본키, FK는 외래키다. 사용자 입력이 아닌 ID·시각·상태·해시는 서버가 채운다.

### 프로젝트와 업무 영역

| 테이블 | 컬럼 | DB 타입 | 용도 |
|---|---|---|---|
| `projects` | `id` | text, PK | 프로젝트 식별자 |
| | `name` | text | 프로젝트명 |
| | `domain_pack` | jsonb | 기본 도메인 분석 설정 |
| | `created_at` | timestamptz | 프로젝트 생성 시각 |
| `project_domains` | `id` | uuid, PK | 업무 영역 식별자 |
| | `project_id` | text, FK | 소속 프로젝트 |
| | `name` | text | 업무 영역명; 프로젝트 내 대소문자 무시 중복 금지 |
| | `description` | text | 포함 업무·기능 설명 |
| | `domain_pack` | jsonb | 해당 영역의 분석 설정·용어집 |
| | `is_default` | boolean | 기본 영역 여부 |
| | `created_at` | timestamptz | 영역 생성 시각 |

### `documents` — 문서·기록의 정체성

| 컬럼 | DB 타입 | 필수 여부 | 의미 |
|---|---|---|---|
| `id` | uuid, PK | 자동 필수 | 버전이 달라져도 유지되는 문서 ID |
| `project_id` | text, FK | 필수 | 프로젝트 |
| `domain_id` | uuid, 복합 FK | 필수 | 같은 프로젝트의 업무 영역 |
| `record_kind` | text | 필수 | 5개 기록 유형 중 하나 |
| `title` | text | 필수 | 문서 제목 |
| `baseline_revision_id` | uuid, 복합 FK | nullable | 사람이 발행한 현재 기준선. 최초 등록 직후에는 없음 |
| `created_at` | timestamptz | 자동 필수 | 문서 정체성 최초 등록 시각 |

업무 영역과 기록 유형은 생성 후 변경할 수 없다. 다른 영역·유형으로 관리해야 하는 자료는 새 기록으로 등록한다. 새 리비전 요청의 `title`은 기존 문서 제목을 수정하지 않는다.

### `revisions` — 버전별 원문과 추출 결과

| 컬럼 | DB 타입 | 필수 여부 | 의미 |
|---|---|---|---|
| `id` | uuid, PK | 자동 필수 | 리비전 ID; 실제 버전 식별 기준 |
| `project_id` | text | 필수 | 프로젝트; 문서와 복합 FK로 범위 검증 |
| `document_id` | uuid, 복합 FK | 필수 | 소속 문서 |
| `filename` | text | 자동/파일 정보 | 원본 파일명; 직접 입력은 `record.md` |
| `mime_type` | text | 자동 필수 | 원문 형식 |
| `sha256` | text | 자동 필수 | 원문 바이트의 SHA-256 해시 |
| `content` | bytea | 필수 | 실제 원문 바이트. 현재는 PostgreSQL에 보존 |
| `history` | jsonb | 자동 기본값 + 입력 | 위 9개 출처·날짜·채널 속성 |
| `status` | text | 자동 필수 | `queued`, `running`, `ready`, `failed`, `uncertain` |
| `document_json` | jsonb | 준비 전 nullable | 추출·정규화 결과. `ready`이면 반드시 존재 |
| `error_code` | text | nullable | 처리 실패·확인 필요 사유 |
| `created_by` | uuid, FK → users | 자동 필수 | AINS에 등록한 사용자; 원저자와 다를 수 있음 |
| `created_at` | timestamptz | 자동 필수 | 해당 버전의 AINS 등록 시각 |

`source_text`는 조회 API가 `content`를 디코딩해 제공하는 값이며 별도 DB 컬럼이 아니다. `version_number`나 `version_label` 컬럼은 현재 없다. 사람이 사용하는 `v1.2` 표기는 제목·본문·태그에 남기고, 실제 버전 연결은 `document_id`와 `revision_id`로 한다.

`document_json`에는 `schema_version`, 세 가지 식별자, `source`, `segments`, `extraction`, 선택적 `normalization`이 들어간다. 구간마다 `segment_id`, `requirement_key`(없으면 null), `text`, `locator`(페이지·슬라이드·시트·문단 등의 위치), `extraction_status`와 선택적 `normalized_text`를 저장한다. 추출기가 만드는 값이므로 팀원이 직접 작성할 필요는 없다. 현재 결과 스키마는 최대 200구간이다.

### 실행·검토·감사 이력

| 테이블 | 실제 컬럼 | 역할 |
|---|---|---|
| `jobs` | `id`, `project_id`, `kind`, `revision_id`, `review_id`, `status`, `stage`, `stage_data`, `error_code`, `attempt`, `lease_token`, `lease_expires_at`, `created_at`, `updated_at` | 추출 또는 변경 검토의 실행 상태, Nora 실행 식별자·재시도 이력 등 |
| `reviews` | `id`, `project_id`, `document_id`, `baseline_revision_id`, `current_revision_id`, `request`, `result`, `status`, `decision`, `created_by`, `created_at` | 기준선과 새 리비전의 비교 입력·AI 결과·검토 결정 |
| `answers` | `review_id`, `question_id`, `answer`, `evidence`, `actor_id`, `created_at` | 검토 질문별 답변과 근거 |
| `events` | `id`, `project_id`, `actor_id`, `kind`, `entity_id`, `detail`, `created_at` | 누가 언제 등록·답변·승인·반려·발행했는지 기록 |

JSONB 컬럼은 `stage_data`, `request`, `result`, `decision`, `detail`이다. 운영 시각은 `timestamptz`, 실행 임대 토큰과 사용자/검토/리비전 ID는 UUID다. `events.actor_id`는 시스템 처리일 때 null일 수 있다.

`reviews.decision`에는 승인/반려, 사유, 근거, 원문 확인 여부, 결정자 ID, 결정 시각, 입력·결과 해시와 답변 사본이 담긴다. 최초 기준선 발행은 비교 대상이 없으므로 별도의 `reviews` 행 없이 `baseline.initial_published` 이벤트로 기록한다. 이후 기준선 변경은 검토 승인과 `baseline.published` 이벤트로 추적한다.

## 6. 자료별 정리 원칙

| 상황 | 전달·등록 방식 |
|---|---|
| 같은 기획의 수정본 | 기존 `document_id` + 새 원문 + 이번 리비전의 전체 `history` |
| 다른 업무 영역의 새 기획 | 새 문서, 해당 `domain_id`, `specification` |
| 기획에 관한 회의·대화 | 같은 업무 영역에 별도 `conversation` 기록. 기획 문서 ID·User Story ID를 본문에 명시 |
| 대화에서 확정된 업무 결정 | 별도 `decision` 기록, 결정일·결정자·사유·원문 근거·적용 시점을 명시 |
| 이전 결정을 번복 | 같은 결정 기록의 새 리비전 또는 독립된 새 결정 기록으로 등록하고, 무엇을 대체하는지 본문에 명시 |
| 메타데이터 오기 정정 | 원문과 이력이 불변이므로 정정된 이력을 가진 새 리비전 등록. 정정 이유를 본문에 기록 |

수정본 등록 시 API는 이전 `history`를 자동 상속하지 않는다. 전달자가 유지할 정보와 바뀐 정보를 확인해 전체 이력 객체를 전달한다. 화면의 기존 내용 편집은 값을 미리 채울 수 있지만, 과거 결정일 등이 현재 수정본에도 맞는지는 별도로 확인한다.

최신 업로드가 자동으로 기준선이 되지는 않는다. `ready`는 추출·구조화 완료이며 원문 누락 여부나 실제 업무 적용까지 승인했다는 뜻이 아니다. 같은 파일 재업로드도 직접 등록 API에서는 새 리비전이 생성된다. `sha256`이나 `external_id`만으로 중복 제거되지 않으므로 응답이 끊겼을 때 등록 결과부터 확인한다.

현재 AI 구현 계획은 **`specification` 유형의 추출 완료된 현재 기준선**만 입력으로 받는다. 대화·결정 기록을 코드 구현에 반영하려면 관련 내용을 기획 문서의 새 리비전에 반영하고 기준선 검토·발행을 거친다. 대화 기록 자체를 기획 문서의 수정본으로 덮어 등록하지 않는다.

## 7. 팀 전달용 본문 템플릿

아래는 **본문 작성 형식**이다. 아직 별도 컬럼이 없는 결정자·버전명·변경 사유·적용일·관련 문서 관계를 `history`에 임의 키로 추가하지 않는다.

```text
제목: Semi-auto 실험 선택 정책
프로젝트 / 업무 영역: 검사 운영 / 실험그룹 관리
기록 유형: 기획·요구사항
신규 또는 수정본: 수정본 — 기존 문서 ID: …
업무 버전명: v1.2
관련 요구사항: US-11363, US-11325

1. 목적과 적용 범위
2. 확정한 내용 / 아직 논의 중인 내용
3. 이전 내용 → 변경 내용 / 변경 사유
4. 검증 가능한 수용 기준
5. 업무 결정자·담당자 / 결정 근거 / 적용 시점
6. 관련 문서·대화 링크와 ID
7. 원문 또는 원문 첨부
```

대화는 가능한 한 `[발송 시각·시간대] 작성자: 원문`을 유지하고, 사람이 작성한 요약과 원문을 구분한다. ‘검토해 보자’ 같은 제안을 확정 결정으로 바꾸지 않는다. 원본에서 확인할 수 없는 날짜·작성자는 ‘미확인’이라고 본문에 남기고 대응하는 선택 메타데이터는 비워 둔다.

## 8. 직접 입력 API 예시

`POST /api/projects/{project_id}/records`. 아래 내용·날짜·참여자는 설명용 예시다. `domain_id`도 예시 UUID이므로 실제 프로젝트의 업무 영역 ID로 교체한다. 프로젝트 구성원의 세션·CSRF·Origin 검사가 적용된다.

```json
{
  "title": "Semi-auto 실험 선택 정책",
  "domain_id": "11111111-1111-4111-8111-111111111111",
  "record_kind": "specification",
  "text": "# US-11363\n\n## 확정 내용\nSemi-auto 모드에서 실험을 2개 이상 선택할 수 있다.\n\n## 수용 기준\n2개 이상의 실험을 선택하고 실험그룹 생성을 완료할 수 있어야 한다.\n\n## 변경 이력\nv1.2: 다중 선택 허용을 명시했다.\n결정자: 기획 담당자. 근거: 9월 25일 정책 검토. 적용 시점: 다음 배포 검토에서 확정 예정.",
  "history": {
    "source_type": "azure_devops",
    "occurred_on": "2026-09-24",
    "decided_on": "2026-09-25",
    "source_created_at": "2026-09-24T14:30:00+09:00",
    "channel": "검사운영 / Semi-auto 기획",
    "url": null,
    "external_id": "ADO-US-11363",
    "participants": ["기획 담당자", "개발 담당자"],
    "tags": ["semi-auto", "다중 선택", "v1.2"]
  }
}
```

수정본은 위 객체에 `"document_id": "기존 문서의 실제 UUID"`를 추가한다. 업무 영역·기록 유형은 기존 문서와 같아야 한다. 직접 입력 API는 수정본에도 제목을 요구하지만 기존 문서 제목을 갱신하지는 않는다.

파일 등록은 `POST /api/projects/{project_id}/documents`에 `multipart/form-data`로 `file`과 같은 메타데이터를 보낸다. 이때 `history`는 JSON 문자열, 본문은 `text` 대신 파일이다.

등록 성공은 HTTP 202와 `{document_id, revision_id, job_id}`를 반환한다. 이는 접수 완료이며 추출 완료를 뜻하지 않는다. `GET /api/projects/{project_id}/revisions/{revision_id}`로 상태를 확인한다. `failed`는 실패, `uncertain`은 실행 완료 여부 확인이 필요한 상태다.

## 9. 대화 수집 경로에서 추가로 필요한 데이터

직접 붙여넣기는 위 문서 API를 쓰고, 공통 수집·검토함 경로는 메시지 단위 원문을 별도로 보존한다. 현재 이 스키마가 있다는 사실과 실제 카카오톡·Slack 자동 watch가 연결되어 있다는 사실은 다르다.

| 단계 / 테이블 | 준비하거나 보존하는 값 |
|---|---|
| 채널 지정 / `channel_sources` | `provider`, `name`, `external_workspace_id`(선택), `external_channel_id`, `default_domain_id`(선택), 프로젝트 |
| 메시지 수신 / `channel_events` | 외부 `event_id`, `message_id`, `kind`(created/updated/deleted), `author`, `text`, `sent_at`, `changed_at`, `url` |
| 묶음 수신 | `batch_id`, `conversation_key`, `messages` 배열 |
| 수집 시스템 자동값 | 내부 이벤트 ID·순번, `received_at`, 원본 시각 문자열과 정규화 시각, payload 해시 |
| 분석·검토 / `channel_inbox` | 고정된 원문 묶음, AI 분석, 실행 trace, 원문 변경 여부, 사람의 검토·등록 결과 ID |
| 재전송 확인 / `channel_batches` | 동일 배치의 재전송을 식별하는 정보 |

메시지 작성자·본문·식별자는 필수이며, 알 수 없는 발송·수정 시각과 링크는 null을 허용한다. 임의로 수집 시각을 원본 발송 시각으로 대신하지 않는다. 한 배치는 최대 50개 메시지, 전체 본문 20,000자이며 메시지별 최신 이벤트 1개만 포함한다. 수정·삭제도 새 이벤트로 보존하고, 삭제 이벤트의 본문은 빈 문자열이다. 외부 ID가 없는 채널은 수집 어댑터에서 안정적인 식별 방법을 먼저 정해야 한다.

사람이 검토 후 등록하면 `documents/revisions/jobs`가 생성된다. 등록 기록의 `history`에는 채널·작성자 목록·첫 확인 가능한 발송일과 `channel-inbox:{ID}`가 들어가고, 모든 개별 메시지 ID·시각·원문은 수집 이벤트와 근거 본문에 보존된다. 여러 날의 대화 전체를 `occurred_on` 한 날짜만 보고 해석하지 않는다. 검토자는 결정일을 확인하고 등록 사유를 남기며, 이것은 요구사항 승인·기준선 발행과 별개다.

## 10. 현재 없는 구조와 확장 후보

원저자 ID, 업무 결정자 ID, 업무 버전명, 효력 시작일, 변경 사유, 문서 간 관계를 위한 전용 필드·관계 테이블은 아직 없다. 당장은 본문 템플릿으로 보존한다. 이 정보를 필터링하거나 관계를 자동 추적해야 할 때는 `authored_by`, `decision_makers`, `version_label`, `effective_on`, `change_reason`, 문서·리비전 간 관계 테이블 등을 별도 설계하는 것이 적절하다. **현재 API에 바로 넣을 수 있는 키라는 뜻은 아니다.**

## 구현 근거

- [기본 DB 스키마](../server/migrations/001_initial.sql)
- [업무 영역·기록·이력 확장](../server/migrations/005_domains_records.sql)
- [출처 허용값 확장](../server/migrations/008_channel_source_types.sql)
- [이력 입력 검증](../server/record-contract.js)
- [등록·기준선·검토 처리](../server/ledger.js)
- [추출 결과 JSON 스키마](../../nora/schemas/document.schema.json)
- [소통 채널 DB](../server/migrations/007_channel_inbox.sql) / [채널 처리](../server/channel-ledger.js)
- [문서에서 AI 구현 시작까지](IMPLEMENTATION_START.md)
