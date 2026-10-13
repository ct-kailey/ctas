# 회의 녹음 → 검토 가능한 프로젝트 Context

회의 전사 메뉴에서 음성을 업로드하면 프로젝트의 OpenAI 연결을 이용해 실제 전사 API를 호출합니다. 녹음 원본, 변경하지 않은 전사문, 사람이 수정한 회의 내용, 실행 회차와 검토 이력을 각각 보존합니다. 완료된 전사문이 자동으로 프로젝트의 확정 기준이 되지는 않습니다.

## 사용 흐름

1. 프로젝트 설정의 AI 연결에 OpenAI 키를 등록합니다. Nora에 저장한 키는 자동 복사하지 않습니다.
2. 회의 전사에서 제목, 실제 회의 일시, 업무 영역, 회의 채널, 언어와 녹음을 등록합니다.
3. 비동기 전사 완료 후 원본 녹음을 재생하고, 시각별 구간과 전체 전사문을 대조합니다.
4. 검토할 내용을 편집하고 근거 구간을 선택합니다. 수정 사유를 적어 검토 후보로 등록합니다.
5. Main Context 검토함에서 질문·충돌을 보완하고 최종 확정합니다. 후속 수정은 기존 후보 수정 또는 확정 Context 대체 기록으로 남깁니다.

실무자는 녹음을 등록·취소·재시도할 수 있습니다. 관리자·검토자는 전사문을 검토 후보로 등록할 수 있습니다. 최종 확정은 기존 Context 검토 권한을 그대로 따릅니다. 프로젝트 열람자는 해당 프로젝트의 원본·전사·검토 이력만 조회합니다.

## 범위와 모델

