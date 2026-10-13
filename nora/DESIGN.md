# Nora 문서 파이프라인과 요구사항 변경 검토 플로우 상세 설계

> 범위 안내(2026-10-12): 이 문서는 초기 문서 처리·요구사항 변경 검토의 설계 기록입니다. 신규 Main Context 플로우는 Nora 내부 `requiresApproval`을 사용하며, 현재 플랫폼 구현과 제약은 [Main Context 안내](../platform/MAIN_CONTEXT.md)와 [Nora Context 계약](context/README.md)을 따릅니다.
이 구현은 AINS 워크스페이스에서 문서의 이전·현재 개정을 비교해 실무자가 검토할 변경 후보, 영향 후보, 고객 확인 질문을 생성한다. 원본을 보존하는 로컬 추출 어댑터, Nora 문서 파이프라인 3개 노드, 요구사항 검토 플로우의 에이전트 3개와 코드 도구 2개로 구성한다. 결과는 검토 자료이며 고객 승인, 기준선 발행, 운영 배포를 뜻하지 않는다.

기능 범위는 상위 계획의 P0 원본 보존·입력 검증과 P1 변경 검토의 첫 실행 단위다. 최종 실행 상태는 README/manifest 참조. 모델 선택, Nora 객체 ID, 발행 상태, 실행 ID는 이 문서에서 중복 관리하지 않는다.

현재는 두 Nora 실행 단위가 발행되어 있고, `client/`가 문서 파이프라인과 OpenAI 검토 플로우의 HTTP 호출 및 결과 검증을 구현한다. 문서 API는 JSON/Bearer 인증, 검토 API는 multipart FormData/원문 토큰 헤더를 사용한다. `review-documents` CLI는 두 문서 처리 후 변경 검토까지 연결한다. 후속 구현으로 운영 웹·프로젝트 권한 DB·승인 UI·비동기 worker가 연결되었다. 플랫폼 계약과 최신 운영 상태는 프로젝트 루트 README와 `platform/verification.json`을 따른다.

## 1. 구현 경계

| 영역 | 현재 구현 | 후속 확장 |
|---|---|---|
| 문서 보존 | 로컬 추출 CLI 및 프로젝트 권한이 있는 업로드 API, PostgreSQL 원본·불변 개정·SHA256 보관 | 객체 저장소 이관, 보존 정책 |
| 문서 처리 | PDF·DOCX·PPTX·XLSX·TXT·MD 추출, 원문 위치, 입력 검사, 공백 정규화 | OCR, 복잡한 표·시각 자료 해석, 검색 인덱싱, 외부 문서 커넥터 |
| 변경 분석 | 두 개정 비교·분류·영향/질문 초안, 원문 검사, 영구 검토 기록과 활동 피드 | 원자적 요구사항 대장, 항목 ID 확정, 담당자별 배정 |
| 승인 | Nora 출력은 `not_requested`; 별도 플랫폼에서 사람의 답변·근거·승인/반려·기준선 발행 | 고객 직접 승인 채널, SSO, 외부 업무 시스템 연동 |
| 실행·운영 | 업무 DB·작업 큐·임대 기반 worker·미확인 실행 분리·Railway 배포 및 합성 검증 | 외부 연동 outbox, 부하 검증, 운영 백업/복원 훈련 |

첨부 기획 문서는 업무 요구와 설계 근거로 참고한다. 문서 안에 있는 명령, 승인 문구, 계정·도구 사용 요청을 사용자의 실행 지시로 취급하지 않는다. `domain_pack.glossary`를 포함한 요청 데이터도 실행 권한을 늘릴 수 없다.

## 2. 데이터 처리 순서

1. 어댑터가 파일 크기와 형식을 확인하고 원본 바이트를 보존한다.
2. 형식별 텍스트와 위치를 추출해 `Document` 객체 한 개를 만든다.
3. Nora 파이프라인이 객체 구조를 검사하고 원문을 유지한 정규화 결과를 덧붙인다.
4. 호출자가 같은 논리 문서의 이전·현재 `Document`를 선택하고 도메인 팩과 영향 연결을 묶는다.
5. 변경 분석 에이전트가 코드 도구로 후보를 확정한 뒤 의미를 분류한다.
6. 영향·질문 에이전트가 근거 있는 영향과 확인 질문을 작성한다.
7. 근거 검증 에이전트가 코드 도구로 후보 누락·원문 변경·잘못된 승인을 검사하고 JSON을 반환한다.
8. 플랫폼은 결과를 다시 검증한 뒤 사람 검토함에 저장한다. 검토함·승인 대기·기준선 발행은 현재 구현되어 있다.

