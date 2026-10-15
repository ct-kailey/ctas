# AINS · CTDS

CTDS 0.3.4의 copy-based React 컴포넌트를 React/Vite 호스트에 적용한다.
기본 축은 [ctds.config.json](./ctds.config.json)이 단일 원본이다.

## 디자인 방향

Spare의 간결한 업무 도구 레이아웃을 기반으로 한다. 기본은 light · calm palette · 채도가 낮은 카키 · standard shape · default density · calm motion · 한국어 글꼴이다. 카키는 hue 100에 CTDS calm의 hue-shift 18을 적용하고, `appearance.css`에서 calm의 chroma를 밝은/어두운 화면 모두 0.05로 낮춘다. 상태 색상은 별도로 유지한다. 기존 아이콘을 이어 쓰기 위해 icon은 Lucide로 고정한 프로젝트 조합이다. 밝기·팔레트·색상·모서리·밀도·움직임은 로그인 후 **화면 설정**, 또는 `/ctds`에서 적용한다. 설정은 해당 브라우저에만 저장된다. 기존 기본 녹색(calm/145) 저장값만 새 기본색으로 전환하며, 다른 사용자 색상과 나머지 축은 유지한다. 이후 명시적으로 선택한 녹색도 유지한다.

## 코드와 규칙

- 공통 컴포넌트: `platform/web/src/components/ctds/`
- 앱 호환 어댑터: `platform/web/src/ui.jsx`, `ui-controls.jsx`
- 테마 저장·검증: `appearance.jsx`, `theme-state.mjs`
- 공식 규칙: [PRINCIPLES](./docs/ctds/prompts/PRINCIPLES.md), [OVERRIDE](./docs/ctds/prompts/OVERRIDE.md), [Spare](./docs/ctds/prompts/themes/spare.md)
- 앱 수정 사항: [컴포넌트](./docs/ctds/ains-components.md), [스타일](./docs/ctds/ains-styles.md)

새 화면은 실제 CTDS 컴포넌트를 조합한다. 앱 색상·간격·글꼴·모서리·그림자·전환은 semantic token을 참조한다. 브랜드 강조는 `--primary`, 본문은 `--fg`, 설명은 `--fg-muted`다. `--fg-subtle`을 작은 본문에 사용하지 않는다. CSS 변수로 쓸 수 없는 media query 분기점과 의도한 구조 폭은 별도 layout token으로 관리한다. 원문 출처·승인·오류 안내는 디자인 작업에서 없애지 않는다.

`Button` 기본 크기는 sm이다. 기존 AINS 폼 호환 어댑터만 implicit submit을 보존하므로 새 비제출 버튼에는 `type="button"`을 명시한다. 탭·선택·입력·체크박스·라디오·접기·확인창은 실제 CTDS 컴포넌트를 사용한다. 폼 호환 어댑터가 ref·이벤트·FormData·필수 입력·초기화를 보존한다. Select의 숨은 native 요소는 폼 전송 전용이며 사용자에게 보이는 트리거와 메뉴는 CTDS Select다. 모달은 바쁜 동안 닫기를 차단하고 미저장 확인 콜백·포커스 복귀를 유지한다.

키보드 포커스는 항상 표시한다. 동작 줄이기 요청은 애니메이션보다 우선한다. 아이콘 변경은 지원하지 않는다. Font 축은 한국어 UI에 맞춰 고정한다. Pretendard Variable은 앱에서 직접 제공하므로 문서 CDN 연결이나 CSP 완화 없이 로드된다.

## 업데이트

사용하는 날 먼저 `npm run ctds:check-update`로 공식 npm 최신 버전을 확인한다. 현재 Next.js 전용 `npx ctds init/update`는 이 Vite 앱에 직접 실행하지 않는다.

1. 작업 파일을 백업하거나 커밋한다.
2. 최신 버전이 있으면 `npm install -D --save-exact @conscience-technology/ctds@latest`를 실행한다.
3. `npm run ctds:sync`로 원본 대비 차이를 확인한다.
4. `npm run ctds:sync -- --apply`는 **수정하지 않은 파일만** 갱신한다. 앱에서 수정한 파일은 보존하고 병합 대상으로 보고한다. 해당 컴포넌트 코드와 프롬프트를 함께 비교·병합한다.
5. `npm run check:ctds`, `npm run build`, 로그인·폼 제출·중첩 모달·모바일·테마 전환을 확인한다.

`.ctds-meta.json`은 배포 버전과 파일별 upstream hash를 기록한다. `.npmrc`는 source-copy CLI의 Next.js·선택적 컴포넌트 peer를 자동 설치하지 않도록 하며, 실제 사용 컴포넌트의 Radix 의존성은 package-lock에 명시한다. `npm ci`와 Railway 빌드가 같은 설정을 사용한다.
