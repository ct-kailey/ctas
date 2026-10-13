# AINS SI·SM 운영 안내

이 문서는 현재 코드의 실행·복구 방법을 설명한다. 실제 배포 주소와 배포 검증 결과는 별도 배포 기록에서 확인한다. 테스트용 문서의 성공은 실제 고객 문서의 추출 정확도나 검토 정확도를 보장하지 않는다.

## 실행 구성

현재 배포 단위는 **웹/API와 작업 처리기가 함께 실행되는 Node 프로세스 1개 + PostgreSQL**이다. `platform/server/start.js`가 마이그레이션, 초기 관리자 생성, HTTP 서버, 작업 처리기를 순서대로 시작한다. 별도 worker 전용 실행 명령은 아직 없다.

원본 파일은 PostgreSQL `revisions.content`의 비공개 `bytea`로 저장된다. Python은 처리 중에만 권한이 제한된 임시 디렉터리에 복사본을 만들고 종료 시 삭제한다. 애플리케이션 파일시스템을 원본 보관소로 사용하지 않으므로 앱 서비스에 영구 볼륨을 연결할 필요는 없다. **PostgreSQL 데이터와 백업은 영구 보관해야 한다.**

Railway 설정은 `.railway/railway.ts`의 `ains-workspace` named partial로 적용한다. 이 파일은 앱 서비스만 관리하고 PostgreSQL·볼륨을 포함하지 않는다. Dockerfile 빌드, 복제본 1개, `/healthz` 검사 120초, 실패 시 재시작 최대 5회, 종료 유예 300초를 지정한다. `/healthz`는 DB 연결만 검사하므로 Nora 인증·모델 호출 성공까지 확인된 것은 아니다.

## 로컬 시작

프로젝트 루트에서 Node 22.12 이상, Python 3, Docker Compose를 사용한다. 아래 DB 접속정보는 `compose.yaml`의 로컬 개발용 값이다.

```sh
npm ci
npm ci --prefix ains-dashboard
docker compose up -d db
cp -n .env.example .env
chmod 600 .env
python3 -m venv nora/adapter/.venv
nora/adapter/.venv/bin/python -m pip install -r nora/adapter/requirements.txt
npm run build
```

`.env`에서 `BOOTSTRAP_ADMIN_PASSWORD`를 12자 이상의 별도 비밀번호로 설정한다. `PYTHON_BIN`에는 생성한 가상환경의 Python 경로를 지정한다. 기존 `.env`가 있다면 덮어쓰지 않고 필요한 값을 확인한다.

```sh
npm run dev
```

기본 화면은 `http://127.0.0.1:3100`이다. 화면 개발 시 다른 터미널에서 `npm run dev:web`를 실행하면 `http://127.0.0.1:5173`에서 API 프록시와 함께 사용할 수 있다.

```sh
TEST_DATABASE_URL='postgresql://ains:local-development-only@127.0.0.1:55432/ains' npm test
```

DB 통합 테스트는 전용 임시 스키마를 생성·삭제한다. `TEST_DATABASE_URL`을 생략하면 DB 통합 테스트는 건너뛰므로 전체 검증으로 기록하지 않는다. `npm run test:platform`은 플랫폼 테스트만 실행한다. 로컬 DB를 멈출 때는 `docker compose stop db`를 사용한다. `docker compose down -v`는 원본과 이력을 포함한 개발 DB 볼륨을 삭제한다.

## Railway 설정 적용과 소스 배포

IaC는 AINS production 프로젝트·환경 ID를 확인하며, 다른 대상에 연결되면 실행을 거부한다. 현재 원격 앱 설정에 적용했다. `config plan`으로 변경 내역을 검토한 뒤 적용하며, 소스 코드 배포는 별도로 실행한다.

현재 설정은 적용 후 재계획에서 변경 없음으로 확인했다. 복제본 1개는 지역별 `replicas`로 선언하고, 재시작 유형은 Railway 기본값 `ON_FAILURE`를 사용하면서 최대 횟수를 5로 지정한다. 실제 배포 manifest에서도 같은 동작을 확인했다. 전역 복제본 필드와 정규화 과정에서 생략되는 기본값을 중복 선언하면 동일한 설정이 계속 변경으로 보일 수 있다.

