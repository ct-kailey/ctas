# CTAS Desktop

CTAS의 로컬 개발 실행기입니다. Railway의 웹 서비스와 별도로 실행하는 Tauri 2 앱이며, 기존 CTDS 컴포넌트와 카키 테마를 사용합니다.

## 현재 제공하는 기능

- 네이티브 폴더 선택기로 로컬 Git 저장소 선택
- 프로젝트 식별자, GitHub 저장소, 선택한 개발 도구를 기기에 저장
- Git origin과 대상 저장소 일치 여부, 브랜치, 커밋, 미커밋 변경 확인
- Git·Codex·Claude Code CLI의 설치 경로 및 버전 확인
- 사용자가 입력한 작업을 로컬 Codex CLI로 실행하고 작업 내역·결과·diff 확인
- 실행 중단, 실패 원인 표시, 앱을 다시 열었을 때 기록 조회
- 고정된 CTAS 서비스 주소를 시스템 브라우저로 열기

코드 수정은 선택한 저장소의 현재 커밋에서 만든 별도 작업 복사본에서 수행합니다. 원본의 미커밋 변경은 실행 입력에 포함하지 않습니다. 자동 커밋·push·PR 생성·merge는 제공하지 않습니다. 설치된 CLI는 사용자의 기존 로그인 정보를 사용하며 앱 화면에서 인증 키를 입력받지 않습니다. 버전 확인만으로 로그인 성공을 표시하지 않습니다.

이번 버전에서 직접 실행하는 도구는 Codex입니다. Claude Code는 설치 진단과 프로필 선택을 지원하며 실제 실행은 아직 제공하지 않습니다.

## Nora와의 관계

로컬 Codex 실행과 **Nora SDK 연결은 서로 다른 상태**입니다. 이 앱은 Nora의 비공개 desktop relay 프로토콜을 구현하거나 연결 완료를 가장하지 않습니다. Nora 워크스페이스 ID는 이후 연동을 위한 선택 정보입니다.

현재 CTAS 웹의 칸반 작업을 자동으로 받거나 실행 결과를 서버에 동기화하지 않습니다. 웹에서 승인한 요구사항·실행 범위를 기기에 안전하게 전달하고, 실행 결과를 Task에 연결하는 기기 인증 및 작업 전달 API는 다음 연동 범위입니다. 기존 Nora SDK 실행 경로나 승인 검사를 우회하지 않습니다.

의도한 연결 구조:

1. Nora: 프로젝트 Context 분석, 개발 계획, 결과 검토
2. CTAS: Task·승인·실행 이력·PR 관리
3. Tauri: 선택한 저장소에서 로컬 CLI 실행, 진행 상태와 diff 수집

## 실행

macOS에서 Node 22.12 이상, Rust stable, Xcode 개발 도구가 필요합니다. 개발에 사용할 Codex CLI를 설치하고 먼저 로그인하세요.

```sh
npm ci
npm run desktop:dev
```

화면만 브라우저에서 확인하려면 `npm run desktop:web`을 사용합니다. 브라우저에서는 네이티브 명령을 호출하거나 코드를 실행할 수 없습니다.

앱 빌드:

```sh
npm run desktop:build
```

현재 macOS `.app` 빌드 대상입니다. 기본 출력은 `src-tauri/target/release/bundle/macos/CTAS Desktop.app`이며, 체크아웃 경로에 `:`가 있으면 실행 스크립트가 Cargo 출력만 시스템 임시 디렉터리의 `ctas-desktop-target`으로 옮깁니다. 빌드 완료 시 실제 출력 경로를 표시합니다. 외부 배포용 Apple 서명·공증은 별도 설정이 필요합니다.

## 검증

```sh
node --test platform/tests/desktop-bridge.test.js
npm run check:ctds
npm run desktop:build:web
npm run desktop:test
```

일반 테스트는 실제 모델을 호출하지 않습니다. 다음 검증은 새로운 임시 Git 저장소에서 실제 Codex 계정을 사용해 파일 생성·diff·원본 보존을 확인합니다.

```sh
CTAS_DESKTOP_LIVE_CODEX=1 npm run desktop:test -- --lib live_codex_smoke_isolated_fixture -- --ignored
```

개발 모드에서도 경로에 `:`가 있으면 Vite의 파일 접근 검사를 유지한 채 공개 프런트엔드 소스만 임시 경로에 복사하며, 수정사항을 반영합니다. 인증 정보나 `.env`는 복사하지 않습니다.

## 네이티브 경계

- 네이티브 명령은 번들된 `main` 창에만 허용합니다. 외부 웹 페이지에는 IPC를 허용하지 않습니다.
- 작업 폴더는 네이티브 선택값을 사용합니다. JavaScript에서 임의 경로·실행 파일·shell 명령을 전달받지 않습니다.
- 실행할 GitHub 저장소와 HEAD를 시작 시 다시 확인합니다.
- 저장소 복사본은 작업 분리 용도입니다. OS 격리는 Codex의 `workspace-write` sandbox가 담당합니다.
- 프로세스 시간·출력량에 상한을 두고, 원격 저장소로 자동 push하지 않습니다.
- 민감 파일은 diff 표시에서 제외하며 CLI의 인증 정보를 UI나 서버로 복사하지 않습니다.

현재 실행기는 GitHub 원격 주소를 가진 로컬 저장소와 Codex를 지원합니다. 추적 중인 인증 파일, 프로젝트 CLI 설정(`.codex`·`.claude`·`.mcp.json`), 심볼릭 링크 또는 서브모듈이 있으면 실행 전에 중단합니다. `.npmrc`는 인증·네트워크 설정이 없는 허용된 단순 옵션만 지원합니다. 의존성 자동 설치는 하지 않으므로 별도 복사본에 필요한 의존성이 없으면 테스트 미실행 사유가 결과에 남을 수 있습니다. 실행 완료와 테스트 통과는 구분해서 검토합니다.

공식 문서: [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [Tauri capabilities](https://v2.tauri.app/security/capabilities/), [Tauri macOS 서명](https://v2.tauri.app/distribute/sign/macos/).
