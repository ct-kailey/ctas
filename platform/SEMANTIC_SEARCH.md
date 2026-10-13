# 프로젝트 의미 검색

승인된 현재 자료를 실제 임베딩으로 색인하고, 자연어 질문의 벡터 유사도와 키워드 일치를 함께 사용해 원문 근거를 찾습니다. 생성형 답변을 만들거나 검색 점수를 사실의 정확도로 표시하지 않습니다.

## 사용 흐름

1. 프로젝트 AI 연결에 OpenAI 키를 저장합니다. 키는 서버 환경 변수로 제공할 수도 있습니다.
2. Main Context의 의미 검색에서 검토자가 **의미 검색 시작**을 누릅니다. 이 동작은 해당 프로젝트에서 승인된 자료를 임베딩 제공자에 보내는 색인 작업을 활성화합니다.
3. 백그라운드 작업이 자료를 분할·임베딩하고 PostgreSQL에 정규화된 벡터를 저장합니다. 이후 5분마다 새 승인·변경·철회 자료를 확인합니다.
4. 업무 영역을 선택하고 자연어로 검색합니다. 관련 구절과 원본 자료 연결이 함께 표시됩니다.
5. **새 자료 확인·실패 재시도**는 변경된 자료와 실패 항목을 다시 준비합니다. 같은 모델·같은 내용의 완료된 벡터는 다시 생성하지 않습니다.
6. **중지·벡터 삭제**는 자동 색인을 중지하고 이 프로젝트의 저장된 벡터·분할 사본을 삭제합니다. 원문 자료는 유지합니다.

## 구현 범위와 경계

| 항목 | 처리 방식 |
|---|---|
| 대상 | 승인된 문서 기준 버전, 현재 승인 계약 문서, 검토 완료 대화, 확정 Context |
| 제외 | 초안, 검토 후보, 승인 철회·대체·원문 변경 상태, 미승인 업무 항목 |
| 검색 | `0.8 × 양수 cosine + 0.2 × keyword`로 자료별 가장 관련 있는 조각을 정렬. 키워드 검색의 다른 결과를 뒤에 보충 |
| 접근 제어 | 요청 사용자 프로젝트 멤버십 확인, 프로젝트·업무 영역 필터, 원본 현재 승인 및 SHA-256 재확인 |
| 원문 변경 | 정기 색인 전이라도 검색할 때 원문 해시가 다르거나 승인되지 않은 벡터는 제외 |
| 모델 변경 | 다른 모델·차원의 벡터는 검색에서 제외하고 재색인. 새 모델 색인이 없으면 키워드 대체 상태 표시 |
| 저장 방식 | pgvector 설치 없이 PostgreSQL `real[]` 벡터, 프로젝트 안의 제한된 집합을 cosine 계산 |
| 오류 | 제공자 오류 원문·키는 저장하지 않고 고정 코드만 저장. 일시 오류 최대 3회, 재시도 1분·5분. 인증·응답 형식 오류는 즉시 실패 |
| 중복·복구 | DB lease + SKIP LOCKED + 프로젝트 잠금. 2분 lease 만료 후 제한된 재시도. 임베딩은 읽기 변환이며 재시도에도 처리 예약량을 차감 |
| 원문 전송 제한 | 프로젝트의 첫 활성화 이후 승인 자료만 전송. 작업 직전과 완료 후 현재 승인·원문 해시를 다시 확인 |

검색 중 승인·멤버십이 바뀔 수 있어 원격 임베딩 호출 후 다시 확인합니다. 승인된 원문에서 파생된 Context의 철회 여부는 기존 `context-sources.js`의 재귀적 근거 추적 규칙을 따릅니다. 외부 원본 도구 자체의 권한 변경은 커넥터가 플랫폼에 반영한 뒤 적용됩니다.

## 비용·처리 한도