```sh
npm ci --prefix .railway
npm exec --yes --package=@railway/cli@5.62.1 -- railway config plan --file .railway/railway.ts
npm exec --yes --package=@railway/cli@5.62.1 -- railway config apply --file .railway/railway.ts --yes
npm exec --yes --package=@railway/cli@5.62.1 -- railway config plan --file .railway/railway.ts
```

소스 배포는 최종 배포 기록에 지정한 비밀 파일 제외 스테이징 디렉터리에서 `railway up --service ains-workspace`를 실행하는 별도 작업이다. `config apply`만으로 로컬 소스 변경이 업로드되지는 않는다. `partial`을 제거한 전체 프로젝트 계획을 적용하지 않는다. 이 파일은 PostgreSQL·볼륨 수명주기를 관리하지 않는다.

기존 앱 환경 변수는 모두 `preserve()`로 선언되어 원격 값을 유지한다. 새 변수를 Railway에 추가하면 다음 IaC 적용 전에 그 키의 `preserve()`도 추가하고 계획에 변수 삭제가 없는지 확인한다. 실제 값을 설정 파일에 복사하지 않는다. 자세한 절차와 공식 문서 링크는 [Railway 설정 안내](../../.railway/README.md)에 있다.

## Railway 환경 변수

| 변수 | 설정 |
| --- | --- |
| `NODE_ENV` | `production` — Dockerfile 기본값 |
| `DATABASE_URL` | 해당 Railway 프로젝트 PostgreSQL 접속정보. 앱과 DB 사이의 내부 연결을 사용한다. |
| `APP_ORIGIN` | 실제 공개 주소의 HTTPS origin. 예: `https://서비스도메인`. 로그인·변경 요청의 Origin 검사와 일치해야 한다. |
| `PORT` | Railway가 제공하는 포트. 서버는 `0.0.0.0`에서 수신한다. |
| `PYTHON_BIN` | `/opt/venv/bin/python` — Dockerfile 기본값 |
| `NORA_PIPELINE_TOKEN` | AINS 문서 파이프라인 API 트리거 토큰 |
| `NORA_FLOW_TOKEN` | AINS OpenAI 변경 검토 플로우 API 트리거 토큰 |
| `NORA_REGISTRATION_TOKEN` | AINS `ains-record-registration-v1` 분류 추천 플로우 전용 API 트리거 토큰. 추천 기능 활성화에 필요하다. |
| `NORA_IMPLEMENTATION_TOKEN` | AINS `ains-implementation-plan-v1` 구현 계획 플로우 전용 API 트리거 토큰. 실제 코드 실행기 인증과 별개다. |
| `BOOTSTRAP_ADMIN_EMAIL` | 최초 관리자 이메일 |
| `BOOTSTRAP_ADMIN_NAME` | 최초 관리자 표시 이름 |
| `BOOTSTRAP_ADMIN_PASSWORD` | 최초 관리자 비밀번호. 12~1,024자 |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | 기존 원격 값을 보존한다. 종료 유예 설정은 IaC의 `deploy.drainingSeconds: 300`으로 명시한다. |

운영 시작에는 파이프라인·변경 검토 Nora 토큰이 필요하고, 분류 추천에는 별도 `NORA_REGISTRATION_TOKEN`이 필요하다. 분류 토큰이 없으면 추천 API는 503으로 안내하며 일반 등록은 유지된다. 이 토큰들은 Nora 제공자에 등록한 OpenAI API 키와 다르다. OpenAI 제공자 키는 Nora에서 관리한다. 브라우저 코드, `VITE_` 변수, 이미지, 저장소에 비밀값을 넣지 않는다. 개발 환경에서만 `nora/.secrets/*-secret.json`의 제한된 파일 권한을 확인한 후 토큰을 읽는다. 분류 추천의 개발용 파일은 `registration-secret.json`이며 권한은 0600으로 둔다. Docker 빌드에는 이 디렉터리가 포함되지 않는다.

최초 부트스트랩은 `ains-sism` 프로젝트와 소유자를 생성한다. 이미 등록된 사용자 비밀번호는 재시작으로 바뀌지 않는다. 최초 생성 후 부트스트랩 변수를 제거하려면 **이메일·이름·비밀번호를 함께 제거**한다. 이메일만 남고 비밀번호가 없으면 시작이 거부된다. 다른 부트스트랩 이메일을 넣어도 기존 프로젝트 소유권이 이전되지 않는다.

