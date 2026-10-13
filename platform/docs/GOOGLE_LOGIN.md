# Google 로그인

Google OAuth 웹 서버 흐름으로 기존 AINS 계정에 로그인한다. Google 인증과 프로젝트 권한은 별개다. 등록되지 않은 이메일에는 계정이나 프로젝트 권한을 자동으로 만들지 않는다. 이메일/비밀번호 로그인은 계속 사용할 수 있다.

Google Cloud의 프로젝트·OAuth 클라이언트와 허용 계정은 배포 환경에 맞게 설정합니다. 사용자와 프로젝트 권한은 별도로 부여합니다.

## Google Cloud 설정

Google Cloud의 Google Auth Platform에서 AINS에 사용할 프로젝트를 선택하고 브랜드 이름·지원 이메일·대상을 설정한다. 조직 내부 전용이라면 Internal을, 외부 Google 계정도 사용할 예정이면 External을 선택한다. External Testing 상태라면 실제 로그인할 계정을 테스트 사용자에 포함한다. 앱에서 등록된 계정만 허용하는 검사는 Google의 공개 대상 설정과 별개로 적용된다.

OAuth 클라이언트 유형은 **웹 애플리케이션**이다. 운영 승인된 리디렉션 URI는 다음과 정확히 일치해야 한다.

```text
https://ains-workspace-production.up.railway.app/api/auth/google/callback
```

별도 개발용 OAuth 클라이언트를 사용한다면 개발 리디렉션 URI는 `http://127.0.0.1:3100/api/auth/google/callback`이다. 로그인 시작과 콜백은 같은 origin을 사용한다. `localhost`와 `127.0.0.1`을 섞지 않는다.

## Railway 설정

앱 서비스 `ains-workspace`에 다음 두 변수를 함께 설정한다. 값은 코드나 `VITE_` 환경 변수에 넣지 않는다.

- `GOOGLE_CLIENT_ID`: 발급된 웹 애플리케이션 클라이언트 ID
- `GOOGLE_CLIENT_SECRET`: 해당 클라이언트의 비밀값

콜백 주소는 서버의 `APP_ORIGIN`으로 계산한다. 별도 임의 redirect URL을 클라이언트에서 받지 않는다. 두 값이 모두 없으면 Google 버튼을 숨긴다. 한쪽만 있으면 서버 시작 시 설정 오류를 보고한다. 값 설정 후 Railway 앱을 재배포하고 `/api/auth/providers`의 `google.enabled`가 `true`인지 확인한다. IaC에는 실제 값 대신 두 키의 `preserve()`를 추가하여 이후 적용에서도 유지한다.

## 계정 연결

첫 Google 로그인 시 Google이 검증한 이메일과 기존 AINS 계정을 연결한다. Gmail 또는 Google Workspace가 실제 관리하는 주소만 최초 이메일 연결을 허용한다. Google 계정에 등록한 일반 외부 이메일 주소는 이 경로로 자동 연결하지 않는다. 연결 후에는 이메일 대신 Google의 고유 `sub` 식별자를 사용하며 다른 계정으로 재할당하지 않는다. Google 계정 연결은 프로젝트 소속이나 역할을 추가하지 않는다. 연결된 Google 또는 AINS 이메일이 바뀌면 자동 갱신하지 않고 `identity_conflict`로 거부하므로 운영자가 소유권을 확인해야 한다.

신규 팀원은 운영 CLI에서 Google 로그인에 사용할 이메일로 계정을 만들고 필요한 프로젝트·역할만 부여한다. 초기 비밀번호가 필요하므로 임의의 강한 비밀번호를 지정하고 보관한다. 사용자 초대와 계정 복구 UI는 후속 범위다.

## 검증과 오류

로그인 요청은 짧은 유효기간의 브라우저 쿠키와 DB의 일회용 상태로 연결한다. PKCE·nonce, ID 토큰 서명·발급자·대상·만료를 검증하고, 성공하면 기존 8시간 AINS 세션을 발급한다. Google API의 장기 접근이나 Drive 권한은 요청하지 않으며 Google 액세스/리프레시 토큰을 업무 DB에 보관하지 않는다.

- 사용자 취소: 로그인 화면에서 다시 시도할 수 있다.
- 상태 만료 또는 다른 브라우저: AINS 로그인 화면에서 새로 시작한다. 콜백 URL을 복사해서 재사용하지 않는다.
- 등록되지 않은 계정: 운영자가 이메일과 소속을 확인해 계정을 발급한다.
- 기존 연결 충돌: 다른 Google 계정을 자동으로 덮어쓰지 않는다. 운영자가 계정 소유권을 확인한다.
- `redirect_uri_mismatch`: Google Cloud의 승인 URI와 실제 HTTPS `APP_ORIGIN`을 비교한다.
- 토큰 교환·검증 실패: 고정된 오류 안내를 제공하고 비밀값, 인증 코드, ID 토큰을 로그에 출력하지 않는다.

운영 검증은 실제 Google 계정으로 로그인하고 기존 프로젝트가 동일하게 보이는지 확인한다. 테스트에서 교환/검증 의존성을 대체한 결과만으로 실제 Google 로그인 성공을 기록하지 않는다.

## 근거

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [웹 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [서버에서 Google ID 토큰 검증](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
