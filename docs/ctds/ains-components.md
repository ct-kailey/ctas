# AINS 공통 컴포넌트 적용 규칙

이 문서는 복사한 CTDS 컴포넌트의 AINS 조합 계층과 최소 수정 사항을 기록한다. 원본 컴포넌트별 프롬프트는 `prompts/components/`에 유지한다. 화면을 추가할 때는 이 문서와 해당 컴포넌트 프롬프트를 함께 확인한다.

## 현재 조합

- 테마 축은 앱 루트의 설정을 따른다. AINS는 기존 아이콘과의 일관성을 위해 Lucide를 고정한다.
- `platform/web/src/ui.jsx`가 기존 업무 화면의 공개 API를 유지하면서 실제 CTDS 컴포넌트를 사용한다.
- Button·Input·Textarea는 `sm`, Badge는 `md`를 사용한다. 기존 업무 폼과 조밀한 검토 화면에 맞추되, Label·본문의 가독성은 앱 토큰에서 관리한다.
- 컴포넌트의 색·크기·모션은 CTDS 토큰을 따른다. 화면 CSS는 배치만 담당하고 `data-ctds` 또는 `data-ctds-control`로 표시된 요소의 시각 스타일을 덮지 않는다.

| AINS API | CTDS 컴포넌트와 매핑 |
| --- | --- |
| `Button` | 실제 CTDS Button. `secondary → outline`, `danger → destructive`, `busy → loading` |
| `Badge` | CTDS Badge `soft`. green·amber·red·blue → success·warning·destructive·info |
| `Spinner` | CTDS Spinner. 로딩 문구는 바깥 status 영역에서 한 번만 읽음 |
| `Empty` | CTDS EmptyState. 기존 아이콘은 illustration 슬롯, 안내·행동은 description·actions 슬롯 |
| `Modal` | CTDS Modal.Root·Header. 긴 기존 업무 폼은 토큰 폭과 별도 콘텐츠 스크롤 영역 사용 |
| `FormField` | 명시적 label 연결 + 단일 input·textarea의 CTDS 전환. 다른 컨트롤은 native 유지 |

## 기존 폼 동작 보존

기존 AINS Button은 HTML의 암묵적 submit 동작에 의존하는 폼이 있다. 공통 호환 어댑터의 기본 `type`은 submit을 유지한다. 신규 폼에서는 저장만 `type="submit"`, 나머지 행동은 `type="button"`을 명시한다. 직접 사용하는 CTDS Button의 기본값은 원본대로 button이다.

FormField는 고유한 ID와 `label[for]`를 연결하고 도움말은 `aria-describedby`로 전달한다. CTDS 컨트롤을 바깥 label로 감싸지 않아 중첩 label이나 잘못된 HTML 구조를 만들지 않는다. 기존 ID·name·value·defaultValue·required·disabled·FormData 동작은 보존한다.

CTDS Input은 ref를 컨테이너에 연결하며 일부 이벤트·접근성 속성을 컨테이너에서 처리한다. 이를 기존 native input에 강제로 적용하면 포커스와 이벤트 대상이 바뀔 수 있어 다음 경우는 native를 유지한다.

- 파일·체크박스·라디오·기타 텍스트가 아닌 input
- ref, 별도 크기 속성, wrapper 상호작용 이벤트, 명시적 aria-label·role·tabIndex 등이 있는 input
- ref가 있는 textarea
- select 및 복합 FormField children

이 예외도 앱의 CTDS 토큰 스타일을 사용한다. Textarea는 기존 rows와 수동 크기 조정을 유지하도록 `autoResize={false}`로 연결한다. 새 화면에서는 CTDS Input·Textarea를 직접 사용하고 label·description API를 사용할 수 있다.

## Modal 수정

원본 Modal의 Portal·FocusScope·DismissableLayer를 유지한다. 내용 폭 조정을 위한 `className`, 기존 호출부의 포커스 복구를 위한 `onCloseAutoFocus`, 헤더의 `eyebrow` 슬롯을 추가했다. `hasDescription`이 없는 경우 연결되지 않은 description ID를 노출하지 않는다.

`closeOnOutside`는 원본 CTDS와 동일하게 기본 false다. 기존 AINS 모달 어댑터만 저장 중이 아닐 때 바깥 클릭 닫기를 허용하여 기존 닫기 동작을 보존한다. 닫기는 항상 기존 `onClose`를 호출하므로 미저장 변경 확인을 우회하지 않는다. busy 동안은 ESC·바깥 클릭·닫기 버튼을 차단한다. 닫힌 뒤에는 호출 버튼이 여전히 존재할 때 그 버튼으로 포커스를 돌린다. 추가 모달로 연결되는 기존 업무 흐름에서도 Radix의 포커스 계층을 사용한다.

