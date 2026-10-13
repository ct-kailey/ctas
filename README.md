# AINS · 프로젝트 Context와 업무 실행

문서·대화·결정 근거를 Main Context에 연결하고, Nora 분석과 사람의 검토를 거쳐 작업 계획·범위·실행·검수·지식 재사용으로 이어지는 SI/SM 플랫폼입니다.

`ctas`의 `vara` 화면 구성과 알림 표현을 기존 AINS의 전체 업무 흐름 안에 반영합니다. 로그인·프로젝트·자료·계약·Main Context·AI 작업은 하나의 작업실에서 처리하며, 기존 PostgreSQL과 API를 그대로 사용합니다. 별도 예시 앱을 운영 서비스로 배포하지 않습니다.

## 화면과 데이터 범위

| 경로 | 화면 | 동작 범위 |
| --- | --- | --- |
| `/`, `/?tab=home` | 프로젝트 업무 홈 | 기존 계정과 프로젝트의 실제 현황, 업무 단계별 진입 |
| `/?tab=alerts` | 알림함 | 프로젝트의 검토·대기·처리 상태 확인 |
| `/?project=<ID>&tab=<탭>` | 프로젝트 업무 화면 | 계약·기획, 문서, Context, 작업·실행·검수 등 기존 기능 |
| `/preview` | 전체 워크플로우 안내 | 준비된 예시 데이터로 업무 흐름 체험 |
| `/ctds` | 화면 설정 | 해당 브라우저의 테마 설정 |

업무 홈은 기존 `/api/projects/:p/overview`의 실제 자료·활동과 `/api/projects/:p/attention`의 우선순위 알림을 읽습니다. 자료 등록·계약 작성·검토·AI 구현은 같은 프로젝트와 로그인 세션 안에서 이어집니다. 이 연결에 DB 스키마 변경이나 기존 자료 재등록은 필요하지 않습니다. 조회 실패를 예시 데이터로 대체하지 않습니다.

이전 `/dashboard/` 북마크는 `/?tab=home`으로, `/dashboard/alerts/`는 `/?tab=alerts`로 이동합니다. 명시된 `project` 쿼리는 유지합니다. 예시 프로젝트 경로는 실제 프로젝트 ID로 바꾸지 않고 홈으로 이동하며, 정의되지 않은 대시보드 경로와 예전 Next 자산은 404로 응답합니다.

`/preview`는 실제 자료 저장·메시지 발송·AI 실행을 하지 않는 업무 안내입니다. 작업실 링크는 `?project=...&tab=...`으로 프로젝트와 업무 화면을 유지합니다. Google 로그인 전의 목적지는 같은 브라우저 탭에 최대 15분간 보관해 한 번 복구합니다. 접근 권한이 없는 프로젝트는 다른 프로젝트로 자동 전환하지 않습니다.

## 로컬 실행

Node 22.12 이상, Python 3.10 이상, Docker가 필요합니다.

```sh
npm ci
docker compose -p ains-sism up -d db
cp .env.example .env
python3 -m venv nora/adapter/.venv
nora/adapter/.venv/bin/pip install -r nora/adapter/requirements.txt
# .env에 별도 관리자 비밀번호, PYTHON_BIN, 필요한 Nora 토큰을 설정합니다.
npm run build
npm run dev
```

`http://127.0.0.1:3100/`에서 통합 작업실을 확인합니다. `npm run build`는 Vite 앱 하나를 `dist/`에 빌드합니다. 보존된 `ains-dashboard/`의 Next 의존성 설치나 빌드는 필요하지 않습니다.

개발 중에는 API용 `npm run dev`, Vite용 `npm run dev:web`를 실행합니다. Vite의 5173 포트는 `/api`, `/healthz`, 이전 `/dashboard` 호환 경로를 3100의 기존 서버로 전달합니다.

## 검증

