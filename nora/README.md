# AINS 문서 처리와 요구사항 변경 검토

2026-09-26 기준 **문서 파이프라인과 OpenAI 변경 검토 플로우를 모두 발행했고, 인증된 외부 API 실행을 검증했다.** 변경 검토는 `gpt-5.4-mini`를 사용한다.

| 구성 | AINS 객체 | 상태 |
|---|---|---|
| 문서 파이프라인 | `AINS SI/SM Document Intake v1` / `pipe_69176e8b946449329ab1a98b927b66cf` | v1 발행, bearer 인증 API 성공 |
| 변경 검토 플로우 | `AINS SI/SM Requirement Change Review OpenAI v1` / `ains-sism-change-review-openai-v1` | 에이전트 3개·도구 2개, v2 발행, 인증 API 성공 |
| 파일 추출 어댑터 | `adapter/extract_document.py` | PDF·DOCX·PPTX·XLSX·TXT·MD 지원, 로컬 검증 완료 |
| 호출·검증 코드 | `client/` | 두 API 지원, strict schema·원문·프로젝트·단계 실패 검사 |

Nora workspace ID: `t_ef2500ebb1b14058847dc513c5c197bc`. 기존 `Flow 1`은 변경하지 않았다. 실제 고객 문서를 Nora에 업로드하지 않았고 원격 시험에는 합성 입력을 사용했다.

기존 `ains-sism-change-review-v1`은 저장 시 409 충돌이 반복돼 미발행 초안으로 보관했다. 현재 사용할 대상은 이름에 **OpenAI**가 있는 플로우다. 기존 초안에 OpenAI 모델을 실행별로 지정한 시험도 성공했으며, 새 버전은 OpenAI 모델을 저장한 상태로 발행했다.

v2는 원래 요청을 Nora 고정 파라미터로 연결하고, AI가 의미 판단과 변경 ID만 작성하도록 바꿨다. 결정적인 조립기가 원래 요청에서 근거를 붙여 줄바꿈·탭·따옴표·역슬래시를 보존한다. v1 수용 시험은 과거 버전 기록이며 v2 회귀 시험은 `flow/regressions-v2/`에 별도로 보관한다.

## 설계와 구현 파일

- [상세 설계](DESIGN.md): 노드별 입출력, 스키마, 도구 계약, 오류 처리, 도메인 확장, Railway 연결 경계.
- [파이프라인 manifest](pipeline/manifest.json): 발행 버전·노드 ID·검증된 API URL.
- [플로우 manifest](flow/manifest.json): 에이전트/도구 ID·모델·발행 버전·API 계약.
- [수용 검증 결과](flow/acceptance-summary.json), [과거 Gemini 연동 오류 기록](flow/PROVIDER_BLOCKER.md).
- [JSON Schema](schemas/), [프롬프트·검증 코드](flow/), [합성 수용 사례 10종](tests/acceptance-cases.json).
- [추출 어댑터 사용법](adapter/README.md), [파이프라인 계약](pipeline/README.md).

## 설치와 로컬 검증

Node.js 20 이상, Python 3.12 환경에서 실행한다. Python 패키지는 전용 가상환경에 설치한다.

```sh
npm ci --prefix nora
python3 -m venv nora/adapter/.venv
nora/adapter/.venv/bin/pip install -r nora/adapter/requirements.txt
npm test --prefix nora
node nora/pipeline/test-pipeline.cjs
nora/adapter/.venv/bin/python -m unittest discover -s nora/adapter -p 'test_*.py'
```

프로젝트 루트에서 위 가상환경의 `nora/adapter/.venv/bin/python`으로 어댑터 테스트를 실행한다.

## 발행된 문서 파이프라인 실행

추출된 Document 한 개를 보낸다. 바이너리 파일은 먼저 추출 어댑터를 거친다.

```sh
node nora/client/cli.js pipeline nora/pipeline/synthetic-document.json synthetic-sism
```

CLI는 `NORA_PIPELINE_TOKEN`을 우선 사용하고, 없으면 이 작업에서 생성한 `nora/.secrets/pipeline-secret.json`의 토큰을 읽는다. 해당 파일은 0600, 상위 디렉터리는 0700으로 보관하며 Git에서 제외한다. 서버 배포 시 토큰은 비밀 환경변수로 주입한다. 브라우저에 제공하지 않는다.

HTTP 계약은 `POST` + `{input: Document, idempotency_key: string}`이며 `Accept: application/json`으로 완료된 `{runId,status,report}`를 받는다. API 주소는 manifest에서 확인한다. CLI는 결과를 받아 다음을 모두 검사한다.

1. 단일 문서·인증된 프로젝트 문맥·입출력 JSON Schema.
2. 두 필수 단계의 완료, 단계별 `artifacts.failed === 0`, 성공 레코드 1개.
3. 원문·위치·출처 해시·개정·프로젝트 보존, 정확한 공백 정규화.
4. 불완전 추출이 `ready`로 승격되지 않는지 검사.