새로운 결정 화면을 만들 때는 모달을 중첩시키지 않고 한 번에 하나의 결정을 요청한다. 긴 신규 업무 화면은 페이지 또는 Drawer를 우선 고려한다.

## Spinner와 Button 수정

기본 Button의 로딩 표시를 Lottie에서 CTDS CSS Spinner로 바꿨다. 패키지의 Lottie 실행 코드·외부 로딩 자산에 의존하지 않으며 Motion 축에 따라 ring·dots 동작이 함께 바뀐다. 기존 `lottie-*` Spinner variant는 호환성을 위해 남겼지만 AINS에서는 CSS 자동 로더로 폴백한다.

로딩 중에는 버튼 폭과 라벨을 유지하고 입력을 차단한다. 텍스트 라벨은 접근성 이름으로 보존한다. Spinner는 currentColor를 사용하며 모션 없음·동작 줄이기 설정에서는 움직이지 않는 상태 표시를 유지한다.

## Icon 수정

공식 Lucide 매핑과 미지원 이름의 fallback을 유지하고 Phosphor·Solar 런타임 import를 제거했다. 별도 family·weight prop은 호환성 타입으로 남아 있지만 AINS는 Lucide regular만 렌더한다. 새 아이콘은 이미 지원되는 Lucide 이름을 사용하거나 기존 앱의 `lucide-react` 아이콘을 CTDS 슬롯에 전달한다. 설정에서 아이콘 라이브러리를 바꾸는 기능은 제공하지 않는다.

## 검증할 동작

- 로그인·기록 등록 폼의 필수 입력, submit, disabled·loading 상태
- 명시적 label과 도움말, 파일 선택·select·checkbox의 기존 동작
- 모달의 ESC·바깥 클릭·닫기, 저장 중 차단, 미저장 변경 확인, 포커스 복구
- 실제 업무 화면의 데스크톱·모바일 배치와 테마 축 변경
- 외부 Lottie 요청이나 사용하지 않는 아이콘 라이브러리가 번들에 포함되지 않는지 확인

## 팔레트 대비 보정

원본 CTDS의 primary 전경은 항상 bg를 사용한다. 밝은 파스텔이나 일부 선명한 색에서는 버튼 글자 대비가 충분하지 않아 AINS는 브랜드 채움색을 유지하고 전경 역할만 분리한다.

`theme-contrast.mjs`는 테마를 적용할 때 실제 CSS 토큰의 브라우저 렌더 색상을 읽어 기존 fixed-black·fixed-white 중 대비가 큰 값을 선택한다. 기본·hover 각각 독립적으로 계산하며 React의 layout effect에서 적용해 화면 전환과 같은 프레임에 반영한다. 임시 측정 요소는 항상 제거하고 외부 자산을 요청하지 않는다.

| AINS 토큰 | 역할 |
| --- | --- |
| `--ains-primary-fg` | primary 채움 버튼의 텍스트·아이콘 전경 |
| `--ains-primary-hover-fg` | primary hover 채움의 텍스트·아이콘 전경 |
| `--ains-primary-text` | 일반 표면 위 링크·브랜드 텍스트. primary가 bg·bg-subtle·bg-muted 모두와 일반 텍스트 최소 대비를 만족하면 primary, 그렇지 않으면 fg |

이 토큰은 `appearance.css`에 기본 정의하고 테마 적용 시 앱 루트에 계산한 참조를 지정한다. 각 화면은 글자색에 primary 채움 토큰을 직접 사용하지 않고 primary-text 역할을 사용한다. 배경·테두리·선택 표시의 primary 색은 변경하지 않는다. 캔버스 접근이 차단되거나 토큰이 아직 로드되지 않았다면 측정을 생략하고 기본 참조를 유지한다. 색상 대비 수학은 알려진 기준색·경계 회색·전체 색역 표본으로 검증한다.

## 통합 탐색

vara의 Sidebar·Topbar·MenuItem·Tabs를 Vite 업무 화면에서 재사용한다. Shortcut의 키 아이콘도 AINS 고정 아이콘 계열인 Lucide로 연결해 별도 Phosphor 런타임이 필요하지 않다. 원본 크기·키 매핑·접근성 동작은 유지한다.
