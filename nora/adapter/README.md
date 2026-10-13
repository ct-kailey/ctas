# 원본 보존 및 문서 추출 어댑터

`extract_document.py`는 로컬 원본을 SHA256 주소로 보관하고 Nora 문서 파이프라인에 입력할 `Document` JSON을 만듭니다. Nora 호출, 업로드, 승인, 배포는 수행하지 않습니다. 문서 속 지시문은 신뢰할 수 없는 원문 데이터입니다.

## 실행

아래 명령의 프로젝트·문서·개정 ID와 파일 경로를 지정합니다. ID는 영문·숫자로 시작하는 1~128자의 영문·숫자·`.`·`_`·`:`·`-` 문자열입니다.

```sh
PYTHON_ADAPTER=nora/adapter/.venv/bin/python
"$PYTHON_ADAPTER" nora/adapter/extract_document.py input.pdf \
  --project-id AINS --document-id policy-001 --revision-id r1 \
  --archive-dir nora/adapter/.local/archive \
  --output nora/adapter/.local/policy-001-r1.json
```

다른 환경에서는 Python 3.10 이상과 `requirements.txt`의 의존성을 설치합니다. 현재 구현은 bundled Python 3.12와 고정된 4개 라이브러리로 검증했습니다.

성공 시 JSON은 지정한 출력 파일에 저장하며 stdout에는 해시·세그먼트 수·완전성만 기록합니다. JSON과 stdout에 로컬 파일 경로는 넣지 않습니다. 실패 시 stderr에 `code`와 `message`를 포함한 JSON을 출력하고 종료 코드 2를 반환합니다. 저장소 실패는 종료 코드 3입니다. 인수 누락 등 argparse 오류는 표준 CLI 사용법과 종료 코드 2를 반환합니다.

## 계약과 보존

- 입력 파일은 최대 20 MiB입니다. 결과는 최대 200개 세그먼트, 텍스트 합계 최대 100,000 Unicode 문자입니다. 초과 시 예외가 발생하며 일부만 잘라서 내보내지 않습니다.
- `schema_version`은 `1.0`이고 프로젝트·문서·개정 ID, 원본 파일명·MIME·SHA256, 원문 세그먼트와 위치, 추출 상태를 포함합니다. `requirement_key`는 자동 추정하지 않고 `null`로 둡니다.
- 원문 텍스트의 숫자, 비교 연산자, 단위, 줄바꿈과 공백을 정규화하지 않습니다. 보관한 원본 바이트와 추출한 텍스트가 같은 수준의 정확도를 뜻하지는 않습니다. 특히 PDF 글리프·표·읽기 순서는 검토 대상입니다.
- 원본은 `<archive-dir>/sha256/<해시 앞 2자>/<전체 해시>`에 확장자 없는 바이트 파일로 저장합니다. 쓰기 권한을 제거하고 재실행마다 SHA256을 확인합니다. 기존 blob은 교체하지 않습니다.
- `registry.sqlite3`에 `(project_id, document_id, revision_id) → sha256`을 저장합니다. 같은 ID에 같은 원본을 넣는 재시도는 허용하고 다른 원본은 `REVISION_CONFLICT`로 거절합니다. 변경한 파일은 새 `revision_id`가 필요합니다. 동시 실행은 SQLite 트랜잭션으로 직렬화합니다.
- 크기와 지원 확장자를 확인한 뒤 원본 보관·등록을 먼저 수행합니다. 파싱 실패나 OCR 필요, 결과 크기 초과가 나더라도 보관한 원본과 개정 레코드는 남깁니다. 같은 개정을 수정본으로 바꾸지 마세요.
- 결과 파일은 임시 파일 후 원자적 교체로 저장합니다. 원본 자체, 원본의 hard link, archive 아래의 경로는 출력으로 사용할 수 없습니다. 실패 시 기존 결과를 덮어쓰지 않습니다.
- 이 불변성은 이 CLI의 쓰기 규칙입니다. OS 관리자에 대한 WORM 보장은 아닙니다. 운영에서는 객체 저장소의 버전 보존·접근 제어와 서버 DB 고유 키를 적용해야 합니다.

## 형식별 범위