현재 시작 시 마이그레이션이 적용된다. DB 변경 전 백업을 확보하고 새 이미지로 테스트 DB에서 먼저 검증한다. 실행 중인 Nora 호출이 있는 재배포는 완료 결과를 받지 못할 수 있으므로 작업 대기열이 비어 있는 시점을 사용한다. 강제 종료가 발생하면 아래 `uncertain` 복구 절차를 따른다.

## 사용자와 프로젝트 권한

자유 가입은 없다. 신규 사용자 계정과 선택적 프로젝트 소속은 운영 CLI로 만든다. `NEW_USER_PROJECT`에는 프로젝트 ID를 넣는다. 비밀번호를 명령 인자로 직접 기록하지 않는 예시는 다음과 같다.

```sh
read -r -s NEW_USER_PASSWORD
export NEW_USER_PASSWORD
NEW_USER_EMAIL='reviewer@example.com' \
NEW_USER_NAME='검토 담당자' \
NEW_USER_PROJECT='ains-sism' \
NEW_USER_ROLE='reviewer' npm run user
unset NEW_USER_PASSWORD
```

`npm run user`는 `.env`의 DB 설정을 읽는다. 운영 컨테이너에서도 같은 CLI를 사용할 수 있다. 운영 환경 변수가 주입된 셸에서 실행하며 비밀값을 출력하지 않는다. 기존 이메일에 대한 CLI 호출은 실패한다. 기존 계정의 역할 변경·비밀번호 초기화·초대 화면은 현재 제공하지 않는다. Google 로그인 구성은 [Google 로그인 안내](GOOGLE_LOGIN.md)를 참고한다.

| 역할 | 가능 작업 |
| --- | --- |
| `viewer` | 해당 프로젝트 문서·원본·검토·활동 조회 |
| `member` | 조회, 문서 등록, 변경 검토 생성, 질문 답변, 실패 작업 재시도 |
| `reviewer` | member 권한 + 최초 기준선 발행, 승인·반려, 승인된 기준선 발행 |
| `owner` | reviewer 권한 + 결과 미확인 작업의 위험 확인 후 재시도 |

인증된 사용자는 새 프로젝트를 생성하고 그 프로젝트의 소유자가 될 수 있다. 세션은 8시간이며, 운영 쿠키는 HttpOnly·Secure·SameSite=Lax다. 변경 API는 세션의 CSRF 토큰과 허용 Origin을 모두 확인한다. API를 직접 호출할 때도 로그인 쿠키, `Origin`, `X-CSRF-Token`이 필요하다.

## 업무와 실행 상태

파일 처리 작업: `queued → running → succeeded`. 성공한 문서 버전은 `ready`가 된다. 원본 바이트·해시·논리 문서·버전의 연결은 바뀌지 않으며, 준비 완료된 추출 결과도 변경할 수 없다.

변경 검토 작업: 등록 시점의 기준선과 현재 버전, 도메인 설정을 `reviews.request`에 고정한다. 실행이 성공하면 검토는 `needs_review` 또는 `no_change`가 된다. 작업의 `succeeded`와 사람의 승인은 별개이며, `no_change`도 자동 승인·자동 발행되지 않는다.

1. 첫 문서를 등록하고 처리가 끝나면 원문·추출 결과를 확인한다. reviewer 또는 owner가 사유와 추출 확인을 기록하여 최초 기준선을 발행한다.
2. 같은 논리 문서에 새 버전을 올린다. 준비 완료 후 현재 기준선과의 변경 검토를 생성한다. 같은 기준선/현재 버전 쌍의 검토는 중복 생성되지 않는다.
3. 변경 근거와 질문을 확인하고 질문마다 답변 및 근거를 기록한다. 근거는 문서 위치·회의록·고객 확인 참조 등 텍스트 기록이며 고객에게 자동 전송되지 않는다.
4. reviewer 또는 owner가 사유·결정 근거를 기록하여 승인하거나 반려한다. 승인은 모든 질문의 근거 있는 답변, 원문 확인, 기준선 불변을 요구한다. 결정과 당시 요청·결과 해시·답변은 고정된다.
5. 승인된 검토를 별도로 발행한다. 기준선이 그 사이 바뀌면 발행하지 않고 `STALE_BASELINE`으로 거부한다. 최신 기준선으로 새 검토를 생성한다. 이미 발행된 검토의 재발행 요청은 기준선을 이전 버전으로 되돌리지 않는다.

