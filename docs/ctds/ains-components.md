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
| `FormField` | 명시적 label·도움말 연결. 자식은 CTDS 컨트롤 어댑터로 전달 |
| `Input` / `Textarea` | CTDS Input·Textarea. checkbox/radio 유형은 CTDS Checkbox·Radio |
| `Select` | CTDS Select Root·Trigger·Content·Group·Item. 기존 option 계약은 어댑터에서 변환 |
| `Tabs` | CTDS Tabs List·Trigger·Panel. 키보드 이동과 선택 표시 제공 |
| `ControlButton` | CTDS Button asChild. 기존 복합 내용 및 암묵적 submit 호환. 독립 카드에는 AINS 확장 `layout="card"` 명시 |
| `Disclosure` | CTDS Disclosure. 접힌 입력도 마운트하여 값 보존 |
| `Toast` / `ErrorNotice` / `Notice` | CTDS Toast Provider·Viewport / Callout |
| `useConfirm` | CTDS Modal + Button. 비동기 결정·취소·포커스 복귀 |
| 대시보드 | CTDS MetricCard·ListItem·Avatar·Breadcrumb·Sidebar·Topbar |
| 계약·권한 표 | CTDS TableHeader·TableRow·TableCellText |

## 기존 폼 동작 보존

기존 AINS Button은 HTML의 암묵적 submit 동작에 의존하는 폼이 있다. 공통 호환 어댑터의 기본 `type`은 submit을 유지한다. 신규 폼에서는 저장만 `type="submit"`, 나머지 행동은 `type="button"`을 명시한다. 직접 사용하는 CTDS Button의 기본값은 원본대로 button이다.

FormField는 고유한 ID와 `label[for]`를 연결하고 도움말은 `aria-describedby`로 전달한다. CTDS 컨트롤을 바깥 label로 감싸지 않아 중첩 label이나 잘못된 HTML 구조를 만들지 않는다. 기존 ID·name·value·defaultValue·required·disabled·FormData 동작은 보존한다.

`ui-controls.jsx`는 텍스트·날짜·파일 입력까지 CTDS Input을 사용한다. 복사한 Input/Textarea에 내부 input ref와 native props 슬롯을 추가해 기존 이벤트의 target/currentTarget과 에디터 선택 영역을 유지한다. Checkbox/Radio의 단순 인라인 사용은 중첩 label 없이 실제 CTDS 내부 input에 연결한다.

Select의 보이는 UI는 실제 CTDS/Radix Select다. 숨긴 native select가 name·FormData·required·reset·onChange·ref의 단일 기준이다. 빈 값과 optgroup, disabled 옵션, disabled fieldset을 지원한다. 여러 값 선택은 Checkbox 그룹으로 구현한다. 기본값과 controlled 값은 구분해서 초기화한다.

Textarea는 기존 rows·ref·수동 크기 조절을 보존한다. Disclosure는 닫혀 있어도 폼 요소를 보존하고 inert/aria-hidden으로 접근을 차단한다. 필수 입력 오류가 있으면 해당 영역을 열고 포커스를 옮긴다. ControlButton은 `layout="content"`로 복합 내용 높이를 유지하며 장식은 CTDS variant가 담당한다.

## 카드와 안내 조합의 간격

`layout="content"`와 `layout="card"`는 공식 CTDS API가 아닌 **AINS의 명시적 Button 확장**이다. 원본 Button의 size·variant와 일반 버튼 동작을 유지한다.

- `layout="content"`: 기존 복합 내용의 자연스러운 높이를 보존한다. 기존 사용처의 간격을 일괄 변경하지 않는다.
- `layout="card"`: 여러 줄 제목·설명·상태가 들어가는 독립된 클릭 카드에 사용한다. 자연스러운 높이와 네 면의 `var(--space-3)` padding을 함께 적용한다. 카드 내부 padding은 이 확장이 담당하며 화면 CSS에서 다시 덮지 않는다.
- 컴포넌트 사이의 간격은 부모 `.ains-section-stack`이 담당한다. 카드의 **내부** padding과 형제 컴포넌트의 **외부** gap은 서로 다른 공간이다. 같은 경계의 부모 gap에 자식 margin을 다시 더하지 않는다.
- `Notice`의 행동 버튼은 본문 children에 붙이지 않고 `actions` 슬롯으로 전달한다. 본문의 목록은 `.ains-prose-list`로 브라우저 기본 여백에 의존하지 않도록 한다. Callout의 제목·본문·행동 간격은 CTDS가 담당한다.

이 조합은 필요한 사용처에 명시적으로 적용한다. 모든 기존 페이지나 ControlButton이 카드 레이아웃으로 전환된 것은 아니다.

`ConfirmationProvider`는 동시 요청을 덮어쓰지 않으며 취소·Escape·바깥 클릭·호출자 해제에서 false를 반환한다. 브라우저의 페이지 이탈 보호(beforeunload)는 브라우저가 제공해야 하는 예외로 유지한다. OS 파일 선택기·날짜 선택기의 플랫폼 동작도 유지한다.

## Modal 수정

원본 Modal의 Portal·FocusScope·DismissableLayer를 유지한다. 내용 폭 조정을 위한 `className`, 기존 호출부의 포커스 복구를 위한 `onCloseAutoFocus`, 헤더의 `eyebrow` 슬롯을 추가했다. `hasDescription`이 없는 경우 연결되지 않은 description ID를 노출하지 않는다.

