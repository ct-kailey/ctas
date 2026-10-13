# AINS 기록 분류 추천

프로젝트의 업무 영역과 기존 논리 문서 목록을 바탕으로 새 기록 또는 기존 기록의 새 버전을 제안한다. 한 개의 OpenAI `gpt-5.4-mini` 에이전트가 JSON을 반환하며, 저장·승인·배포 권한은 없다. 사용자가 종류·업무 영역·문서 관계를 확정해야 등록된다.

## 계약

- 입력: [request.schema.json](request.schema.json). 본문 20,000자, 영역 100개, 문서 후보 300개, 후보 발췌 500자, 전체 UTF-8 256 KiB 제한.
- 출력: [suggestion.schema.json](suggestion.schema.json). 종류는 사용자가 선택한 값을 보존한다. 기존 문서에 연결할 때 영역과 종류가 모두 같아야 한다. 불확실하면 새 문서를 제안한다.
- 검증: `../client/registration-client.js`에서 신뢰할 수 있는 프로젝트 ID, 후보 ID 중복·소속, 명시한 업무 영역, 최종 에이전트 출력 일치, 전체 실행 완료를 검증한다. 임의 필드를 제거하거나 모델 출력을 자동 보정하지 않는다.
- API: `multipart/form-data`의 `input`과 `variables.registration_request`; `Authorization` 헤더에 서버 전용 원시 토큰. 토큰은 브라우저에 전달하지 않는다.
- 오류: 미게시/인증/잘못된 입력은 실행 전 차단한다. HTTP 오류, 미완료·부분 성공, 잘못된 JSON, 다른 영역·종류·문서 ID는 실패 처리한다. 타임아웃/연결 중단은 완료 여부 불명 상태이며 자동 재시도하지 않는다. 수동 등록은 별도 경로로 계속 사용할 수 있다.

## Nora 게시 준비

`draft-definition.json`은 기존 Nora 게시 스냅샷과 같은 payload 구조를 사용한 **로컬 초안**이다. 실제 MCP 도구의 현재 스키마를 먼저 조회한 다음 AINS 워크스페이스 `t_ef2500ebb1b14058847dc513c5c197bc`에만 생성한다. 기존 검토 플로우와 공급자 기본 설정은 변경하지 않는다.

1. 연결 인증을 복구하고 활성/대상 워크스페이스가 AINS인지 확인한다.
2. 플로우 생성/편집/검증/게시 도구를 조회한다. 생성 후 실제 노드 ID를 반영하고 변수 `registration_request`의 원본 객체 바인딩을 확인한다.
3. 새 API 헤더 토큰을 발급해 `nora/.secrets/registration-secret.json`의 `token`에 0600 권한으로 저장한다. 토큰은 출력·스냅샷·추적 파일에 남기지 않는다.
4. 같은 문서 v2, 다른 도메인, 새 대화, 범위 변경을 요구하는 악성 문구를 포함한 합성 사례를 실제 게시 API로 실행한다. 실행 추적에서 외부 도구 호출 여부도 확인한다.
5. 실제 게시 ID·에이전트 ID·버전·검증 결과만 `manifest.json`에 기록하고 `publication_status`를 `published`로 바꾼다. 미검증 설정을 게시됨으로 표시하지 않는다.

`nativeTools:[]`는 선언상 비활성 설정이며, 기존 Nora 검토 플로우에서 보조 도구가 노출된 이력이 있어 강제 차단이 보장됐다고 주장하지 않는다. 프롬프트의 도구 금지와 서버의 결과 검증을 함께 사용한다. 이 플로우의 모델 출력은 실행 가능한 명령으로 취급하지 않는다.

현재 게시 상태와 실제 검증 여부는 `manifest.json`과 `verification.json`이 기준이다.

게시 후 합성 API 검증 명령은 `REGISTRATION_ALLOW_LIVE_NORA=1 node nora/registration/run-acceptance.js`이다. 5가지 사례를 실행하며 제목·파일 이름만 제공한 사례도 포함한다. 이 명령의 출력은 별도 `acceptance-results.json`에 저장되고, 원격 실행 추적의 도구 호출 여부는 MCP로 추가 확인해야 한다.