완료되지 않은 실행은 `failed` 또는 `uncertain`으로 남는다. 원문 삭제나 추출 실패가 정상 결과로 바뀌지 않는다. 활동 기록은 추가만 가능하며 문서·검토·답변·결정·발행·재시도 근거를 보관한다.

## 작업 중단과 재시도

처리기는 DB 행 잠금과 `SKIP LOCKED`로 작업을 가져온다. 기본 임대 시간은 10분, 갱신 주기는 20초다. Nora 호출 전 `pipeline_intent` 또는 `review_intent`, 요청 해시, 실행할 게시 버전 정보를 DB에 먼저 기록한다. 정상 완료 시 실행 ID와 업무 결과를 같은 트랜잭션으로 저장한다.

| 상태/오류 | 의미와 처리 |
| --- | --- |
| `failed`, `*_HTTP_401` | 토큰 등 확인 가능한 실패. 원인을 수정하고 사유를 적어 명시적으로 재시도한다. |
| `failed`, `EVIDENCE_MISMATCH` 등 | 결과의 원문 근거·스키마 검증 실패. 성공 결과로 수동 덮어쓰지 않는다. Nora 추적과 고정 요청을 조사한다. |
| `uncertain`, `*_TRANSPORT_UNKNOWN`, HTTP 5xx/408 | Nora가 실행됐을 수 있으나 로컬에서 완료를 확정하지 못했다. 자동 재호출하지 않는다. |
| `uncertain`, `WORKER_LEASE_EXPIRED` | 실행 중 프로세스 종료 또는 임대 만료. 다시 시작한 처리기는 불확실 상태로 전환하며 재실행하지 않는다. |
| 오래된 실행의 늦은 응답 | 임대가 달라졌거나 만료됐으면 결과를 버린다. 새 시도의 결과나 확정된 기준선을 덮어쓰지 않는다. |

결과 미확인 작업은 다음 순서로 처리한다.

1. 작업 ID, 종류, 시도 횟수, 단계, 오류 코드와 노출된 `execution.run_id`/`execution.trace_id`를 기록한다. ID를 아직 받지 못했다면 DB의 `stage_data.external_call`, 요청 해시, 시작 시각으로 Nora 실행 이력을 확인한다. DB 원문이나 토큰을 지원 로그에 붙이지 않는다.
2. Nora에서 완료 여부와 모델 비용 발생 여부를 확인한다. 현재 플랫폼에는 외부 완료 결과를 가져와 검증한 뒤 복구하는 전용 API가 없다. DB 상태를 직접 성공으로 바꾸지 않는다.
3. 재실행이 필요하면 **owner**가 사유와 중복 실행 위험 확인을 포함해 재시도한다. API는 `POST /api/projects/:p/jobs/:id/retry`에 `{ "reason": "확인한 상황과 재시도 사유", "acknowledge_duplicate_risk": true }`를 받는다. 실패 작업의 일반 재시도에는 사유만 필요하다.
4. 재시도는 같은 업무 기록·고정 문서/요청을 사용하고 새 시도 횟수와 이력을 남긴다. 흐름 실행에는 비용이 다시 발생할 수 있다. 파이프라인은 입력과 게시 버전에 기반한 동일 idempotency key를 사용하지만 이를 플로우의 중복 방지 보장으로 해석하지 않는다.

파이프라인 idempotency key는 응답 전에 `stage_data.idempotency_key`에 저장한다. 해당 값을 실행 이력 확인에 사용한다. JSONB 저장 과정에서 객체 키 순서가 바뀔 수 있으므로 저장된 문서 JSON을 다시 직렬화해 기존 키를 추정하지 않는다.

## 문서 한계와 확인 사항