- 최대 20 MiB, WAV / MP3 / M4A / MP4 / WebM / OGG / FLAC. 확장자, MIME, 파일 서명을 모두 확인합니다. 실제 코덱·녹음 품질 판독은 제공사가 수행하며 인식 불가능한 파일은 실패로 표시합니다.
- 프로젝트당 저장 음성 합계 200 MiB, 활성 대기 5건, 전체 서비스 전사 동시 실행 2건, 녹음당 최대 10회 실행입니다. 긴 회의는 파일을 분할하거나 압축한 뒤 각각 등록합니다.
- 기본 `whisper-1`: `verbose_json`과 segment timestamps를 요청합니다. 화자 식별은 제공하지 않는다고 명시합니다.
- `gpt-4o-transcribe-diarize`: `diarized_json`, `chunking_strategy=auto`를 사용합니다. 화자 A/B 표시는 익명 구분이며 실명 확인이 아닙니다.
- `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, 해당 지원 스냅샷 및 `gpt-transcribe`는 JSON 전사를 지원합니다. 반환되지 않은 화자·구간 시각을 만들어내지 않습니다.
- 전사문과 녹음의 명령·요청은 원문 자료입니다. 도구·코드·외부 액션으로 실행하지 않습니다.

모델별 형식과 timestamp 지원은 [OpenAI 음성 전사 가이드](https://developers.openai.com/api/docs/guides/speech-to-text) 및 [Transcriptions API](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)를 기준으로 구현했습니다. API 자체는 25 MB까지 허용하지만 AINS는 기존 업로드·저장 정책과 맞춰 20 MiB로 제한합니다.

## 저장·검토 계약

`017_context_transcription.sql`:

| 테이블 | 보존하는 정보 |
|---|---|
| `context_transcriptions` | 원본 음성 bytea, SHA-256, 제목, 회의 일시·채널·업무 영역, 원본 전사 JSON 및 해시, 처리 상태 |
| `context_transcription_attempts` | 실행 회차, 모델, 제공사 요청 ID, 실행/완료 시각, 실패·불확실 상태 |
| `context_transcription_reviews` | 원본 전사 해시, 수정한 회의 내용, 검토 사유, 선택한 구간 ID, 담당자, Context 후보 연결 |

음성 입력과 완료된 원본 전사문은 불변입니다. 검토 저장과 일반 Context 후보 생성은 하나의 트랜잭션입니다. 요청 ID 재전송은 같은 결과를 반환하고, 다른 내용으로 같은 ID를 사용하면 충돌을 반환합니다. 원본 해시와 Main Context 버전을 다시 확인한 뒤 저장합니다.

Context source type `transcription`은 완료된 원본 전사문을 근거로 제공합니다. 미확정 source 상태를 유지하므로 사람이 검토한 내용을 최종 확정하기 전까지 승인된 결정으로 검색하지 않습니다. 내부 검토는 고객 합의로 자동 분류되지 않습니다. 수정·검토된 회의 내용은 별도의 Context 후보와 확정 기록으로 관리합니다.

구간 ID 전체는 검토 테이블에 보존합니다. 녹음·원문 hash와 근거 구간 요약을 후보의 판단 근거에 함께 저장합니다. 원본 음성은 프로젝트 인증을 거친 same-origin URL에서 재생·다운로드하며 byte range를 지원합니다. 목록/JSON에는 음성 bytea, 키, 인증 헤더를 반환하지 않습니다.

## 실행과 오류

`queued → running → ready → reviewed`가 정상 흐름입니다. 실패는 `failed`, 응답 유실·timeout·worker 유실·5xx는 `uncertain`, 사용자 취소는 `cancelled`입니다. 실행 상태는 DB에 저장해 배포 후에도 유지합니다.

- API timeout 기본 5분, heartbeat 10초. 2분 넘게 heartbeat가 없으면 결과 불확실로 전환합니다.
- worker claim은 DB 잠금과 `SKIP LOCKED`로 중복 실행을 방지합니다. 외부 API를 DB 트랜잭션 안에서 호출하지 않습니다.
- 요청이 제공사에서 처리되었는지 모르는 경우 자동 재시도하지 않습니다. 사용자가 중복 과금 가능성을 확인한 뒤 명시적으로 재실행합니다. 알려진 4xx 거부는 실패로 기록합니다.
- 이미 전송한 음성의 취소가 제공사의 연산·과금 취소를 보장하지는 않습니다. 취소 후 도착한 응답은 완료 상태를 덮어쓰지 않습니다.
- worker 재시작은 미완료 작업을 자동 재과금하지 않습니다. 멈춘 작업은 lease 만료 후 불확실 상태로 남습니다.
- 검토 중 Main Context가 바뀌면 후보 저장을 차단하고 최신 버전으로 재검토하게 합니다. 전사 완료 상태는 보존됩니다.

## 서버 통합

`mountTranscriptionRoutes(project, {pool, write, review, transcription: {resolveConfig}})`를 기존 프로젝트 router에 마운트합니다. 기존 세션, Origin, CSRF, 프로젝트 membership 검사를 통과한 뒤 multipart를 읽습니다.

`startTranscriptionWorker({pool, resolveConfig, pollMs})`는 자동 실행되며 `{tick, stop}`을 반환합니다. 종료 시 `await worker.stop()`을 호출합니다. `resolveConfig(projectId)`는 `{apiKey, transcriptionModel}`을 반환합니다. 환경 변수만 사용할 경우 `OPENAI_API_KEY`, 선택적 `OPENAI_TRANSCRIPTION_MODEL`을 지원합니다. 고정 OpenAI endpoint를 사용하며 임의 URL은 입력받지 않습니다.

모든 경로는 `/api/projects/:p/transcriptions` 기준입니다.

| 요청 | 동작 |
|---|---|
| `GET /` | 최신 100건 및 공개 모델·연결 상태 |
| `POST /` | multipart `audio`, `request_id`, `title`, `occurred_at`, 선택 `domain_id`, `channel`, `language` |
| `GET /:id` | 원본 전사, 검토, 실행 이력 |
| `GET /:id/audio` | 원본 재생. `?download=1`은 다운로드 |
| `POST /:id/retry` | `expected_attempt`, `acknowledge_duplicate_charge` |
| `POST /:id/cancel` | `expected_attempt` |
| `POST /:id/review` | `request_id`, `expected_original_sha256`, `expected_context_version`, `edited_text`, `reason`, `segment_ids` |

현재 원본 음성의 삭제·보존 기간 설정, 대용량 object storage 이관, 실시간 회의 녹음 수집은 포함하지 않습니다. 프로젝트 음성 한도에 도달하면 관리자 운영 정책에 따른 확장이 필요합니다.

## 검증

실제 임시 PostgreSQL schema에서 권한 격리, 원본 불변성, 수정 전사문·구간 근거 보존, 후보 최종 검토, 버전 충돌 rollback, worker 동시 claim, 미확정 결과 무재시도, 취소 후 늦은 응답 차단을 검증합니다. HTTP 테스트는 기존 세션·CSRF·Origin과 프로젝트 권한, multipart 파일 형식, range 재생을 검증합니다. 제공사 호출 테스트는 문서화된 응답 fixture를 사용하며 실제 키 없이 결과를 조작하여 운영에 쓰지 않습니다.