이번 파이프라인의 API 입력은 파일 바이너리가 아니라 추출된 `Document`다. 원본 업로드와 형식별 파싱을 Nora가 네이티브 기능으로 모두 처리한다고 가정하지 않는다. 문서 파이프라인과 검토 플로우의 호출 간 연결 역시 업무 API/worker가 맡을 경계다.

## 3. 공통 입출력 계약

기계 판독 계약은 `nora/schemas/document.schema.json`, `change-review-request.schema.json`, `change-review-result.schema.json`이다. 다음 타입은 계약을 읽기 쉽게 요약한 것이다. JSON Schema와 코드 검증을 함께 적용해야 하며, 스키마 통과만으로 프로젝트 권한이나 원문 진위를 입증할 수는 없다.

```ts
type Locator = {
  kind: 'page' | 'slide' | 'sheet' | 'paragraph' | 'text';
  label: string; // page 2, slide 3, 정책!B7 등 원문에서 찾을 수 있는 위치
};

type Segment = {
  segment_id: string;               // 해당 Document 안에서 유일
  requirement_key: string | null;   // 검증된 항목 연결이 없으면 null
  text: string;                     // 비어 있지 않은 추출 원문
  locator: Locator;
  extraction_status: 'ok' | 'needs_review';
  normalized_text?: string;         // 파이프라인이 추가; 원문 대체 금지
};

type Document = {
  schema_version: '1.0';
  project_id: string;
  document_id: string;              // 개정 간 유지되는 논리 문서 ID
  revision_id: string;              // 같은 ID를 다른 바이트로 교체할 수 없음
  source: { filename: string; mime_type: string; sha256: string };
  segments: Segment[];
  extraction: { complete: boolean; warnings: string[] };
  normalization?: {
    status: 'ready' | 'needs_review';
    warnings: string[];
    segment_count: number;
  };
};

type ImpactKind = 'screen' | 'api' | 'database' | 'test' | 'document' | 'other';
type ChangeReviewRequest = {
  schema_version: '1.0';
  request_id: string;
  project_id: string;
  baseline: Document;
  current: Document;
  domain_pack: { id: string; version: string; glossary: object[] };
  impact_map: { requirement_key: string; targets: { kind: ImpactKind; ref: string }[] }[];
};

type Evidence = { segment_id: string; text: string; locator: Locator };
type ChangeReviewResult = {
  schema_version: '1.0';
  request_id: string;
  project_id: string;
  status: 'needs_review' | 'no_change' | 'blocked';
  changes: {
    change_id: string;
    requirement_key: string | null;
    change_type: 'added' | 'removed' | 'modified' | 'editorial' | 'uncertain';
    risk: 'low' | 'medium' | 'high';
    summary: string;
    before: Evidence | null;
    after: Evidence | null;
    reason: string;
    impacts: { kind: ImpactKind; ref: string; basis: 'provided' | 'inferred'; reason: string }[];
  }[];
  questions: {
    question_id: string;
    related_change_ids: string[];
    question: string;
    options: string[];
    requires_customer_decision: true;
  }[];
  warnings: string[];
  approval: { status: 'not_requested'; baseline_publication_allowed: false };
};
```

`baseline`은 비교 대상 이전 개정이라는 의미다. 입력 이름만으로 고객 승인된 기준선임을 보장하지 않는다. 향후 업무 API가 승인된 개정을 선택했다는 근거를 별도 관리해야 한다.

| 검사 | 적용 규칙 |
|---|---|
| 문서 범위 | 요청·이전·현재의 `project_id` 일치, 두 문서의 `document_id` 일치 |
| 개정 무결성 | 같은 `revision_id`에 다른 SHA256을 전달하면 거절 |
| 위치 | 모든 세그먼트에 허용된 kind와 비어 있지 않은 label 필요 |
| 개수 | 문서별 세그먼트 1~200개, 영향 연결 최대 200개, 변경·질문 각각 최대 400개 |
| 텍스트 크기 | 문서별 합계 최대 100,000자; 자동 잘라내기 없음 |
| 파이프라인 크기 | Document 직렬화 결과 최대 2,000,000 UTF-8 바이트 |
| 중복 | 중복 segment ID와 중복된 비-null requirement key는 입력 오류 |
| 원문 해시 | 소문자 16진수 64자; 실제 원본과의 해시 대조는 어댑터/호출자 책임 |
| 승인 | `approval.status='not_requested'`, `baseline_publication_allowed=false` 고정 |