`closeOnOutside`는 원본 CTDS와 동일하게 기본 false다. 기존 AINS 모달 어댑터만 저장 중이 아닐 때 바깥 클릭 닫기를 허용하여 기존 닫기 동작을 보존한다. 닫기는 항상 기존 `onClose`를 호출하므로 미저장 변경 확인을 우회하지 않는다. busy 동안은 ESC·바깥 클릭·닫기 버튼을 차단한다. 닫힌 뒤에는 호출 버튼이 여전히 존재할 때 그 버튼으로 포커스를 돌린다. 추가 모달로 연결되는 기존 업무 흐름에서도 Radix의 포커스 계층을 사용한다.

새로운 결정 화면을 만들 때는 모달을 중첩시키지 않고 한 번에 하나의 결정을 요청한다. 긴 신규 업무 화면은 페이지 또는 Drawer를 우선 고려한다.

## Spinner와 Button 수정

기본 Button의 로딩 표시를 Lottie에서 CTDS CSS Spinner로 바꿨다. 패키지의 Lottie 실행 코드·외부 로딩 자산에 의존하지 않으며 Motion 축에 따라 ring·dots 동작이 함께 바뀐다. 기존 `lottie-*` Spinner variant는 호환성을 위해 남겼지만 AINS에서는 CSS 자동 로더로 폴백한다.

로딩 중에는 버튼 폭과 라벨을 유지하고 입력을 차단한다. 텍스트 라벨은 접근성 이름으로 보존한다. Spinner는 currentColor를 사용하며 모션 없음·동작 줄이기 설정에서는 움직이지 않는 상태 표시를 유지한다.

## Icon 수정

0.4.4 공식 Icon을 적용하여 Phosphor 의미 이름을 기준으로 Phosphor·Solar·Lucide 전체 매핑과 family·weight 동작을 복원했다. AINS 화면의 기본 계열은 Lucide regular로 유지한다. 새 아이콘은 이미 지원되는 Lucide 이름을 사용하거나 기존 앱의 `lucide-react` 아이콘을 CTDS 슬롯에 전달한다. 설정에서 아이콘 라이브러리를 바꾸는 기능은 제공하지 않는다.

## 검증할 동작

- 로그인·기록 등록 폼의 필수 입력, submit, disabled·loading 상태
- 명시적 label과 도움말, 파일 선택·select·checkbox의 기존 동작
- 모달의 ESC·바깥 클릭·닫기, 저장 중 차단, 미저장 변경 확인, 포커스 복구
- 실제 업무 화면의 데스크톱·모바일 배치와 테마 축 변경
- 외부 Lottie 요청이 없는지, vendor의 세 아이콘 family 매핑이 유효한지 확인

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

vara의 Sidebar·Topbar·MenuItem·Tabs를 Vite 업무 화면에서 재사용한다. Shortcut의 키 아이콘도 AINS 고정 아이콘 계열인 Lucide로 연결해 Shortcut의 기존 키 표시는 유지한다. 원본 크기·키 매핑·접근성 동작은 유지한다.

## 적용 검사

`npm run check:ctds`는 토큰 검사와 JSX AST 기반 실제 컴포넌트 검사를 함께 실행한다. 현재 운영 호스트인 `platform/web/src` 최상위 `.jsx` 파일을 검사하며 복사한 `components/`, 검토한 `ui.jsx`·`ui-controls.jsx`, 개발 fixture는 별도 검증한다. 검사 대상에 새 native 입력·버튼·select·details·dialog, 수동 tab/listbox·notice, 버튼형 링크, window.confirm/alert/prompt가 생기면 실패한다. CTDS asChild 슬롯과 검토한 폼 어댑터 내부만 예외다. 개발 전용 `/ctds-contract.html`은 프로덕션 빌드 입력에서 제외된다. 이 페이지에서 브라우저 폼 계약을 검증한다.

## CTDS 0.3.4 업데이트

수정하지 않은 MenuItem·Sidebar와 관련 문서는 공식 버전으로 갱신했다. 메뉴 라벨 말줄임 툴팁의 `@radix-ui/react-tooltip`을 production 의존성으로 등록했다. 기존 AINS 폼 어댑터는 유지하며 Checkbox·Radio에는 upstream의 root 위치 기준 보정을 병합했다.

## CTDS 0.4.4 업데이트

- 리스트는 actual ListItem compound로 전환했다. 앱 어댑터는 role=list/listitem, 조밀한 기본값, 긴 한국어/ID 줄바꿈만 공급한다. Meta는 긴 메타·액션이 좁은 화면에서 줄바꿈하도록 구성한다.
- Topbar.Spacer와 ListItem의 이전 from/body/layout API는 제거했다. 컴포넌트 검사에서 native ul/ol/li 및 폐기된 ListItem prop도 차단한다.
- Kanban은 공식 시각 구조를 쓰며, 이동→확인→개발 시작과 읽기 전용 권한은 앱의 기존 상태 머신에 둔다.
- Sidebar.Item에 label/onClick을 직접 전달한다. asChild 버튼 자식은 벤더의 말줄임 측정 span을 우회하므로 사용하지 않는다. MenuItem의 키보드 처리는 유지된다.
- tokens.css와 Button.module.css는 0.3.4 원본을 기준으로 0.4.4를 3-way 병합했다. 자체 제공 폰트, 대비 보정, 폼/ref/ESC/포커스 복원 수정은 보존한다.