- 형식: PDF, DOCX, PPTX, XLSX, UTF-8 TXT/MD. 한 번에 파일 1개, 최대 20 MiB, 추출 단위 최대 200개, 추출 텍스트 최대 100,000자. 제한을 넘으면 임의 절단 없이 실패한다.
- PDF는 표 관계·읽기 순서·글꼴·부등호 정확도를 검증하지 못하므로 추출 결과를 확인 필요로 표시한다. OCR은 없으며 스캔 이미지에만 있는 문구는 추출하지 않는다. 텍스트가 전혀 없으면 `EMPTY_EXTRACTION`으로 실패해도 업로드한 원본은 DB에 남는다.
- Office 문서의 이미지, 복잡한 레이아웃, 일부 보조 텍스트는 경고 대상이다. XLSX 수식을 실행하지 않으며 캐시 값의 최신성도 보장하지 않는다. 암호화 파일은 처리하지 않는다.
- 출처 문자열과 위치를 보존하고, 문서에 적힌 지시는 데이터로 취급한다. Nora 검토에는 준비·검증용 순수 도구만 연결되어 있다. 경고와 지시문 패턴 탐지는 원문 전체의 안전성이나 추출 정확성을 보장하는 기능은 아니다.

## DB 백업과 복구 검증

DB 백업에는 원본 파일, 추출 결과, 질문·결정 근거, 계정 해시, 세션과 활동 기록이 모두 들어 있다. 배포 이미지 백업만으로는 복원할 수 없다. 백업을 접근 제한된 위치에 보관하고 보관 주기·복구 목표·암호화 정책을 정한다. Nora 토큰은 DB 백업과 별도로 비밀 관리 체계에서 복구한다.

로컬 Compose DB를 백업하고 **별도 DB에** 복원하는 예시:

```sh
umask 077
mkdir -p .local/backups
docker compose exec -T db pg_dump -U ains -d ains -Fc > .local/backups/ains.dump
docker compose exec -T db createdb -U ains ains_restore
docker compose exec -T db pg_restore -U ains -d ains_restore --exit-on-error < .local/backups/ains.dump
```

같은 이름의 복원 DB가 있으면 새 이름을 사용한다. 운영 DB를 덮어쓰는 명령이 아니다. Railway에서도 운영 DB와 분리된 복원 대상에서 검증한다. 덤프·복원 도구 버전은 서버와 호환되는 버전을 사용한다.

복원 후 사용자/프로젝트 소속, 문서·버전 수, 현재 기준선, 결정 해시, 활동 기록을 비교한다. 원본 다운로드 바이트의 SHA-256을 `revisions.sha256`과 비교한다. 복원된 세션을 계속 쓰지 않으려면 서비스 연결 전 `sessions`를 비워 재로그인하게 한다.

백업 시점의 `running` 작업은 이미 Nora에서 완료됐을 수 있다. 복원 직후 업스트림 호출부터 재개하지 않는다. 저장된 실행 ID·시각을 확인하고 임대 만료 후 불확실 상태로 분리되는 것을 확인한다. DB 복원은 외부 Nora의 실행 이력이나 과금을 되돌리지 않는다.

### 수행한 로컬 복원 시험

`ains-sism` Docker Compose 개발 DB에서 읽기 전용 반복 읽기 트랜잭션의 스냅샷을 내보내고, 같은 스냅샷으로 custom 형식 백업을 생성했다. 별도 이름의 DB에 복원하여 사용자 2개, 프로젝트 2개, 문서 1개, 버전 2개, 검토 1개, 이벤트 11개의 수가 일치함을 확인했다. 원본·복원본 각각 모든 원본 파일 2개의 SHA-256이 저장된 해시와 일치했고 버전별 해시 목록도 같았다. 임시 복원 DB는 검증 후 삭제했으며 원본 DB는 변경하지 않았다.

백업 파일은 `.local/backups/`에 권한 `600`으로 보관한다. 비밀값과 원문이 없는 시험 결과는 [`platform/backup-verification.json`](../backup-verification.json)에 기록했다. **이는 로컬 개발 DB 시험이다. 운영 Railway DB의 예약 백업 설정이나 운영 복원 검증을 완료했다는 의미가 아니다.**

## 도메인 확장과 저장소 전환