어댑터는 ID를 ASCII 1~128자로 제한하며 파이프라인은 비어 있지 않은 200자 이하 ID를 허용한다. 현재 검토 core의 문자열 길이 제한은 JavaScript UTF-16 `length`, 파이프라인은 Unicode code point 개수 기준이므로 보조 평면 문자가 많은 입력에는 검토 core가 더 보수적으로 적용된다. 문서 크기 제한을 모델의 컨텍스트 용량이나 응답 시간 보장으로 해석하지 않는다.

## 4. 원본 보존과 추출 어댑터

구현 파일은 `nora/adapter/extract_document.py`이며 세부 실행법과 오류 코드는 같은 디렉터리의 README에 있다. 원본 파일을 최대 20 MiB까지 읽어 SHA256을 계산하고, `<archive-dir>/sha256/<앞 2자>/<전체 해시>`에 원본 바이트를 저장한다. 출력 JSON에는 로컬 파일 경로를 포함하지 않는다.

`registry.sqlite3`의 `(project_id, document_id, revision_id)` 고유 키에 해시를 연결한다. 같은 개정·같은 바이트의 재시도는 허용하고 다른 바이트의 덮어쓰기는 거절한다. 보관 파일을 새로 교체하지 않으며 기존 파일의 해시를 재검증한다. OS 관리자에 대한 WORM 저장소 보장은 아니므로 운영 저장소의 접근 제어·버전 보존은 별도 구현한다.

| 형식 | 출력 단위 | 검토가 필요한 제한 |
|---|---|---|
| PDF | 페이지별 원문과 페이지 번호 | OCR·표 관계·글리프 정확도·읽기 순서 미검증; 항상 불완전/검토 상태 |
| DOCX | 본문·표 셀의 문단과 위치 | 표 레이아웃·이미지·머리말·각주·변경 추적·복잡한 필드 등은 경고 |
| PPTX | 슬라이드별 텍스트·표와 번호 | 마스터·배치·시각 자료·노트 등을 완전히 복원하지 않아 항상 검토 상태 |
| XLSX | 비어 있지 않은 셀별 JSON 텍스트와 셀 주소 | 원시값·자료형·표시 형식 유지; 수식과 캐시를 분리하고 캐시를 검증된 결과로 사용하지 않음 |
| TXT / MD | UTF-8 원문 전체 | 잘못된 인코딩 거절; BOM·줄바꿈·공백·숫자·단위 유지 |

전체에 추출 가능한 텍스트가 없으면 `EMPTY_EXTRACTION`으로 중단하며 원본만 보관한다. 일부 페이지·슬라이드에 텍스트가 없으면 해당 위치를 경고에 명시하고 나머지 텍스트와 `complete:false`를 반환한다. 지원하지 않는 내용을 성공한 추출로 표시하지 않는다.

추출 직후 `requirement_key`는 `null`이다. 문서 ID, 페이지 번호, 세그먼트 순번만으로 영구 요구사항 ID를 확정하지 않는다. 항목 ID 연결을 검토하는 화면과 원장은 후속 기능이며, 그 전에는 위치 기반 매칭의 한계를 결과에 남긴다.

## 5. Nora 문서 파이프라인 3개 노드

파이프라인 이름은 `AINS SI/SM Document Intake v1`이다. 흐름은 `Document Envelope API → Validate Document Envelope → Preserve and Normalize Text`다. 모델 호출, 외부 HTTP 호출, 저장소 sink는 포함하지 않는다.

| 노드 | 입력 | 수행 내용 | 출력·실패 |
|---|---|---|---|
| Document Envelope API | 인증된 호출자의 Document 한 개 | 파이프라인 실행 시작 | 입력을 후속 노드로 전달; array 입력은 호출자가 사전 거절 |
| Validate Document Envelope | sandbox 전역 `args`의 Document | 구조·크기·중복·위치·해시 형식·추출 상태 검사 | 성공 시 `{}` 반환, 실패 시 `SISM_<code>: <path>` 예외 |
| Preserve and Normalize Text | 검증된 Document | 검증을 다시 실행하고 정규화 텍스트·상태 추가 | `segments`, `normalization` 반환; 원본 식별자·해시·text·locator 유지 |

Nora `enr_script`의 반환 객체는 입력 레코드와 얕게 병합된다. 첫 검사 노드가 `{}`를 반환해도 입력 문서는 유지된다. 마지막 노드가 반환하는 `segments`는 기존 세그먼트의 원문 필드를 복사하고 `normalized_text`만 추가한 것이다.

정규화는 CRLF/CR을 LF로 바꾸고 각 줄의 연속 공백·탭·NBSP를 일반 공백 하나로 줄인 후 양 끝 공백을 제거한다. NFKC, 숫자 형식 변환, 단위 통합, 비교 연산자 교체는 수행하지 않는다. `５`, `㎖`, `≥`, `이상` 등의 표현을 임의로 바꾸지 않는다. 비교·출력 근거는 항상 `text`로 유지한다.

