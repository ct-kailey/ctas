# Nora Gemini 실행 차단 기록

이 문서는 **기존 Gemini 초안의 과거 오류 기록**이다. OpenAI 키 연결 후 `ains-sism-change-review-openai-v1`을 생성해 정상 입력 7건을 실제 검증하고 발행했다. 현재 상태와 API 계약은 `manifest.json`, `acceptance-summary.json`, 상위 README를 참조한다. Gemini 연동 오류 자체를 수정했다는 뜻은 아니다.

초기 상태: AINS에 변경 검토 플로우를 구성했으나 Gemini 모델 실행에 성공하지 못해 발행하지 않았다. 모든 입력은 합성 데이터다.

## 재현 결과

| 모델/변경 | 결과 | trace |
|---|---|---|
| `gemini-2.5-flash` | 카탈로그에는 text/tool 모델이나 실행기가 OCR-only로 거절 | `trc_1424510c2e434036aaf6ff67cac9d625` |
| `gemini-2.5-pro` | OCR-only 거절 | `trc_3c1c8c1dd08d4e4280d60ba668bfae73` |
| `gemini-3.5-flash` | OCR-only 거절 | `trc_6d4b1b92c571414aaf1d818c5f33896c` |
| `gemini-3.1-flash-lite`, object 도구 인수 | Gemini function schema의 `additionalProperties` 거절 | `trc_747ccad709ac4f68b2e2f0f2d5bd0d13` |
| `gemini-3.1-flash-lite`, string JSON 인수 | 내장 도구와 function calling 혼용 설정 오류 | `trc_a83871c9bafc464ba8454a434f9df11f` |
| 같은 모델, `nativeTools: []` 명시 | 같은 오류 유지 | `trc_de21b1cac38f47b3b46b32886f0f26f6` |
| `gemini-3.6-flash` | 같은 혼용 설정 오류 | `trc_c17d8b76f6d644e8aeee63ced00a1c2b` |

공급자 응답: `Please enable tool_config.include_server_side_tool_invocations to use Built-in tools with Function calling.`

현재 저장 모델은 `gemini-3.1-flash-lite`, 모든 에이전트에 `nativeTools: []`다. `check_provider_readiness`는 `ready:true`, `missing:[]`를 반환한다. 키 존재 확인과 실제 공급자 실행 성공은 별개다. `list_available_models`에 현재 사용 가능한 제공자는 Google만 보였다. 기존 공유 모델 설정이나 API 키는 변경하지 않았다.

## 적용한 조정

도구 인수를 object 대신 `request_json:string`, `review_json:string`으로 선언하고 샌드박스에서 JSON 파싱하도록 변경했다. 파싱 후 업무 스키마와 원문 근거 검증은 유지한다. 이 조정으로 첫 번째 schema 오류는 넘어갔지만 혼용 설정 오류가 남았다. 도구가 원격에서 실제 실행된 것은 아직 검증하지 못했다.

Nora의 `outputRules` schema 속성은 설명과 달리 문자열이어야 저장되므로 JSON Schema를 문자열로 직렬화했다. 후처리 오류는 fail-soft이므로 호출자에서 strict JSON Schema와 `finalizeReview(originalRequest, result)`를 다시 적용한다.

## 재개 조건

1. AINS에 Nora가 정상 지원하는 다른 제공자의 모델을 연결하거나 Nora 측 Gemini adapter/catalog를 수정한다. 비밀키는 Nora 설정에서 관리한다.
2. `list_available_models`로 확인한 모델만 세 에이전트에 적용한다. 준비 도구 호출과 최종 검증 도구 호출을 trace에서 확인한다. 실제 공급자 도구 목록도 확인하여 `nativeTools: []`가 반영되고 불필요한 검색·실행 도구가 활성화되지 않는지 확인한다.
3. 수용 사례 10종 중 정상 7종은 실제 플로우로, 오류 3종은 호출 전 검증으로 검사한다. 원문·locator·후보 보존, 수치 high risk, 미정 질문, 승인 금지를 확인한다.
4. 실제 성공 응답에 맞춰 `validateFlowResponse`의 성공 envelope 계약을 확인한다. partial output이나 후처리 실패를 성공으로 받아들이지 않는다.
5. 성공 후에만 API trigger 비밀 발급, flow 발행, 인증된 운영 호출을 검증한다. 발행 버전과 trace를 manifest에 기록한다.

이 기록은 Nora 운영자에게 전달할 수 있는 재현 자료이며, 이 작업에서는 외부 메시지를 보내지 않았다.

## Google 설정 재확인

사용자의 Google 기본 provider 설정 안내 이후 다시 조회·실행했다. Google 키는 누락되지 않았고 `ready:true`, `missing:[]`를 유지한다. 이 플로우의 세 에이전트는 모두 `gemini-3.1-flash-lite`로 명시 설정되어 있다. 같은 합성 요청을 다시 실행한 trace `trc_a14eb16adfc04cd0909f8ba339f89444`에서도 동일한 내장 도구/function calling 혼용 HTTP 400이 발생했다. 이 문제를 API 키 미설정으로 분류하지 않는다. 근거: `google-provider-recheck.json`.