마지막 CLI 인수는 신뢰할 수 있는 호출자의 프로젝트 ID다. CLI 자체는 사용자 로그인이나 권한 DB가 아니므로 운영 API는 인증된 사용자에게 해당 프로젝트 접근 권한이 있는지 먼저 확인해야 한다.

네트워크 timeout 이후 자동 재호출하지 않는다. 실행 완료 여부가 불명확할 수 있으므로 기존 run을 대조한 뒤 재시도한다. 동일 요청·동일 발행 버전으로 생성한 idempotency key는 실제 재호출 시험에서 같은 run ID를 반환했다.

## 변경 검토 실행

```sh
node nora/client/cli.js prepare nora/examples/change-request.json project-sism-synthetic
node nora/client/cli.js review nora/examples/change-request.json project-sism-synthetic
node nora/client/cli.js review-documents nora/examples/change-request.json project-sism-synthetic
```

`prepare`는 모델을 호출하지 않고 후보를 확인한다. `review`는 발행된 AI 검토 API를 호출한다. `review-documents`는 이전·현재 문서 각각을 문서 파이프라인으로 검증·정규화한 뒤 AI 검토를 실행하며 두 pipeline run ID와 flow trace ID를 반환한다. 파일 추출은 그 전에 어댑터로 수행한다.

AI 검토 토큰은 `NORA_FLOW_TOKEN` 또는 0600 권한의 `nora/.secrets/flow-secret.json`에서 읽는다. 문서 파이프라인 토큰과 서로 다르다. CLI와 서버 호출자만 토큰을 가지며 브라우저에 제공하지 않는다.

| 호출 | 문서 파이프라인 | 변경 검토 플로우 |
|---|---|---|
| 요청 형식 | JSON | multipart `FormData` |
| 필드 | `input`, `idempotency_key` | `input` JSON 문자열, `variables` JSON 문자열 |
| Authorization | `Bearer <pipeline token>` | `<flow token>` 원문, Bearer 접두사 없음 |
| 응답 | `runId,status,report` | `traceId,usage,output,outputs,status,rawStatus` |

플로우의 `variables`는 `{"review_request": request}`다. FormData의 Content-Type/boundary는 HTTP 라이브러리가 설정하게 한다. 성공 응답은 `status:'ok'`, `rawStatus:'completed'`이며 세 에이전트의 출력 순서와 마지막 근거 검증 결과까지 확인한다. `output`은 검토 결과 JSON 문자열이다. HTTP 200만으로 채택하지 않고 전체 스키마·후보·원문 근거를 원래 입력에 대조한다.

`partial`, `needs_review` 같은 실행 엔진 상태는 성공으로 수용하지 않는다. 업무 결과의 `review.status='needs_review'`와 실행 엔진 상태는 서로 다르다. 플로우의 외부 요청 중복 방지는 이번 구현에서 보장하지 않으므로 timeout 후 자동 재호출하지 않는다.

MCP 연동은 `runChangeReview`에 `run_flow` JSON 본문을 반환하는 함수를 전달한다. 기본은 발행본 실행이며 초안 시험만 `test:true`를 명시한다. `validateFlowResponse`는 과거 실행 검증 시 `expectedFlowSlug` 옵션을 받는다.

## 검증 증거와 남은 범위

최신 로컬 테스트는 플랫폼을 포함해 **242개 통과**(Node 208, 파이프라인 스크립트 13, Python 21)했다. 아래 7개 원격 수용 사례는 발행 v1의 기록이고, 현재 발행 v2는 [별도 회귀 4건](flow/regressions-v2/summary.json)과 [Railway 전체 흐름](../platform/production-smoke.json)으로 검증했다. 원격 실행 결과는 [전체 검증 상태](verification.json)에 구분해 기록한다. [합성 수용 사례](flow/acceptance-summary.json)는 정상 입력 **7건의 실제 AI 실행**, 잘못된 입력 **3건의 로컬 차단**을 모두 통과했다. 7개 실행 모두 에이전트 3개와 필수 코드 도구 2개의 완료, 원본 요청 일치, 허용 목록 밖 도구 호출이 기록되지 않은 것을 확인했다.