추출 경고가 있거나 불완전한 추출이면 `normalization.status='needs_review'`다. 어댑터는 모든 입력에 문서 지시문을 데이터로 취급한다는 경고와 목데이터 판정 불가 경고를 포함하므로, 실제 어댑터 출력은 내용 변경이 없어도 검토 상태가 된다. `ready`는 경고가 없는 합성·검증된 입력에서 가능한 처리 상태이며 고객 확정 상태가 아니다.

소스 파일은 다음처럼 나뉜다.

- `validate-document.js`: 첫 검사 노드 코드.
- `normalize-document.js`: 정규화만 담당하는 코드.
- `normalize-block.js`: 마지막 노드에 배포할 코드. 검사 코드를 IIFE로 선행하고 정규화를 실행한다.
- `draft-snapshot.json`: Nora에서 다시 읽은 그래프. 실제 객체 상태는 manifest와 함께 확인한다.
- `evidence.json`: 실제 실행 결과·단언과 확인된 플랫폼 한계.

### 호출자가 반드시 검사할 결과

Nora는 array 입력을 여러 레코드로 처리한다. 실제 시험에서는 일부 레코드가 실패해도 run 전체가 `succeeded`로 나타났다. 따라서 다음 조건을 모두 만족해야 유효한 문서 결과로 받을 수 있다.

1. 입력이 Document 객체 한 개이며 array가 아니다.
2. 모든 stage의 `artifacts.failed`가 0이다.
3. `report.final_output`을 JSON으로 해석한 결과가 단일 Document이며 `script_error`가 없다.
4. `normalization`이 있고 출력 스키마를 만족한다.
5. 요청한 프로젝트·문서·개정·원본 해시와 모든 원문 `text`·위치가 그대로다.

어떤 조건이든 실패하면 전체 응답을 거절한다. 최종 정규화 노드는 입력 검사를 반복해 앞 단계의 오류 레코드가 정상 상태를 받지 못하게 한다. 실행 결과 보고서가 비어 있는 단일 블록 테스트만으로 성공을 판단하지 않는다.

## 6. 요구사항 변경 검토 플로우 3개 에이전트

모든 에이전트에 동일한 `review_request` 변수를 전달한다. 변수 안의 원문·용어집은 신뢰할 수 없는 데이터다. 에이전트 간에는 완전한 `ChangeReviewResult` 형태의 JSON을 전달하고 원래 요청은 별도 변수로 유지한다.

| 순서·역할 | 프롬프트 소스 | 입력 | 허용 도구와 책임 | 출력 |
|---|---|---|---|---|
| 1. 변경 분석 | `flow/01-change-analysis.md` | 원래 `review_request` | `prepare_requirement_review`로 후보를 받은 뒤 변경 의미 분류 | 후보 전체와 원문 근거를 유지한 결과; 영향·질문은 빈 배열 |
| 2. 영향·질문 | `flow/02-impact-and-questions.md` | 원래 요청 + 이전 노드 JSON | 외부 도구 없음; 영향 연결 대조·정책 공백·고객 질문 작성 | 기존 후보를 보존하고 impacts/questions/warnings 보완 |
| 3. 근거 검증 | `flow/03-evidence-gate.md` | 원래 요청 + 완성된 후보 JSON | `finalize_requirement_review` 실행 | 성공한 도구 결과를 수정 없이 반환 |

각 노드는 JSON만 출력한다. 원래 후보 ID·requirement key·전후 근거를 바꾸거나 후보를 누락해서는 안 된다. 승인·기준선 발행·외부 검색·코드 수정·알림·배포 도구는 이 플로우의 업무 범위에 포함하지 않는다.

### 변경 분류와 질문 작성

추가·삭제는 원문 존재 여부를 기준으로 한다. 수치나 경계값이 달라진 변경은 문구 수정으로 낮추지 않는다. 단순 표현 수정은 의미가 같다고 판단할 근거가 있어야 `editorial`로 분류한다. 추출·매칭에 불확실성이 있으면 이유와 경고를 남긴다.

영향의 `basis='provided'`는 요청의 `impact_map`에 같은 requirement key와 kind/ref 연결이 있을 때만 허용한다. 영향 정보가 없으면 실제 코드 경로·API route·DB 테이블을 생성하지 않는다. 일반적인 검증 영역을 제안할 때는 `inferred`로 구분한다.