```sh
npm run check:ctds
PYTHON_BIN=nora/adapter/.venv/bin/python TEST_DATABASE_URL=postgresql://ains:local-development-only@127.0.0.1:55432/ains node --test --test-concurrency=2 tests/*.test.js platform/tests/*.test.js
node nora/pipeline/test-pipeline.cjs
nora/adapter/.venv/bin/python -m unittest discover -s nora/adapter -p 'test_*.py'
npm run build
```

DB 테스트에는 로컬 테스트 DB만 지정합니다. 각 테스트가 임시 스키마를 생성·정리하며, `TEST_DATABASE_URL`이 없으면 DB 검증은 생략됩니다. 고객 사례 파일 없이 합성 fixture로 테스트할 수 있습니다. 실제 Nora 호출은 별도 명시적 실행 스크립트와 연결 설정이 필요합니다.

## 구성

- `platform/web/`: React/Vite 작업실, 워크플로우 프리뷰와 CTDS 테마
- `ains-dashboard/`: vara 원본과 이전 통합 시도의 Next 소스 보존. 운영 빌드·배포에서는 제외
- `platform/server/`: Express API, 인증·권한, 작업자, DB 마이그레이션 001–026
- `nora/`: 문서 추출, AI 입력·출력 스키마, 프롬프트, 클라이언트와 검증 fixture
- `scripts/`: 빌드, 사용자 생성, 로컬 실행기, 수집 도구와 배포 준비
- `AINS_대시보드기획.md`, `AINS_아이데이션정리.md`, `AINS_알림기준.md`: vara 기획 원본

문서 원본과 불변 개정은 PostgreSQL에 보관합니다. 요구사항·결정·작업·실행 결과·검수·PR은 원장으로 연결하며, AI 제안과 사람의 승인 상태를 구분합니다. 고객 메시지 발송, 기준선 발행, GitHub PR 발행은 각각 명시적 검토 절차를 거칩니다.

## Railway

루트 `Dockerfile`로 웹/API/작업자를 함께 배포하고 별도 PostgreSQL을 연결합니다. 업무 홈과 알림도 같은 Vite 앱에 포함되며 별도 Next 앱은 제공하지 않습니다. `.railway/railway.ts`는 기존 AINS 환경의 앱 서비스만 관리하는 부분 구성입니다. DB·볼륨을 전체 적용 대상으로 확대하지 않습니다.

`DATABASE_URL`, HTTPS `APP_ORIGIN`, Nora 토큰과 초기 관리자 설정 등은 Railway 서비스 변수에 주입합니다. 실제 환경 파일·토큰·고객 원문·운영 검증 결과는 저장소에 포함하지 않습니다. 자세한 변수와 복구 절차는 [운영 안내](platform/docs/OPERATIONS.md)를 참고하세요.

```sh
# 로컬 원문과 비밀 파일을 제외한 빌드 소스를 준비합니다.
node scripts/stage-deploy.js
# 출력된 경로를 확인한 뒤 기존 앱 서비스에 배포합니다.
railway up /출력된/경로 --path-as-root --service ains-workspace
```

`/healthz`는 DB 연결을 검사합니다. GitHub push와 Railway 배포 완료는 별개이며, 배포 후에는 화면·API·Nora 연결을 따로 확인해야 합니다.

## 기능별 안내

- [대시보드 통합 구조와 검증](docs/vara-integration.md)
- [전체 워크플로우 프리뷰](docs/workflow-preview.md)
- [계약과 문서 작성](platform/docs/COMMERCIAL_WORKFLOW.md)
- [Main Context](platform/MAIN_CONTEXT.md)
- [대화 수집과 업무 연결](platform/CHANNEL_WORKFLOW.md)
- [문서 등록에서 AI 구현까지](platform/docs/IMPLEMENTATION_START.md)
- [작업 실행과 검수](platform/WORK_EXECUTION.md)
- [질문과 고객 응답 대기](platform/QUESTIONS.md)
- [Google 로그인](platform/docs/GOOGLE_LOGIN.md)
- [Nora 상세 설계](nora/DESIGN.md)