새 프로젝트 생성 API는 `domain_pack: { id, version, glossary }`를 받는다. 검토 생성 시 이 값을 요청에 복사하므로 이후 설정 변화가 과거 검토 의미를 바꾸지 않는다. 새 도메인은 별도 프로젝트에 명시적 버전과 용어집을 넣고 대표 문서로 검증한 후 사용한다. 현재는 기존 프로젝트 도메인 설정 변경 API, 업종별 규칙 플러그인, 요구사항-PR/테스트 연결 편집기가 없다. 기본 검토 생성의 `impact_map`은 빈 배열이다.

원본을 DB에 넣은 MVP는 문서와 메타데이터를 함께 백업하고 권한을 적용하기 쉽다. 문서량이 늘면 DB 용량·백업 시간·메모리 사용이 커지므로 비공개 객체 저장소 전환을 검토한다. 전환 시 업로드 해시, 불변 버전, 프로젝트 접근 검사, 원본 다운로드 API를 유지하고, 복사 후 해시 검증·읽기 전환·복구 검증을 끝낸 뒤 기존 바이트를 정리한다. 공개 객체 URL로 원본을 배포하지 않는다.

추가 기업 SSO/초대·비밀번호 초기화, 작업 완료 조정 API, 외부 영향 맵, OCR, 담당자별 알림, 대규모 파일 저장소는 후속 범위다. 현재 활동 화면은 프로젝트의 최근 100개 이벤트이며 외부 메시지를 자동 발송하지 않는다.

## 2026-09-27 업무 영역·기록 확장

마이그레이션005/006과 에디터·업무 영역 UI를 Railway에 배포했습니다. 배포 ID: `c16903ba-1e9e-48c6-a9ec-a1f3f6bbd274`. 운영 DB를 private SSH 경로로 pg_dump한 뒤 로컬 별도 DB에 복원하여 새 마이그레이션을 적용했습니다. 기존9개 업무 테이블의 원래 열 값을 모두 비교해 보존을 확인했습니다. 임시 SSH키는 폐기했고 복원 검증용 DB도 삭제했습니다. 백업 파일은 `.local/backups/ains-production-before-domains-20260927.dump`(0600)에 보관합니다. 정기 백업 설정과는 별개입니다.

검증: `domain-records-production-smoke.json`, `domain-records-backup-verification.json`, `domain-records-local-ui-verification.json`. 운영 합성 검증 프로젝트는 기존 계정에만 생성했으며 고객의 실제 업무 결정이 아닙니다. 이 배포의 검증 시점에는 신규 Nora 추천이 미발행 상태였으므로 503 응답을 확인했습니다. 해당 기록은 당시의 검증 결과로 보존합니다.

## Nora 분류 추천 v1 발행과 활성화

2026-09-27 Nora AINS에 `ains-record-registration-v1` v1을 발행했다. 단일 OpenAI `gpt-5.4-mini` 에이전트와 `reasoning_effort: low`를 사용한다. 실제 발행 API의 합성 검증은 5/5 통과했고, 검사한 실행 추적에서 도구 호출과 메모리 읽기·쓰기는 없었다. 선언상 도구 목록은 비어 있지만 시스템 차원의 강제 차단은 입증하지 않았다. 결과는 [분류 추천 검증](../../nora/registration/acceptance-results.json)에 기록한다. 앞선 인증 문제는 재인증 후 해소되었다.

Railway 활성화 시 새 토큰을 `NORA_REGISTRATION_TOKEN`으로 주입하고 IaC에 해당 키의 `preserve()`를 유지한다. 비밀값은 CLI 표준 입력 등으로 전달하고 명령 인자·로그·manifest에 넣지 않는다. `scripts/stage-deploy.js`로 준비한 소스에는 발행 manifest와 클라이언트·스키마가 포함되며, 로컬 비밀 파일은 제외된다. manifest는 프로세스에서 캐시하므로 발행 정보 변경 후 재배포해야 한다. 실제 운영 경유 성공 여부는 별도 배포 검증 기록에 남긴다.

