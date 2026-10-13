# AINS Railway 설정

`railway.ts`는 `ains-workspace` 서비스만 관리하는 named partial이다. AINS production 프로젝트·환경 ID가 다르면 실행을 거부한다. PostgreSQL과 볼륨은 이 파일의 관리 범위에 포함하지 않는다. 환경 변수는 현재 Railway 값을 `preserve()`로 유지하며 비밀값을 파일에 쓰지 않는다.

SDK는 이 디렉터리에서 고정 버전으로 설치한다. 앱의 Node 의존성과 별개다.

```sh
npm ci --prefix .railway
npm exec --yes --package=@railway/cli@5.62.1 -- railway config plan --file .railway/railway.ts
```

확인한 계획은 서비스의 Docker 빌드 설정과 배포 설정 2건, 추가·삭제 0건이다. 배포 설정은 `/healthz`, 120초 검사, 복제본 1개, 실패 시 재시작 최대 5회, 종료 유예 300초다. 적용 전 새 계획에서 대상 서비스와 설정만 변경되는지 확인한다.

적용 후 재계획은 변경 없음으로 확인했다. 복제본은 `replicas: { "asia-southeast1-eqsg3a": 1 }`로 지역별 개수를 명시한다. Railway가 저장·가져오기 시 제거하는 전역 `deploy.numReplicas`는 중복 선언하지 않는다. 재시작 유형은 공식 기본값인 `ON_FAILURE`를 사용하고 최대 횟수만 5로 명시했다. 실제 배포 manifest에서도 `ON_FAILURE`, 최대 5회, 지역별 1개를 확인했다. 기본값을 명시적으로 다시 넣으면 CLI가 계속 변경으로 표시할 수 있다. [기본 재시작 정책](https://docs.railway.com/deployments/restart-policy).

```sh
npm exec --yes --package=@railway/cli@5.62.1 -- railway config apply --file .railway/railway.ts --yes
npm exec --yes --package=@railway/cli@5.62.1 -- railway config plan --file .railway/railway.ts
npm exec --yes --package=@railway/cli@5.62.1 -- railway config partials list
```

파괴적 변경 옵션은 사용하지 않는다. `partial` 선언을 없애거나 전체 프로젝트 `config pull` 결과로 이 파일을 덮어쓰면 관리 범위가 달라지므로, PostgreSQL을 포함한 다른 리소스를 삭제할 수 있는 전체 프로젝트 계획을 적용하지 않는다. 환경 변수를 새로 추가했다면 다음 계획 전에 해당 키의 `preserve()` 선언도 추가한다.

원격 앱 서비스에 IaC 설정 적용을 완료했다. 적용 기록과 후속 재계획 결과는 `platform/railway-iac-plan.json` 및 최종 배포 검증 기록에서 확인한다. 소스 배포는 별도의 `railway up --service ains-workspace` 작업이다. 서비스에 Config File 경로가 실제 설정되어 있다면 이중 관리가 거부되므로 해당 앱 서비스의 경로만 해제해야 한다. `config migrate --apply --force`는 손으로 보완한 builder·restart·drain·변수 보존 설정을 덮어쓸 수 있어 그대로 실행하지 않는다.

Railway는 기존 `railway.json`/`railway.toml` 읽기를 2026-12-01에 종료한다고 안내한다. IaC는 배포 파일을 올리는 것만으로 적용되지 않고 CLI plan/apply를 통해 적용한다. [공식 이전 안내](https://docs.railway.com/infrastructure-as-code#migrating-from-config-as-code), [IaC 설정 레퍼런스](https://docs.railway.com/infrastructure-as-code/reference).