| 형식 | 세그먼트와 위치 | 상태와 제한 |
|---|---|---|
| PDF | 페이지별 원문, `page N` | 텍스트만 추출합니다. 이미지 OCR·표 관계·읽기 순서·글리프 정확도는 미검증이므로 항상 `complete: false`, `needs_review`입니다. |
| DOCX | 본문 문단과 표 셀의 문단, 문단/표·행·열 번호 | 본문과 표 셀을 순서대로 추출합니다. 표 레이아웃, 이미지, 머리말·꼬리말·각주·주석, 변경 추적·텍스트박스·수식이 있으면 불완전으로 표시합니다. |
| PPTX | 슬라이드별 텍스트와 표 셀, `slide N` | 그룹 내부 텍스트도 추출합니다. 도형 배치·마스터·애니메이션·노트·시각 자료를 완전히 복원하지 않으므로 항상 검토 상태입니다. |
| XLSX | 비어 있지 않은 셀별 JSON 텍스트, `시트명!셀주소` | 원시값·자료형·number format을 보존합니다. 수식과 캐시값을 별도 필드로 내보냅니다. 캐시가 있어도 `unverified`, 없으면 `missing`이며 수식을 계산하지 않습니다. |
| TXT / MD | UTF-8 원문 전체, `full text` | UTF-8 디코딩만 수행합니다. 잘못된 인코딩은 교체 문자로 변환하지 않고 거절합니다. BOM·줄바꿈도 원문대로 유지합니다. |

전체에서 텍스트를 하나도 추출하지 못한 문서는 `EMPTY_EXTRACTION`으로 중단합니다. 일부 PDF 페이지나 슬라이드가 비어 있으면 그 위치를 `EMPTY_TEXT` 경고에 명시하고 나머지 텍스트를 반환하며 `complete: false`로 표시합니다. 빈 원문을 허구의 텍스트로 채우거나 누락을 감추지 않습니다. OCR이나 수동 추출 후 별도 개정과 출처를 만들 필요가 있습니다. 이미지와 텍스트가 함께 있는 문서도 확보한 텍스트를 반환하되 `complete: false`와 검토 경고를 붙입니다.

XLSX는 숨겨진 시트의 셀도 포함하며 경고로 명시합니다. 캐시값은 신뢰할 수 있는 계산 결과로 사용하면 안 됩니다. 병합 셀·테이블 관계·표시 서식은 원본 좌표와 함께 확인해야 합니다. 차트·이미지·주석·매크로는 실행하거나 분석하지 않습니다. OOXML 압축 해제 크기 100 MiB, ZIP 구성 파일 10,000개, 시트의 선언된 셀 영역 1,000,000개 초과를 거절합니다.

모든 문서에 목데이터 여부를 판정하지 못한다는 경고를 포함합니다. 완전성은 문서 내용을 요구사항으로 확정하거나 고객 승인으로 해석해도 된다는 뜻이 아닙니다.

## 오류 처리

| 오류 | 후속 처리 |
|---|---|
| `FILE_LIMIT`, `SEGMENT_LIMIT`, `TEXT_LIMIT`, `WARNING_LIMIT`, `SHEET_DIMENSION_LIMIT`, `ARCHIVE_LIMIT` | 경계를 명시해 원본을 분리하고 새 문서/개정 ID로 재시도 |
| `EMPTY_EXTRACTION` | OCR 또는 수동 검토 필요; 자동 비교 차단 |
| `REVISION_CONFLICT` | 기존 개정 유지, 새 개정 ID 사용 |
| `ARCHIVE_INTEGRITY` | 원본 저장소 복구·조사 전 중단 |
| `INVALID_UTF8`, `INVALID_OFFICE_FILE`, `PDF_EXTRACTION_FAILED`, `PARSE_FAILED` | 원본 형식·무결성 확인 후 정상 파일을 새 개정으로 등록 |
| `ENCRYPTED_DOCUMENT` | 정당하게 복호화한 별도 원본 제공 |
| `DEPENDENCY_MISSING`, `STORAGE_FAILED`, `SOURCE_READ_FAILED` | 실행 환경·권한·가용 공간 확인 후 동일 입력 재시도 |
| `INVALID_IDENTIFIER`, `UNSUPPORTED_TYPE`, `UNSAFE_OUTPUT` | 호출 인수를 수정 |

## 검증

```sh
PYTHON_ADAPTER=nora/adapter/.venv/bin/python
"$PYTHON_ADAPTER" -m unittest discover -s nora/adapter -p 'test_*.py' -v
```

단위 테스트는 원문 수치·부등호·단위·지시문 보존, 해시 무결성, 개정 충돌, 중복 재시도, 크기 경계, 빈/OCR 문서 차단, 수식/캐시 구분, 위치 추적, 원본/하드링크 덮어쓰기 차단, 실패 시 기존 결과 보존을 확인합니다. 테스트는 임시 디렉터리에 합성 문서를 생성하고 종료 시 제거합니다.