질문은 정책 누락·모순·업무 의도 불명확성에 한정한다. 명확한 변경에 불필요한 질문을 생성하지 않는다. 현재 정책이 `미정` 또는 `TBD`라면 관련 변경 ID를 가리키는 결정 질문을 만든다. 이전 값이나 임의 기본값을 확정값으로 사용하지 않는다. 모든 질문은 `requires_customer_decision:true`지만 실제 고객에게 전송되지는 않는다.

## 7. 결정적인 코드 도구 2개

공통 구현은 `nora/flow/review-core.js`다. 네트워크·파일 시스템·임의 코드 평가·업무 데이터 변경 없이 입력과 출력만 검사한다. v2의 Nora 도구는 네이티브 객체를 받는다. `request`는 `source:fixed`, `fixedValue:{{review_request}}`로 원래 요청에 연결되며, 모델의 `{request:{}}` 호출 자리표시자를 런타임이 원본 객체로 대체한다. 데이터가 코드 문자열에 삽입되는 방식은 사용하지 않는다. 문자열 fallback이 발생한 경우에만 런타임 직렬화 데이터를 JSON 파싱하며 내용을 수선하지 않는다. 문서와 결과의 실제 계약은 앞서 정의한 JSON Schema로 유지한다.

### prepare_requirement_review

핵심 함수는 `prepareReview(request)`이며 입력은 `ChangeReviewRequest`다. 모델 호출 인수는 `{request:{}}`이고 런타임이 고정 파라미터를 원래 요청 객체로 바인딩한다. 모델이 원문을 복사·요약·재직렬화하지 않는다. 반환값은 다음 구조다.

```ts
{
  schema_version: '1.0',
  request: ChangeReviewRequest,
  candidates: {
    change_id: string,
    requirement_key: string | null,
    change_type: 'added' | 'removed' | 'modified',
    risk: 'medium' | 'high',
    before: Evidence | null,
    after: Evidence | null,
    match_method: 'requirement_key' | 'exact_text' | 'source_position' | 'unmatched',
    critical_change: boolean
  }[],
  warnings: string[],
  constraints: {
    customer_approval: false,
    baseline_publication_allowed: false,
    domain_validation: 'human_required'
  }
}
```

매칭 순서는 아래와 같다.

1. 같은 non-null `requirement_key`를 연결한다.
2. 남은 세그먼트 중 비교용 원문이 정확히 같고 두 항목의 명시적인 key가 충돌하지 않는 쌍을 연결한다.
3. 양쪽 key가 없고 `segment_id`가 같은 쌍은 위치 기반 후보로 연결하고 `MATCH_REQUIRES_REVIEW` 경고를 남긴다.
4. 남은 현재 항목은 추가, 남은 이전 항목은 삭제 후보로 만든다.

비교용 문자열은 NFC와 공백 정리만 적용한다. 같으면 변경 후보를 만들지 않는다. 후보의 근거에는 변경되지 않은 원문을 복사한다. 이 매칭은 임베딩 기반 항목 식별이나 일반적인 의미 diff가 아니다. 페이지 단위 추출 후 내용이 이동한 문서, 항목이 분할·병합된 문서는 실무자 검토가 필요하다.

숫자·비교 연산자·일부 한국어 경계 표현·일부 단위의 토큰열이 달라지면 `critical_change:true`, `risk:'high'`로 둔다. 현재 정규식은 모든 도메인의 단위·수식·동치 관계를 다루지 않는다. 새 도메인 적용 시 검증 규칙과 평가 사례를 확대해야 한다.

명백한 지시문 우회 패턴과 일치하는 세그먼트는 후보 분석에서 제외하고 `QUARANTINED_INSTRUCTION` 경고를 남긴다. 원본 archive와 입력 요청에는 남아 있다. 정규식 탐지는 완전한 공격 탐지나 정상 요구사항 판별을 보장하지 않으므로 경고 세그먼트도 사람이 확인해야 한다. Nora에 연결한 도구는 순수 함수 2개이며 호출자는 원래 요청과 결과를 다시 검증한다. 단, `nativeTools:[]`에도 실패한 과거 초안 trace에서 Nora 내장 `execute_python`이 노출된 사례가 있어 이 설정을 강제 도구 차단으로 주장하지 않는다. 프롬프트는 보조 도구를 금지하며, 회귀 trace와 호출자 검증을 함께 확인한다.

### finalize_requirement_review

v2 도구는 `assembleReview(request, proposal)`을 거쳐 변경 ID로 원래 후보의 `requirement_key`, `before`, `after`를 조립한 후 변경되지 않은 `finalizeReview(request, review)`를 호출한다. 모델 호출은 `{request:{}, review:semanticProposal}`다. 제안의 각 변경에는 `change_id,change_type,risk,summary,reason,impacts`만 허용한다. 모델이 근거 필드를 제출하면 조용히 덮어쓰지 않고 거절한다. 알 수 없는·중복·누락 ID, 숫자 변경 위험도 낮춤 역시 거절한다. 성공하면 전체 `ChangeReviewResult`를 반환하며 다음 사항을 검사한다.

