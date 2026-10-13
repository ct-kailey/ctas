# AINS 화면 스타일 적용

기준: CTDS 0.2.5, Spare / light / calm / hue 145 / standard / default / calm / ko / Lucide.

`platform/web/src/styles.css`의 기존 화면 구조와 반응형 분기점을 유지하면서 색상·간격·서체·모서리·동작을 CTDS 토큰으로 교체했다. 오래된 `--ink`, `--line` 등의 별칭은 공식 의미 토큰을 참조한다. `--muted`는 CTDS 표면색과 이름이 충돌하므로 AINS 본문에서는 `--fg-muted`를 사용한다.

- 콘텐츠 글자 크기는 `--text-sm`, 보조 표기는 최소 `--text-2xs`를 기준으로 한다.
- 섹션·폼·리스트 간격은 `--space-*`, 모서리는 `--radius-*`, 포커스는 `--ring-*`, 동작은 `--transition-*`를 사용한다.
- 상태 의미는 `--success`, `--warning`, `--destructive`, `--info` 및 각 subtle/border 토큰에 매핑한다.
- 장식용 배경 원, 맥동, 페이지 진입 애니메이션을 제거했다. 정보 안내는 가능한 한 인라인 표기로 정리했다.
- 공통 Button/Badge/EmptyState의 외형은 공식 CTDS 컴포넌트에 맡긴다. 기존 클래스는 레이아웃만 유지하고, 이전 외형 규칙은 `:not([data-ctds])`로 제한한다.
- FormField가 변환한 내부 컨트롤의 `data-ctds-control` 속성으로 기존 input/textarea 규칙을 제외한다. Native select/파일/체크박스는 의미와 접근성 동작을 유지한다.
- Radix 기반 CTDS Modal의 포커스·배경·애니메이션은 공식 컴포넌트가 관리한다. AINS는 `.ains-modal` 폭과 `.ains-modal-content` 스크롤만 구성한다.

## 구조 크기 예외

`:root`에 정의된 `--ains-*` 토큰은 화면 구성 제약이다. 최소 뷰포트, 작업 공간 상한, 3단계 보조 패널, 폼 상한, 일반/넓은 대화상자 상한만 지정한다. 색상·폰트·컨트롤 모서리 값을 복제하는 용도로 사용하지 않는다. 미디어 쿼리의 분기점은 CSS 사용자 정의 속성을 사용할 수 없어 기존 리터럴 분기점을 유지한다. 실제 카드/폼 내부 간격은 Density 축에 반응한다.

## 확인

PostCSS 파싱 및 변수 참조 검사로 주 스타일시트에 유령 토큰과 색상 리터럴이 없는 것을 확인했다. 실제 화면/키보드/모바일 검증은 전체 CTDS 통합 후 수행한다.

반복 검사 명령: `node scripts/check-ctds-tokens.cjs`. AINS 소유 CSS/JSX의 하드코딩과 미정의 변수, 구조 치수 토큰의 비구조적 사용을 검사한다. CTDS 원본 구현의 리터럴은 수정 대상에서 제외하고, 정의된 변수 목록으로만 읽는다. 리터럴 색상·치수·폰트와 미정의 변수 샘플을 주입한 임시 검사에서 실패 종료 코드도 확인했다. 
