# 업무 영역·문서·기록 관리

2026-09-27 구현. 기존 파일 추출·Nora 정규화·변경 검토를 유지하면서 직접 작성 기록과 업무 영역을 추가했다.

## 사용 방법

1. 프로젝트의 **문서·기록 보관함 → 업무 영역 추가**에서 회원, 정산, 검사 운영 등의 영역을 만든다. 관리자와 검토자가 추가할 수 있다.
2. **문서·기록 등록**에서 파일 첨부 또는 직접 작성·붙여넣기를 선택한다. 직접 작성은 Markdown/일반 텍스트를 지원한다. Slack, Azure DevOps, Teams, 이메일, 회의는 출처로 선택하고 내용을 붙여 넣는다. 외부 서비스와 자동 동기화하는 기능은 아니다.
3. 업무 영역, 기록 유형, 등록 위치를 선택한다. 같은 논리적 문서의 수정은 기존 문서의 새 리비전, 다른 주제나 대화는 새 문서·기록으로 등록한다. **등록 위치 추천**으로 Nora의 제안을 확인할 수 있고, **추천 적용**을 눌러 선택값에 반영한 뒤 **등록하고 분석 시작**으로 최종 등록한다. 업무 영역과 기록 유형이 다른 문서를 기존 문서의 리비전으로 등록할 수 없다.
4. 기록의 발생·대화일, 업무 결정일, 채널·장소, 출처 링크와 원본 정보를 입력한다. 날짜가 불명확하면 비워 둔다. 결정일을 입력하는 행위는 변경 검토의 승인이 아니다.
5. 보관함에서 업무 영역·유형·제목·채널·참여자·태그로 찾고, 날짜별 보기에서 발생 시점을 확인한다. 텍스트 상세의 편집 기능은 새 리비전을 만든다. 기존 원문과 이력 속성은 덮어쓰지 않는다.

## 모델과 의미

`프로젝트 → 업무 영역(project_domains) → 논리적 문서/기록(documents) → 원본 버전(revisions)`.

문서 유형: `specification` 기획·요구사항, `conversation` 대화, `decision` 업무 결정, `work_item` 작업 기록, `note` 참고 메모. 출처 유형과 기록 유형은 독립이다. 예를 들어 Slack에서 합의한 내용을 업무 결정 유형으로 등록할 수 있다.

기존 프로젝트의 도메인 팩을 복사한 기본 업무 영역을 마이그레이션으로 만들고 기존 문서를 배치한다. 원문 바이트, 해시, 시스템 생성일, 검토 및 승인 스냅샷은 그대로 유지한다. 신규 검토 요청은 문서가 속한 업무 영역의 도메인 팩을 저장한다. 도메인 팩 버전은 문서 버전 번호와 별개다.

각 리비전의 `history`:

| 필드 | 의미 | 입력 규칙 |
| --- | --- | --- |
| `source_type` | 기록 출처 | file/editor/slack/azure_devops/teams/email/meeting/other |
| `occurred_on` | 업무 발생·대화 날짜 | YYYY-MM-DD, 실제 달력 날짜, 불명확하면 null |
| `decided_on` | 업무상 결정한 날짜 | YYYY-MM-DD, 승인 상태와 독립 |
| `source_created_at` | 외부 원본의 생성 시각 | 시간대 포함 ISO 8601, 원래 오프셋 보존 |
| `channel` | 대화 채널·회의 장소 | 최대 200자 |
| `url` | 원문·스레드·작업 항목 링크 | HTTP(S), URL 내 계정정보 불허 |
| `external_id` | 외부 기록 식별자 | 최대 300자 |
| `participants` | 참여자 이름·표기 | 최대 50개, 각 200자 |
| `tags` | 검색용 태그 | 최대 30개, 각 100자 |

`revisions.created_at`은 서버가 기록한 등록 시각이다. 날짜만 알려진 업무 기록에 임의의 UTC 자정을 만들어 저장하지 않는다. 사용자가 적은 날짜·참여자는 출처에 관한 진술이며 시스템 인증이나 승인 증거로 자동 승격하지 않는다. 원본 파일은 최대20MiB, 에디터 원문은 UTF-8 기준200,000바이트다.

## API

기존 인증·프로젝트 권한·CSRF/Origin 검증을 그대로 적용한다.

- `GET /api/projects/:p/domains` → `{domains}`
- `POST /api/projects/:p/domains` `{name,description?,domain_pack?}` → `{domain}`; owner/reviewer.
- `GET /api/projects/:p/overview` → 기존 응답에 `domains` 추가.
- `POST /api/projects/:p/documents`: 기존 multipart에 `domain_id`, `record_kind`, `history` JSON 문자열 추가. 기존 API의 생략 입력은 기본 업무 영역/file 출처로 호환된다.
- `POST /api/projects/:p/records`: `{title,text,document_id?,domain_id?,record_kind?,history?}` → `{document_id,revision_id,job_id}`; member 이상. 정확한 UTF-8 본문을 `record.md` 원본으로 저장하고 기존 intake 작업을 생성한다.
- `GET /api/projects/:p/revisions/:r`: `history`, `domain_id`, `domain_name`, `record_kind`, `title`, `source_text` 추가. `source_text`는 유효한 UTF-8 TXT/MD 200,000바이트 이하일 때만 반환한다. 원본 다운로드는 기존 경로로 제공한다.
- `POST /api/projects/:p/registration-suggestions`: `{title,text,filename?,record_kind,domain_id?}` → 검증된 추천과 trace. 확정 등록은 별도 등록 API로만 수행한다.