- 문서 API: HTTP 200, `647956d2-85d4-43a5-99a3-b9b29584e58b` — [실제 응답](pipeline/http-smoke-response.json).
- 클라이언트: `56209b34-0ef5-469e-b996-a7c2dbf62b28` — [실행 결과](pipeline/client-smoke.json), 동일 키 재호출도 같은 run.
- 인증: 토큰 없는 호출은 HTTP 401 — [증거](pipeline/auth-smoke.json).
- 혼합 batch가 전체 성공으로 표시되는 Nora 동작과 입력 오류별 시험 — [증거](pipeline/evidence.json). 클라이언트가 부분 실패를 거절한다.
- 추출 어댑터: 21개 테스트, 실제 첨부 PDF 9페이지·8,344자 로컬 추출 — [증거](adapter/verification.json).
- 통합 호출: 두 문서 파이프라인 → 발행된 검토 플로우 성공 — [실행 결과](flow/end-to-end-smoke.json).
- 변경 검토 API: HTTP 200, `trc_fb8548d6ce254d24830501e95a673f65` — [응답](flow/http-smoke-response.json), [실행 이력](flow/http-smoke-trace.json). 토큰 없는 호출은 [HTTP 401](flow/auth-smoke.json).

수용 사례는 수치·경계값·추가·삭제·표현 및 순서 변경·정책 미정·비신뢰 지시를 다룬다. 이는 실무 도메인 전체의 정확도나 포괄적인 프롬프트 주입 방어를 입증하는 시험은 아니다. 사용 모델의 기능 안내는 [OpenAI 공식 문서](https://developers.openai.com/api/docs/models/gpt-5.4-mini)를 참고한다.

검토 UI, 담당자의 답변·결정 근거와 승인/기준선 발행, 운영 DB, 비동기 worker, Railway 배포는 [상위 플랫폼](../README.md)에 구현했다. OCR, 원자적 요구사항 추출, 고객 직접 승인 채널, 객체 저장소 이관은 후속 범위다. 문서의 세그먼트 비교를 모든 요구사항의 완전한 식별로 해석하지 않는다. AI 생성 결과는 승인으로 전환되지 않는다.

## 기획 근거 기반 구현 계획

`ains-implementation-plan-v1`을 AINS에 v2(`gv_109b9acb515b42eb861ee6a78cc89f19`)로 발행했다. 단일 OpenAI `gpt-5.4-mini` 에이전트, `reasoning_effort: low`, 재호출 없는 45초 제한을 사용한다. 실제 합성 검증은 7/7 통과했다. 구체적인 함수 변경 계획에는 불필요한 차단 질문이 없고, 빈 저장소·불충분한 업무 요구사항·미검증 브랜치는 확인이 필요하도록 남긴다. 실행 추적 7건에서 도구 호출과 메모리 읽기·쓰기는 0회였으며 강제 도구 격리를 입증한 것은 아니다.

- [발행 manifest](implementation-plan/manifest.json), [입력 스키마](implementation-plan/request.schema.json), [결과 스키마](implementation-plan/result.schema.json), [프롬프트](implementation-plan/prompt.md)
- [엄격 검증 클라이언트](client/implementation-client.js), [실제 합성 검증 결과](implementation-plan/acceptance-results.json), [추적 검사](implementation-plan/trace-inspection.json)
- [플랫폼 사용 순서와 실행기 안내](../platform/docs/IMPLEMENTATION_START.md)

플랫폼은 프로젝트 설정과 발행된 기획 기준선 최대 5개·합계 40,000자를 고정해 전송한다. 결과는 작업별 원문 근거·의존성·수용 기준·질문을 검증한 뒤 `needs_review`로 저장한다. 프로젝트 문맥, 입력 밖 근거, 순환 의존, 승인·실행 필드 등 계약 밖 결과는 거절한다. Nora 단계는 저장소 코드를 읽거나 수정하지 않는다. 승인 후 별도 코드 실행 요청과 로컬 Codex 실행기가 실제 변경안을 작성하며 공개 GitHub 저장소의 실제 기준 브랜치·커밋이 필요하다.

운영 서버는 `NORA_IMPLEMENTATION_TOKEN`을 사용한다. 호출은 multipart `input`과 `variables: {implementation_request: request}`, 접두사 없는 `Authorization` 트리거 토큰이다. 개발 전용 비밀 파일은 `nora/.secrets/implementation-secret.json`(0600)이며 배포에 포함하지 않는다. 계획 처리기는 호출 전 의도를 저장하고 120초 임대를 사용한다. 통신·재시작 후 결과가 불명확하면 `uncertain`으로 남기며 자동 재호출하지 않는다. 코드 실행 연결 파일도 요청 하나에 한정되고 2시간 뒤 만료된다. 패치 작성 후 자동 push·PR·병합은 하지 않는다.

Nora 자체의 합성 검증은 `IMPLEMENTATION_ALLOW_LIVE_NORA=1 node nora/implementation-plan/run-acceptance.js`로 실행한다. 별도 운영 전체 경로 점검은 `IMPLEMENTATION_SMOKE_ALLOW_LIVE=1 node scripts/smoke-implementation-live.js`이며 실제 Nora와 로컬 Codex를 호출하므로 실행 결과를 따로 기록한다.