운영 확인은 로그인·CSRF·프로젝트 권한을 거쳐 `POST /api/projects/:p/registration-suggestions`를 호출하고, 반환된 추천·trace와 `registration_requests` 이력을 대조한다. 이 요청만으로 문서·리비전·기준선이 생성되거나 변경되어서는 안 된다. UI의 **등록 위치 추천**, **추천 적용**, **등록하고 분석 시작**은 분리된 사용자 동작이다. 파일 모드는 본문을 보내지 않으므로 파일명·제목만으로 기존 문서의 개정이라고 확정할 수 없고 신뢰도 0.5 이하의 새 기록만 제안한다.

추천 실행은 같은 사용자 동시 1건, 프로세스 동시 4건, 프로젝트 시간당 60건으로 제한한다. 서버 대기 시간은 45초이며 전송·응답 본문 수신 중 취소나 타임아웃, HTTP 5xx는 `uncertain`으로 기록한다. 자동 재호출하지 않으며 Nora 실행 이력을 확인한 뒤 새 추천을 요청하거나 수동으로 등록 위치를 선택한다. 추천 이력은 일반 작업 대기열과 별개이므로 `/jobs/:id/retry`의 대상이 아니다.

운영 연결 완료: 배포 `c280fbaf-ae73-44a3-a6f9-e69bc45377c5`가 SUCCESS이며 전체 Node 테스트 291개와 프런트엔드 빌드가 통과했다. `REGISTRATION_ALLOW_LIVE_NORA=1 node scripts/smoke-registration-live.js`로 기존 합성 검증 프로젝트에서 리비전·Slack 대화·파일명만 있는 입력 3건을 확인했다. 문서·기준선 불변과 감사 이벤트 저장도 확인했다. 실제 화면에서는 전체 영역 추천 → 정산/기존 문서 선택 → 명시적 추천 적용 → 취소를 검증했다. 결과: `registration-production-smoke.json`, `registration-production-ui-verification.json`.

## 대화 수집·검토함 운영

상세 설정과 API는 [CHANNEL_CONNECTORS.md](CHANNEL_CONNECTORS.md)에 있다. `NORA_CHANNEL_TRIAGE_TOKEN`을 서비스 변수로 주입하고 발행 manifest를 포함해 배포한다. 앱과 함께 실행되는 별도 대화 처리기는 `channel_inbox`를 읽으며, 기존 문서 작업 큐와 분리된 상태·120초 임대를 사용한다. 분석 중 종료·시간 초과는 자동 재실행하지 않고 `uncertain`으로 남긴다. 토큰이나 발행 정보가 없으면 `TRIAGE_UNAVAILABLE`과 함께 사람이 원문을 검토할 수 있다.

현재 출처 설정의 일시 정지는 수동 수신을 막는다. 외부 계정이나 실제 채널 watch를 연결하는 설정은 아직 없다. 같은 배치 재전송은 기존 결과를 반환하며, 수집한 원문 수정·삭제는 새 이벤트로 보존한다. 등록 전 원문이 바뀌면 등록을 차단하고, 등록 후 변경이면 검토함에 출처 변경을 표시한다. 일반 작업 `/jobs/:id/retry`를 대화 분석 재시도 수단으로 사용하지 않는다. 현재 대화 분석 재실행 API는 없다.

007/008 적용 전 Railway 운영 DB를 private custom dump로 백업하고 별도 로컬 DB에 복원했다. 마이그레이션 이후 기존 15개 테이블의 전체 행 해시가 일치했고 새 테이블 4개를 확인했다. 백업용 임시 SSH 키는 폐기했고 복원 DB는 제거했다. [검증 결과](../channel-backup-verification.json)를 참고한다. 이 검증은 운영 예약 백업을 설정했다는 의미는 아니다.

합성 운영 점검은 `CHANNEL_SMOKE_ALLOW_LIVE_NORA=1 node scripts/smoke-channels-live.js`로 수행한다. private `.local/production-access.json`을 사용하며 새 합성 프로젝트에서만 수집·사람 검토·기록 저장·원문 변경 표시를 검사한다. 실제 채널의 메시지를 읽거나 보내지 않는다.

## 구현 계획과 로컬 코드 실행 운영