## 분류 추천의 구현 상태

2026-09-27 Nora AINS 워크스페이스(`t_ef2500ebb1b14058847dc513c5c197bc`)에 `ains-record-registration-v1` v1을 발행했다. OpenAI `gpt-5.4-mini`와 `reasoning_effort: low`를 사용하는 단일 에이전트다. 실제 발행 버전과 노드 ID는 [manifest](../../nora/registration/manifest.json)에 기록한다. 이전 인증 만료·도구 미노출로 인한 발행 지연은 재인증 후 해소했다.

실제 발행 API로 동일 문서 v2, 다른 업무 영역의 별도 문서, 새 Slack 대화, 선택 영역을 바꾸려는 악성 지시문, 파일명만 제공한 입력의 합성 사례 **5개 모두 통과**했다. 해당 실행 추적에서 도구 호출, 메모리 읽기·쓰기는 관찰되지 않았다. 이는 검사한 실행에 대한 결과이며 도구 접근을 시스템 차원에서 강제 차단했다는 증거는 아니다. 검증 입력과 결과는 [acceptance-cases.json](../../nora/registration/acceptance-cases.json), [acceptance-results.json](../../nora/registration/acceptance-results.json)에 보관한다.

Railway에 `NORA_REGISTRATION_TOKEN`과 발행 manifest를 반영해 배포했다(`c280fbaf-ae73-44a3-a6f9-e69bc45377c5`). 운영 API 검증 3건과 실제 에디터의 추천·추천 적용 동작을 확인했다. 추천 전후 문서·리비전·기준선은 변경되지 않았고 감사 이벤트가 저장되었다. [운영 API 검증](../registration-production-smoke.json), [화면 검증](../registration-production-ui-verification.json)을 참조한다. 토큰이 없거나 미발행 manifest를 사용하면 API는 `REGISTRATION_UNAVAILABLE`(503)을 반환하며 수동 등록은 계속 가능하다. 문서 파이프라인과 변경 검토 토큰은 분류 추천 토큰과 별개다.

추천은 문서를 생성하거나 기준선을 바꾸지 않는다. 선택된 업무 영역을 지정하면 그 영역만 추천하며, 전체 영역 비교는 사용자가 선택한다. 명시적 기록 유형은 AI가 변경할 수 없다. 파일 모드에서는 등록 전 본문을 읽지 않으므로 제목·파일명만 사용한다. 본문이 없으면 `new_document`와 신뢰도 0.5 이하만 허용하며, 기존 문서의 리비전 여부는 사용자가 직접 확인한다. 업무 영역을 판단하지 못한 `domain_id:null` 결과도 직접 확인해 선택한다. UI에서 추천을 적용하는 별도 동작이 필요하며 입력이 바뀌면 이전 추천은 무효화된다.

후보는 현재 프로젝트의 업무 영역50개와 최근 문서50개로 제한하고 잘린 비교 범위를 안내한다. 본문은 최대20,000자까지 추천에 사용한다. 원본 등록 제한과 추천 입력 제한은 별개다. 서버가 후보를 조회하므로 브라우저가 타 프로젝트 후보를 주입할 수 없다.

실행 전 `registration_requests`에 요청 해시를 저장한다. 원문 초안은 이 표에 보관하지 않는다. 성공/실패/응답 불명 상태와 trace를 남기며 자동 재실행은 하지 않는다. 같은 사용자 동시 1건, 프로세스 동시 4건, 프로젝트 시간당 60건 한도를 적용한다. 서버의 Nora 응답 대기는 45초다. 전송 오류, 응답 본문 수신 중 취소·타임아웃 또는 HTTP 5xx는 완료 여부 불명으로 기록한다. 완전히 수신한 잘못된 JSON과 범위·스키마 검증 오류는 실패로 기록한다.

## 다음 연동 경계

Slack/DevOps 원격 수집·동기화, 대화와 요구사항 사이의 근거 관계 그래프, 승인된 요구사항에서 실제 대상 저장소의 코드·테스트·PR 생성은 별도 연결 단계다. 코드 실행 대상 저장소로 `https://github.com/ct-kailey/nora-flow.git`가 제공되었다. 저장소 접근과 기본 브랜치를 확인한 후 구현 작업 연동을 연결한다. 기록을 등록하거나 업무 결정일을 적는 것만으로 코드 변경·메시지 발송·배포가 실행되지는 않는다.