- 요청·프로젝트 식별자가 원래 입력과 일치한다.
- 예상 후보가 빠짐없이 정확히 한 번씩 존재한다. 알 수 없는 후보를 추가할 수 없다.
- 이전 근거는 baseline, 현재 근거는 current의 segment ID·원문·locator와 정확히 일치한다.
- 추가·삭제·쌍이 있는 수정 후보의 종류가 원문 존재 여부와 모순되지 않는다.
- `critical_change`는 `modified/high`를 유지한다.
- `provided` 영향은 입력 연결에 존재한다.
- 질문 ID가 유일하고 질문이 존재하는 변경 ID만 참조한다.
- 승인 상태와 기준선 발행 불가 조건을 유지한다.

도구는 원래 준비 단계의 경고를 다시 병합한다. 변경·질문·경고 중 하나라도 있으면 `needs_review`, 모두 비어 있으면 `no_change`로 정리한다. 모델이 `blocked`를 제출하면 `MODEL_BLOCKED` 예외로 멈춘다. 도구 성공은 원문 근거와 구조의 검사이며 도메인 판단이 정확하다는 보장이 아니다.

### 출력 후처리의 역할

`flow/output-gate.js`는 JSON 파싱과 최상위 필드·기본 상태·승인 금지 조건을 확인한다. 실패하면 `status:'blocked'`, `request_id:'invalid'`, `project_id:'invalid'`, `warnings:['OUTPUT_SCHEMA_INVALID']`인 차단용 객체를 반환한다.

이 후처리는 원문 대조나 전체 스키마 검증을 대체하지 않는다. 현재 호출 클라이언트는 strict JSON Schema, 원래 요청 기반 최종 도구 검증, 식별자와 후보 근거 검사를 적용한다. REST 응답의 세 에이전트 출력 및 마지막 결과 일치도 확인하며, 실제 도구 호출은 수용 시험의 trace로 검증했다. 향후 운영 플랫폼은 검증된 결과와 실행 이력을 저장해야 한다. 후처리 실행 자체가 실패해 원문 출력이 남을 수 있는 Nora 동작을 고려해, run 성공 표시만으로 결과를 신뢰하지 않는다.

## 8. 오류와 재처리

| 발생 지점 | 대표 코드·상태 | 처리 방식 |
|---|---|---|
| 추출 어댑터 | `FILE_LIMIT`, `SEGMENT_LIMIT`, `TEXT_LIMIT`, `ARCHIVE_LIMIT` | 파일을 명시적으로 나누어 새 문서/개정으로 등록; 자동 자르기 금지 |
| 원본 registry | `REVISION_CONFLICT`, `ARCHIVE_INTEGRITY` | 같은 개정 덮어쓰기 중단; 새 개정 또는 원본 복구 필요 |
| 원문 해석 | `EMPTY_EXTRACTION`, `INVALID_UTF8`, `PARSE_FAILED` | OCR·형식 확인·수동 검토; 원본은 보존 |
| 파이프라인 | `SISM_INVALID_*`, 중복·크기 오류, 실패 레코드 | 출력 채택 금지; 입력 수정 후 재실행 |
| 검토 입력 | `PROJECT_MISMATCH`, `DOCUMENT_MISMATCH`, `MISSING_LOCATOR`, `AMBIGUOUS_REQUIREMENT_KEY` | 모델 실행 전 차단하거나 준비 도구에서 중단; 데이터 연결 수정 |
| 후보·근거 출력 | `OMITTED_CHANGE`, `OUTPUT_COVERAGE_INVALID`, `EVIDENCE_MISMATCH` | 원문을 바꿔서 통과시키지 말고 출력 실패로 기록 |
| 위험·영향 출력 | `CRITICAL_CHANGE_DOWNGRADED`, `UNSUPPORTED_IMPACT` | 임의 승인·위험 축소 금지; 검토 결과 재생성 또는 사람 확인 |
| 승인 위반 | `ILLEGAL_APPROVAL` | 결과 차단; 어떤 업무 확정도 수행하지 않음 |
| 모델·후처리 | `MODEL_BLOCKED`, `OUTPUT_SCHEMA_INVALID`, 차단용 객체 | 완료로 저장하지 않고 실패·검토 필요 상태로 처리 |
| 외부 서비스 | timeout, 일시적 공급자 오류 | 향후 worker에서 입력·버전을 고정해 제한 재시도; 무제한 자동 재시도 금지 |

