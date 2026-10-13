# AINS · 프로젝트 Context와 업무 실행

문서·대화·결정 근거를 Main Context에 연결하고, Nora 분석과 사람의 검토를 거쳐 작업 계획·범위·실행·검수·지식 재사용으로 이어지는 SI/SM 플랫폼입니다.

`ctas`의 `vara` 대시보드와 기존 AINS 작업실을 통합했습니다. `/dashboard/`는 기존 계정과 프로젝트의 실제 업무 현황을 조회하고, 선택한 프로젝트의 작업실로 연결합니다. 기존 API·DB·워크플로우 프리뷰를 유지하며, vara의 예시 화면은 `/dashboard/example/`에서 별도로 체험합니다.

## 화면과 데이터 범위

| 경로 | 화면 | 동작 범위 |
| --- | --- | --- |
| `/` | 기존 AINS 작업실 | 로그인과 프로젝트 권한 적용, PostgreSQL·Nora·설정한 커넥터 사용 |
| `/preview` | 8단계 전체 워크플로우 | 프로젝트 준비부터 AI 실행·검수·지식 재사용까지 예시 체험 |
| `/dashboard/` | 실제 업무 대시보드 | 기존 로그인·프로젝트 권한으로 문서·Context·검토·작업·질문·활동 조회, 같은 프로젝트의 업무로 이동 |
| `/dashboard/example/` | vara 예시 대시보드 | 예시 알림함·자료 넣기·프로젝트 상세·설정 체험 |
| `/ctds` | 기존 작업실 화면 설정 | 해당 브라우저의 테마 설정 |

실제 대시보드는 `GET /api/projects/:p/dashboard`를 통해 기존 PostgreSQL 원장의 요약을 읽습니다. 전체 개수와 항목별 최근 6개를 표시하며, 자료 등록·계약 문서 작성·검토·AI 구현 등은 같은 프로젝트가 선택된 작업실에서 이어집니다. 이 연결에 DB 스키마 변경이나 기존 자료 재등록은 필요하지 않습니다.

`/preview`와 `/dashboard/example/`에서 이어지는 예시 화면은 준비된 데이터와 브라우저 메모리로 동작합니다. 실제 메일 발송·Gmail 동기화·자료 저장·AI 실행을 하지 않으며, 새로고침하면 예시 업무 상태가 초기화됩니다. 실제 대시보드의 조회 실패를 예시 데이터로 대신 표시하지 않습니다.

작업실 링크는 `?project=...&tab=...`으로 프로젝트와 업무 화면을 유지합니다. Google 로그인 전의 목적지는 같은 브라우저 탭에 최대 15분간 보관해 한 번 복구합니다. 접근 권한이 없는 프로젝트는 다른 프로젝트로 자동 전환하지 않습니다.

## 로컬 실행

Node 22.12 이상, Python 3.10 이상, Docker가 필요합니다.

```sh
npm ci
npm ci --prefix ains-dashboard
docker compose -p ains-sism up -d db
cp .env.example .env
python3 -m venv nora/adapter/.venv
nora/adapter/.venv/bin/pip install -r nora/adapter/requirements.txt
# .env에 별도 관리자 비밀번호, PYTHON_BIN, 필요한 Nora 토큰을 설정합니다.
npm run build
npm run dev
```

`http://127.0.0.1:3100/`에서 작업실·실제 대시보드·예시 화면을 함께 확인합니다. `npm run build`는 Vite 작업실과 Next.js 정적 대시보드를 빌드해 `dist/`에 모읍니다. Next.js 서버를 운영에서 추가 실행하지 않습니다.

개발 중에는 API용 `npm run dev`, Vite용 `npm run dev:web`, 대시보드용 `npm run dev:dashboard`를 각각 실행합니다. Vite의 5173 포트는 `/api`를 3100, `/dashboard`를 3001로 전달합니다. 작업실만 빌드할 때는 `npm run build:workspace`를 사용합니다.

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
- `ains-dashboard/`: 실제 업무 요약과 vara 예시 화면을 제공하는 Next.js 대시보드, `/dashboard` 정적 내보내기
- `platform/server/`: Express API, 인증·권한, 작업자, DB 마이그레이션 001–026
- `nora/`: 문서 추출, AI 입력·출력 스키마, 프롬프트, 클라이언트와 검증 fixture
- `scripts/`: 빌드, 사용자 생성, 로컬 실행기, 수집 도구와 배포 준비
- `AINS_대시보드기획.md`, `AINS_아이데이션정리.md`, `AINS_알림기준.md`: vara 기획 원본

문서 원본과 불변 개정은 PostgreSQL에 보관합니다. 요구사항·결정·작업·실행 결과·검수·PR은 원장으로 연결하며, AI 제안과 사람의 승인 상태를 구분합니다. 고객 메시지 발송, 기준선 발행, GitHub PR 발행은 각각 명시적 검토 절차를 거칩니다.

## Railway

루트 `Dockerfile`로 웹/API/작업자를 함께 배포하고 별도 PostgreSQL을 연결합니다. 대시보드도 동일 이미지의 정적 파일로 제공됩니다. `.railway/railway.ts`는 기존 AINS 환경의 앱 서비스만 관리하는 부분 구성입니다. DB·볼륨을 전체 적용 대상으로 확대하지 않습니다.

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
