# Google 로그인

Google OAuth 웹 서버 흐름으로 로그인한다. 허용한 회사 도메인의 계정은 첫 Google 로그인 때 AINS 계정을 생성한다. Google 인증·계정 가입과 프로젝트 권한은 별개이며, 기존 프로젝트 참여 권한은 관리자가 구성원 화면에서 부여한다. 기존 이메일/비밀번호 로그인은 계속 사용할 수 있다.

Google Cloud의 프로젝트·OAuth 클라이언트와 허용 계정은 배포 환경에 맞게 설정합니다. 사용자와 프로젝트 권한은 별도로 부여합니다.

## Google Cloud 설정

Google Cloud의 Google Auth Platform에서 AINS에 사용할 프로젝트를 선택하고 브랜드 이름·지원 이메일·대상을 설정한다. 조직 내부 전용이라면 Internal을, 외부 Google 계정도 사용할 예정이면 External을 선택한다. External Testing 상태라면 실제 로그인할 계정을 테스트 사용자에 포함한다. AINS의 신규 가입 허용 도메인과 Google의 공개 대상 설정은 별개로 적용된다.

OAuth 클라이언트 유형은 **웹 애플리케이션**이다. 운영 승인된 리디렉션 URI는 다음과 정확히 일치해야 한다.

```text
https://ains-workspace-production.up.railway.app/api/auth/google/callback
```

별도 개발용 OAuth 클라이언트를 사용한다면 개발 리디렉션 URI는 `http://127.0.0.1:3100/api/auth/google/callback`이다. 로그인 시작과 콜백은 같은 origin을 사용한다. `localhost`와 `127.0.0.1`을 섞지 않는다.

## Railway 설정

앱 서비스 `ains-workspace`에 다음 두 변수를 함께 설정한다. 값은 코드나 `VITE_` 환경 변수에 넣지 않는다.

- `GOOGLE_CLIENT_ID`: 발급된 웹 애플리케이션 클라이언트 ID
- `GOOGLE_CLIENT_SECRET`: 해당 클라이언트의 비밀값
- `GOOGLE_SIGNUP_ALLOWED_DOMAINS`: 신규 가입을 허용할 Google Workspace 도메인. AINS 운영값은 `conscience.technology,conscience.partners`이며, 여러 도메인은 쉼표로 구분한다. 비어 있으면 신규 가입을 허용하지 않고 기존 계정만 로그인한다. 와일드카드나 하위 도메인 자동 허용은 지원하지 않는다.

콜백 주소는 서버의 `APP_ORIGIN`으로 계산한다. 별도 임의 redirect URL을 클라이언트에서 받지 않는다. 클라이언트 ID와 비밀값이 모두 없으면 Google 버튼을 숨긴다. 한쪽만 있거나 가입 도메인 형식이 잘못되면 서버 시작 시 설정 오류를 보고한다. 값 설정 후 Railway 앱을 재배포하고 `/api/auth/providers`의 `google.enabled`와 `google.signup_domains`를 확인한다. 이 공개 응답에는 클라이언트 비밀값을 포함하지 않는다. IaC에는 세 키의 `preserve()`를 추가하여 이후 적용에서도 유지한다.

## 계정 연결

첫 Google 로그인 시 Google이 검증한 이메일과 기존 AINS 계정을 연결한다. Gmail 또는 Google Workspace가 실제 관리하는 주소만 최초 이메일 연결을 허용한다. Google 계정에 등록한 일반 외부 이메일 주소는 이 경로로 자동 연결하지 않는다. 연결 후에는 이메일 대신 Google의 고유 `sub` 식별자를 사용하며 다른 계정으로 재할당하지 않는다. Google 계정 연결은 프로젝트 소속이나 역할을 추가하지 않는다. 연결된 Google 또는 AINS 이메일이 바뀌면 자동 갱신하지 않고 `identity_conflict`로 거부하므로 운영자가 소유권을 확인해야 한다.

신규 가입은 검증된 이메일의 도메인과 Google이 서명한 `hd`가 서로 같고, 둘 다 허용 목록의 도메인과 정확히 일치할 때만 허용한다. 이메일 문자열이나 로그인 요청의 `hd` 파라미터만 보고 가입시키지 않는다. 사용자와 Google 식별자는 하나의 트랜잭션으로 연결하며 동시 첫 로그인으로 중복 계정을 만들지 않는다. 현재 비밀번호 필수 스키마와의 호환을 위해 고엔트로피 무작위 값의 해시만 저장하며, 임시 비밀번호를 발급·표시하거나 이메일로 보내지 않는다. 신규 사용자는 Google 로그인으로 이용한다.

`vara@conscience.technology`를 포함한 해당 회사 계정은 **Google로 가입·로그인**을 누르면 된다. 첫 로그인 후 기존 프로젝트가 보이지 않으면 프로젝트 관리자에게 같은 이메일로 구성원 추가를 요청한다. 도메인 밖의 협업자는 기존 운영 CLI로 계정을 등록하고 프로젝트 권한을 별도로 부여한다. 사용자 초대 메일과 계정 복구 UI는 후속 범위다.

## 검증과 오류

로그인 요청은 짧은 유효기간의 브라우저 쿠키와 DB의 일회용 상태로 연결한다. PKCE·nonce, ID 토큰 서명·발급자·대상·만료를 검증하고, 성공하면 기존 8시간 AINS 세션을 발급한다. Google API의 장기 접근이나 Drive 권한은 요청하지 않으며 Google 액세스/리프레시 토큰을 업무 DB에 보관하지 않는다.

- 사용자 취소: 로그인 화면에서 다시 시도할 수 있다.
- 상태 만료 또는 다른 브라우저: AINS 로그인 화면에서 새로 시작한다. 콜백 URL을 복사해서 재사용하지 않는다.
- 신규 가입 거절: 허용한 회사의 Google Workspace 계정인지 확인한다. 개인 Gmail이나 회사 소속 정보가 없는 외부 이메일 Google 계정은 자동 가입하지 않는다. Google 화면 자체에서 접근이 막히면 조직 앱 정책·OAuth 대상을 별도로 확인한다.
- 기존 연결 충돌: 다른 Google 계정을 자동으로 덮어쓰지 않는다. 운영자가 계정 소유권을 확인한다.
- `redirect_uri_mismatch`: Google Cloud의 승인 URI와 실제 HTTPS `APP_ORIGIN`을 비교한다.
- 토큰 교환·검증 실패: 고정된 오류 안내를 제공하고 비밀값, 인증 코드, ID 토큰을 로그에 출력하지 않는다.

운영 검증은 실제 Google 계정으로 로그인하고 기존 프로젝트가 동일하게 보이는지 확인한다. 테스트에서 교환/검증 의존성을 대체한 결과만으로 실제 Google 로그인 성공을 기록하지 않는다.

## 근거

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [서버에서 Google ID 토큰 검증](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
