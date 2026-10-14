# CTDS 적용 점검 — 2026-10-14

운영 Vite 작업실과 `/preview`에 실제 CTDS 0.3.2 컴포넌트를 적용했다. 보존용 `ains-dashboard`는 운영 빌드 대상이 아니므로 이번 검사 범위에서 제외했다.

## 확인한 문제와 수정

| 기존 상태 | 반영 내용 |
| --- | --- |
| 토큰 색상만 적용한 native select | 실제 CTDS Select 트리거·메뉴·옵션으로 변경 |
| 버튼을 나열한 수동 탭 | CTDS Tabs 선택·키보드 이동·패널 연결 |
| 개별 native 입력·버튼·접기 요소 | CTDS Input·Textarea·Checkbox·Radio·Button·Disclosure |
| 브라우저 confirm 및 직접 만든 토스트 | CTDS Modal 확인과 Toast Provider·Viewport |
| 개별 안내/경고 박스 | 실제 CTDS Callout 기반 Notice |
| 기존 CSS가 CTDS 컴포넌트 외형을 덮음 | 배치를 보존하고 이전 시각 스타일에서 CTDS 요소 제외 |
| 토큰 검사만 수행 | JSX AST 검사에 raw 컨트롤·수동 탭·notice·confirm·버튼형 링크 금지 추가 |

대시보드의 지표·업무 링크·프로필·경로·표도 MetricCard, ListItem, Avatar, Breadcrumb, TableHeader/Row/Cell 조합으로 연결한다. 카키 테마, 업무 API, 권한, 원본 기록은 유지한다.

## 검증

- CTDS 토큰 및 실제 컴포넌트 검사 통과. 현재 앱 최상위 JSX 33개 검사, 일반 HTML 컨트롤 예외는 검토한 어댑터 내부 및 실제 asChild 슬롯으로 제한.
- 잘못된 raw 컨트롤/수동 notice/asChild 위장 사례가 검사에서 실패하고 올바른 CTDS asChild는 허용되는지 임시 probe 검증.
- 전체 Node/Postgres 회귀 테스트: 754 passed, 0 failed, 0 skipped.
- 브라우저 폼 계약: 24/24. ref, label, 필수 선택·빈 값, native change/FormData 한 번 전달, controlled/uncontrolled reset, disabled fieldset, 접힌 입력 보존, 파일 데이터, 버튼 높이·submit 확인.
- 합성 프로젝트 브라우저: 로그인, 프로젝트 선택, 모달 안 드롭다운, 미저장 확인 Escape 취소와 입력·포커스 보존, 문서 본문/표의 새 버전 저장, CTDS 토스트 확인.
- 프리뷰: 390px 화면에서 페이지 수평 넘침 없음, 13주 탭 가로 스크롤 및 마지막 탭 선택 확인.
- 프로덕션 웹 빌드 통과. 개발 fixture는 Vite 빌드 진입점에 포함하지 않음.

## 의도한 경계

폼 전송용 숨긴 native select/input, CTDS 내부 HTML, 브라우저 beforeunload, OS 파일·날짜 선택기는 플랫폼 동작을 유지한다. 도메인 콘텐츠와 페이지 레이아웃은 CTDS 프리미티브를 조합한다. 컴포넌트 검사는 시각 품질·모든 조합의 접근성을 자동으로 보장하지 않으므로 새 화면에는 브라우저 확인도 수행한다.