원문 식별·권한·스키마 오류는 같은 입력을 반복 호출해도 해결되지 않는다. 일시적 실행 실패와 입력 수정이 필요한 실패를 구분한다. 현재 로컬 어댑터의 멱등성은 원본 개정 보존에만 적용되며 Nora 요청·업무 저장·승인·외부 쓰기 전체의 중복 방지를 제공하지 않는다.

향후 재시도 키는 프로젝트·문서·두 개정·flow/pipeline 버전·domain-pack 버전·요청 해시를 포함한 서버 생성 값으로 정한다. 작업 상태, Nora run, 오류 코드, 시도 횟수, 마지막 성공 단계는 업무 DB에 저장한다. 실제 사용 버전을 확인할 수 없으면 추정한 버전을 확정 사실로 기록하지 않는다.

## 9. 도메인 확장 방식

현재 공통 처리에는 파일·개정·세그먼트·근거·변경·질문·영향이라는 최소 구조만 둔다. 도메인 팩의 실제 구현 필드는 `id`, `version`, `glossary`이며 용어집 객체의 세부 구조는 아직 느슨하다. 이는 완성된 규칙 엔진이나 Nora 네이티브 도메인 팩 기능을 뜻하지 않는다.

도메인 확장 시 공통 플로우 복제를 기본으로 하지 않는다. 다음 확장을 버전이 있는 설정과 코드로 추가한다.

| 확장 지점 | 추가할 내용 | 검증 기준 |
|---|---|---|
| 용어·개념 | 용어 정의, 동의어, 금지된 추정, 항목 식별 규칙 | 원문과 용어 정의가 충돌할 때 임의 확정하지 않음 |
| 구조 | 도메인별 필수 속성·조건·단위·상태 | 스키마 버전을 올리고 기존 자료 변환 정책 명시 |
| 결정 규칙 | 단위·경계값 검사, 미정 상태, 필수 질문 | 사람이 확인한 입력·기대값·예외 사례로 테스트 |
| 영향 연결 | 화면·API·DB·테스트와 항목 ID 연결 | 프로젝트 범위 안의 실제 참조만 `provided`로 허용 |
| 승인 정책 | 승인권자, 임시 사용 범위, 만료·재승인 조건 | AI 결과와 승인 이벤트를 분리 |
| 평가 | 실제 변경 쌍, 사람이 수정한 이유, 도메인 기대값 | 모델·프롬프트·규칙 변경 전 회귀 검증 |

프로젝트 설정은 Nora workspace/flow/pipeline 참조, 담당자, 커넥터, SLA와 고객 예외를 보관한다. 이 설정은 인증된 서버에서 선택하며 사용자가 요청 본문으로 임의 워크스페이스나 프로젝트를 바꾸게 하지 않는다. 새로운 도메인은 합성 사례를 먼저 통과시키고 실제 담당자 검토를 거쳐 적용한다.

## 10. Railway 플랫폼 경계

Railway AINS 프로젝트에 웹/API와 worker를 하나의 서비스로 배포하고 PostgreSQL을 연결했다. 아래는 현재 구현이며 구체적인 API와 상태 규칙은 `platform/docs/IMPLEMENTATION_CONTRACT.md`, 실행·복구 절차는 `platform/docs/OPERATIONS.md`를 따른다.

| 구성 | 책임 |
|---|---|
| 웹/API | 로그인·프로젝트 접근 검사, 업로드 접수, 작업 ID 반환, 변경 검토·질문·승인 API |
| integration worker | 파일 추출, Nora 호출, 결과 검증, 실행 임대/heartbeat, 미확인 실행 분리, 명시적 재시도 |
| PostgreSQL | 원본 바이트·문서·개정·변경 묶음·사람 결정·승인·기준선·감사·작업 큐 |
| 원본 저장 | 초기에는 PostgreSQL bytea, 프로젝트 인증 후 다운로드; 객체 저장소 이관은 후속 |
| Nora | 문서 변환 파이프라인과 AI 검토 실행 |

API는 장기 분석이나 고객 회신을 HTTP 요청 안에서 기다리지 않고 작업을 등록한다. worker는 Nora 엔진을 다시 구현하지 않고 입력 전달과 업무 상태 동기화를 맡는다. Nora 실행 성공과 업무 상태 `고객 답변 대기`, `검토 완료`, `확정`은 별도로 저장한다.

사람이 검토한 결과를 확정하려면 특정 변경 묶음·항목 개정에 대한 승인자·시각·근거가 필요하다. 승인 대기 중 내용이 바뀌면 기존 승인을 새 개정에 적용하지 않는다. 무응답을 승인으로 해석하지 않는다. 기준선 ID와 릴리스 ID도 분리한다.

