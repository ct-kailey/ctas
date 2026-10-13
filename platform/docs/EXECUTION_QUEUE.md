# 승인 작업 자동 실행기

실행 PC에서 승인된 코드 실행 요청을 주기적으로 확인한다. Railway는 승인·작업 상태·결과를 보관하고, 코드 작성은 연결한 PC의 별도 체크아웃에서 수행한다.

## 시작

1. 실행 PC에 Node.js 22 이상, Git, Codex CLI를 준비하고 Codex에 로그인한다.
2. 프로젝트 설정의 **승인 작업 자동 실행**에서 실행기 연결 파일을 만든다.
3. `ains-execution-agent.json`, `watch-execution-queue.cjs`, `ains-implementation-runner.cjs`를 같은 폴더에 저장한다.
4. 해당 폴더에서 실행한다.

```sh
node watch-execution-queue.cjs --config ains-execution-agent.json
```

기본 Codex 실행 파일이 설치된 위치와 다르면 실행 환경에 `AINS_CODEX_BIN`을 지정한다. 연결 파일은 비밀번호처럼 보관한다. 실행기가 파일 권한을 소유자만 읽고 쓸 수 있도록 조정한다. 연결 자격은 30일 뒤 만료된다. 자격을 연장하려면 기존 연결을 해제하고 새 연결 파일을 만든다.

로컬 개발 서버를 검증할 때만 명시적으로 동일 origin을 지정할 수 있다.

```sh
node scripts/watch-execution-queue.cjs --config /absolute/path/ains-execution-agent.json --origin http://127.0.0.1:3100 --runner scripts/run-implementation.js
```

연결 파일의 URL과 지정한 origin이 다르면 실행하지 않는다. 인증을 포함한 요청의 HTTP redirect를 따라가지 않는다.

## 실행 기준

- 사람이 승인한 작업 계획과 별도의 코드 실행 요청이 있어야 한다.
- 사전 검증·Scope Lock·미답변 질문·문서/저장소 기준을 큐 발급과 실제 실행 시작 시 다시 확인한다.
- 현재 Scope Lock과 실행 요청에 고정된 Scope Lock 해시가 다르면 실행 연결을 발급하지 않는다.
- 큐는 한 번에 30건을 확인하고 다음 조회에서 이어서 점검한다. 앞선 요청이 모두 차단되어도 뒤의 실행 가능한 요청을 계속 탐색한다.
- 임시 파일에는 해당 요청만 처리할 수 있는 2시간 자격을 저장하고 실행 뒤 제거한다.
- 변경 파일은 고정된 코드 경로 안에 있어야 한다. 클라이언트뿐 아니라 서버에서도 이 범위를 확인한다.
- 실행 중 근거가 달라지면 heartbeat가 다음 점검에서 실행을 중단한다. 이미 작성된 범위 내 패치는 검토할 증거로 보존할 수 있지만 승인이나 발행을 의미하지 않는다.

## 중지와 복구

터미널에서 `Ctrl+C`를 누르거나 watcher에 SIGTERM을 보내면 대기 조회를 멈추고 현재 실행기에도 종료 신호를 전달한다. 실행기는 분리된 코드 실행 프로세스를 중단하고, 임시 작업 폴더의 내용을 보존하며 `RUNNER_INTERRUPTED` 결과를 서버에 기록한다. 강제 종료·연결 끊김으로 서버에 기록하지 못하면 lease가 만료되어 결과 확인이 필요한 상태로 남는다.

큐 연결을 해제하면 이후 조회 인증이 차단된다. 이미 발급한 일회용 실행 연결의 취소는 **AI 구현 작업 → 해당 실행 요청 → 기존 연결 파일 취소**에서 별도로 처리한다. 이미 시작한 작업은 실행 PC에서 중지한다.

큐 응답이나 실행 결과 응답을 잃은 요청은 자동 재실행하지 않는다. 먼저 플랫폼의 실행 상태와 PC에 남은 `completion.json`, `result.json`, 체크아웃을 확인한다. 아직 실행되지 않은 대기 요청은 관리자가 해당 요청의 새로운 일회용 연결 파일을 발급하여 복구할 수 있다. 같은 계획을 무조건 다시 실행하지 않는다.

이 실행기는 원격 push·commit·PR·병합·배포를 수행하지 않는다. 검토를 통과한 결과는 별도의 GitHub PR 발행 절차로 전달한다.

## 검증

격리 PostgreSQL 검증에는 `TEST_DATABASE_URL`을 지정한다.

```sh
node --test platform/tests/execution-queue-review.test.js platform/tests/execution-agent-lifecycle.test.js platform/tests/implementation-runner.test.js platform/tests/implementation-executor.test.js
```

로컬 합성 Git 저장소와 provider fixture만 사용한다. 실제 GitHub 쓰기나 AI 실행 호출은 수행하지 않는다. 종료 검증은 실제 로컬 자식 프로세스를 띄우고 SIGTERM 전파·분리된 코드 프로세스 종료·서버 결과 기록을 확인한다.