사용 절차는 [IMPLEMENTATION_START.md](IMPLEMENTATION_START.md)를 따른다. 프로젝트 목표·공개 GitHub 저장소·실제 기준 브랜치를 설정하고 저장소 확인을 완료한 뒤, 발행된 기획 기준선으로 Nora 계획을 만든다. 기준선이 없는 `ready` 문서는 바로 실행할 수 없다. 사람의 계획 승인과 코드 실행 요청은 별도 단계다. 설정·기획 기준선·저장소 기준 커밋이 바뀌면 기존 계획의 승인을 재사용하지 않고 새 계획을 검토한다. 빈 저장소는 실제 브랜치·커밋이 생기기 전까지 실행할 수 없다.

Railway에는 `NORA_IMPLEMENTATION_TOKEN`과 발행 [manifest](../../nora/implementation-plan/manifest.json)를 배포한다. 구현 계획 worker는 앱 프로세스에서 별도로 실행되며 `implementation_plans`를 처리한다. 토큰/발행 정보가 없으면 `IMPLEMENTATION_UNAVAILABLE`로 실패하고 AI 결과를 꾸미지 않는다. 모델 호출 전 입력 해시와 발행 버전을 감사 이력에 저장한다. 최대 5개 기획·40,000자, 새 계획 프로젝트당 시간당 20개, Nora 제한 45초, worker 임대 120초다. 마이그레이션009/010은 설정·계획·실행 요청·실행 연결 자격 테이블을 추가한다.

실제 코드 수정은 Railway 웹 프로세스와 분리된 로컬 실행기가 맡는다. 관리자가 내려받는 연결 파일은 **실행 요청 1개·2시간**에 한정되며 토큰은 DB에 해시로 저장한다. 재발급은 이전 연결 파일을 취소하며 이미 시작한 요청은 다시 시작할 수 없다. Node.js 22 이상·Git·로그인된 Codex CLI가 필요하다. 연결 파일을 0600으로 보관하고 채팅·로그·저장소에 올리지 않는다. 실행기는 임시 checkout의 원격을 제거하고 승인한 기준 commit을 대조한 뒤 코드·테스트 변경안을 만든다. `patch_ready`는 패치 저장 완료이며 원격 push·PR·병합·배포 완료가 아니다.

| 중단 위치 | 확인 및 복구 |
| --- | --- |
| Nora 계획 호출 중 서버 재시작·임대 만료 | `IMPLEMENTATION_LEASE_EXPIRED`/`uncertain`과 저장된 의도·trace를 확인한다. 자동 재호출하지 않는다. |
| 로컬 실행기 중단·heartbeat 실패 | 실행 임대 3분, heartbeat 30초다. 만료 시 `RUNNER_LEASE_EXPIRED`/`uncertain`으로 남는다. 같은 요청을 다시 실행하지 않는다. |
| 완료 전송 응답 유실 | private 임시 디렉터리의 `result.json`·`completion.json`과 플랫폼 상태·패치 해시를 먼저 대조한다. 원래 결과를 보존하고 새 코드 실행으로 대체하지 않는다. |
| 계획의 차단 질문 또는 오래된 입력 | 목표나 기획 기준선을 보완하고 현재 저장소를 확인한 뒤 새 계획을 요청한다. 질문을 임의로 지우거나 DB를 승인 상태로 덮어쓰지 않는다. |

구현 계획·실행 요청은 기존 `/jobs/:id/retry`의 대상이 아니다. 결과 미확인 상태에는 자동 재시도나 자동 성공 복구 API가 없다. 외부 실행 사실과 보존된 결과를 조사한 후 필요하면 새 계획·승인·실행 요청을 만든다.

운영 전체 흐름은 `IMPLEMENTATION_SMOKE_ALLOW_LIVE=1 node scripts/smoke-implementation-live.js`로 명시적으로 점검한다. private `.local/production-access.json`으로 로그인하고 새 합성 프로젝트에서만 기준선·계획·승인·실행 요청을 생성한다. 공개 예제 저장소를 읽어 실제 Codex가 임시 checkout에 함수와 테스트를 추가하며 원격 저장소를 변경하지 않는다. 연결 파일과 실행 로그는 `.local/implementation-smoke-*`에 0600으로 남기며 기존 파일을 덮어쓰거나 자동 재실행하지 않는다. 비밀값 없는 결과는 `platform/implementation-production-smoke.json`에 기록한다. Nora 7건 수용 검증은 [별도 기록](../../nora/implementation-plan/acceptance-results.json)이며 운영 전체 경로 성공과 구분한다.