분석을 종료한 뒤 업무 DB에서 사람 답변과 결정을 기다린다. Nora의 승인 대기/재개 API는 사용하지 않는다. 승인과 발행은 별도 트랜잭션이며 프로젝트 권한, 질문 근거, 대상 개정과 현재 기준선을 검사한다. 질문의 답변은 원본 파일을 수정하지 않는다. 합의로 문서 내용이 바뀌면 새 개정을 등록하고 검토해야 한다.

Nora 자격증명은 서버 비밀 설정으로만 제공한다. 브라우저가 bearer token, 원시 승인 ID, 임의 실행 범위를 받지 않게 한다. 운영 전에는 원본과 DB를 함께 복구할 수 있는지, worker 중단·중복 이벤트·늦은 완료 결과에도 개정과 업무 상태가 일치하는지 확인해야 한다.

## 11. 재현과 검증

프로젝트 루트에서 아래 명령으로 모델 호출 없이 핵심 경계를 검증한다.

```sh
PYTHON_ADAPTER=nora/adapter/.venv/bin/python
NODE_NORA=node

"$PYTHON_ADAPTER" -m unittest discover -s nora/adapter -p 'test_*.py' -v
"$NODE_NORA" nora/pipeline/test-pipeline.cjs
```

추출 예시는 다음과 같다. Nora 업로드는 수행하지 않는 로컬 명령이다.

```sh
"$PYTHON_ADAPTER" nora/adapter/extract_document.py input.pdf \
  --project-id AINS --document-id policy-001 --revision-id r1 \
  --archive-dir nora/adapter/.local/archive \
  --output nora/adapter/.local/policy-001-r1.json
```

검토 입력은 `nora/tests/acceptance-cases.json`의 `cases[].request`를 사용해 재현한다. 이 파일의 값은 실제 고객 정책이 아닌 합성 사례이며 원본 해시 산정 규칙도 fixture에 명시되어 있다. 준비·최종 검증 함수는 CommonJS로 불러올 수 있다.

```js
const { prepareReview, finalizeReview } = require('./nora/flow/review-core.js');
const cases = require('./nora/tests/acceptance-cases.json').cases;
const request = cases.find(c => c.id === 'numeric-5-to-50').request;
const prepared = prepareReview(request);
// prepared.candidates를 검토 플로우의 근거 후보로 사용한다.
// 검토 결과를 얻은 뒤 원래 request와 함께 다시 검증한다.
// const verified = finalizeReview(request, reviewResult);
```

현재 합성 수용 사례는 수치 5→50, 이상→초과, 추가, 삭제, 표현·순서 변경, 정책 미정, 잘못된 segments, 문서 내 지시문, 프로젝트 불일치, 원문 위치 누락을 포함한다. 테스트는 문장 표현의 완전 일치보다 원문 근거·위험·승인 금지·후보 보존 조건을 검증한다.

어댑터는 단위 테스트 21개를 통과했고, 첨부된 설계 PDF를 로컬에서 9개 페이지·8,344자로 추출해 원본과 archive 바이트 일치 및 파이프라인 입력 검사를 확인했다. 해당 자료는 이 검증에서 Nora에 업로드하지 않았다. 상세 결과는 `adapter/verification.json`과 `pipeline/evidence.json`에 남겨 두었다. 최종 원격 실행·발행 증거는 README/manifest를 기준으로 확인한다.

검증 결과가 입증하는 범위는 테스트한 파싱·계약·변경·권한·동시 승인·작업 복구 시나리오다. Railway 합성 문서 등록부터 기준선 발행까지 확인했지만, 실제 고객 자료 전체의 정확도·장기 부하·운영 백업 복원·도메인 정책 정확도를 입증한 것은 아니다.

## 12. 다음 구현 순서

1. 실제 변경 쌍으로 누락·오탐·검토시간을 측정하고 도메인별 수용 기준을 정한다.
2. 원자적 요구사항 ID와 화면/API/테스트 관계 원장을 구축한다.
3. 고객 결정으로 원문 내용이 바뀌는 경우 새 개정 작성·재검토 동선을 보강한다.
4. GitHub/Jira/CI 연동, 담당자 배정·알림, SSO를 추가한다.
5. OCR·복잡한 표 해석과 비공개 객체 저장소 이관을 적용한다.
6. 운영 예약 백업·복원 훈련과 부하 시험 후 SM 장애 플로우 및 두 번째 도메인 팩으로 확대한다.

참고 계획: `Nora_SISM_구현_우선순위_및_계획.md`. 현재 구현의 실제 계약과 코드가 계획보다 좁은 경우 이 문서의 구현 경계를 따른다.