- 프로젝트당 최신 승인 자료 최대 **500개**, 전체 **2,000조각**, 자료당 **32조각**.
- 조각당 최대 **6,000 UTF-8 bytes**, API 요청당 최대 **16개 / 48,000 bytes**.
- 프로젝트당 UTC 하루 **500,000 bytes** 처리 예약, 검색 임베딩 **200회**. 실패·시간초과 요청도 예약량에 포함하여 무한 재시도 비용을 막습니다. 실제 토큰/금액 청구량과는 다릅니다.
- 검색 결과 최대 30개. 모델 기본값 `text-embedding-3-small`, 512차원. 설정은 `text-embedding-3-small`/`text-embedding-3-large`, 2~1,536차원 지원.
- 한도를 초과해 빠진 자료/일부만 색인된 자료 수를 UI에 표시합니다. 대규모 프로젝트는 이후 pgvector 기반 ANN 또는 전용 인덱스로 확장할 수 있습니다.
- 키 미설정, 색인 미완료, 제공자 장애, 일일 한도 도달 시 **키워드 검색으로 대체했다는 이유를 명시**합니다.

## 서버 통합

```js
const {createSemanticService}=require('./semantic-service');
const {mountSemanticRoutes}=require('./semantic-routes');
const {startSemanticWorker}=require('./semantic-worker');
const semantic=createSemanticService(pool,{
  resolveConfig:projectId=>providerSettings.getConfig(projectId)
});
mountSemanticRoutes(projectRouter,{service:semantic,review});
const worker=startSemanticWorker(semantic);
// 종료 시 await worker.stop()
```

`resolveConfig`는 `{apiKey, embeddingModel, embeddingDimensions?}`를 반환합니다. `apiKey` 속성이 없으면 `SEMANTIC_OPENAI_API_KEY` 또는 `OPENAI_API_KEY`를 사용합니다. 프로젝트 비활성화를 나타내는 명시적 `apiKey:null` 또는 빈 문자열은 서버 키보다 우선합니다. 모델 환경값은 `SEMANTIC_EMBEDDING_MODEL`, `SEMANTIC_EMBEDDING_DIMENSIONS`를 사용합니다. Nora에 저장된 provider 키를 추출하거나 글로벌 모델 설정을 바꾸지 않습니다.

UI: `SemanticSearchPanel({project, request, canReview, domains, onOpenSource, notify})`.

| API | 동작 |
|---|---|
| GET `/api/projects/:p/context/semantic/status` | 구성 여부, 색인 상태, 오류, 범위 제한, 일일 예약량 |
| GET `/api/projects/:p/context/semantic/search?query=...&domain_id=...` | 의미+키워드 또는 명시적 키워드 대체 결과 |
| POST `/api/projects/:p/context/semantic/index` `{enabled:true}` | 검토자/관리자 활성화·재동기화·실패 재시도 |
| POST 같은 경로 `{enabled:false}` | 검토자/관리자 비활성화 및 벡터 삭제 |

DB migration `016_context_semantic.sql`: 설정·동기화 시각(`context_semantic_settings`), 분할 원문·해시·모델·벡터·작업 상태(`context_semantic_chunks`), 일별 처리 예약량(`context_semantic_usage`).

## 검증

실제 PostgreSQL의 격리 스키마를 이용해 프로젝트·업무 영역·권한 격리, 원문 변경·승인 철회·없어진 자료, 파생 Context의 근거 철회, 원격 호출 중 권한/승인 변경, 모델 변경, 비용 한도, 지속적 재시도, 동시 worker 중복 방지를 검사합니다. 단위 테스트는 공식 요청 형식, 반환 벡터 검증, 원문이 다른 동의 표현의 순위와 오류 비밀정보 비노출을 확인합니다. 테스트용 임베딩은 제어 가능한 fixture이며 실제 OpenAI 품질/계정 연결 검증과 구분합니다.

OpenAI 요청 스키마와 입력 제한은 [공식 Embeddings API 문서](https://developers.openai.com/api/reference/resources/embeddings/methods/create)를 확인했습니다. 의미 검색의 벡터와 거리 개념은 [공식 Embeddings 가이드](https://developers.openai.com/api/docs/guides/embeddings)를 참고합니다.
