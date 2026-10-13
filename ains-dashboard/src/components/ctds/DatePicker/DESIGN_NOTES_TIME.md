# DatePicker with Time — Reference Design Analysis

참고 이미지: 좌측 캘린더, 우측 세로 스크롤 타임 리스트, 하단 액션바가 카드 안에 통합된 형태.

## 1. Overall layout

- 카드는 세로로 두 영역: **body(가로 2열)** + **footer(가로 3영역)**
- body:
  - 좌: 캘린더 (약 60% 폭)
  - 우: 시간 리스트 (약 40% 폭), 세로 스크롤 가능
  - 좌우 사이에 수직 `1px --border` divider (실제로 이미지에는 얇은 선이 보임)
- footer:
  - 좌: Cancel (ghost/링크 스타일)
  - 중: 선택 결과 값 표시 (outline input처럼 생긴 pill/button)
  - 우: Schedule (primary 액션)
  - body와 footer 사이 수평 `1px --border` divider

## 2. Calendar panel (좌)

- monthHeader와 grid는 이전 이터레이션과 동일. `<`, `>`는 얇은 원형 outline.
- 셀 크기는 `--control-h-md` 정사각.
- 오늘/점(dot) 표시:
  - **선택되지 않은 오늘 대신 "이벤트 있음"을 나타내는 작은 점**이 셀 하단에 표시됨 (이미지에서 4일, 14일, 8일 아래에 점이 보임)
  - 이건 today 표시가 아니라 **"이벤트 있는 날"** 마커. 우리 컨텍스트에선 today 마커로 재활용.
  - 색: primary(파란색) — 오늘/일반 이벤트, 8일은 회색 점 → 지난 이벤트?
  - 지금 우리는 today = primary inset ring. 참고 이미지 스타일로 가려면 **ring → dot** 방식으로 재변경 필요.
- **선택된 날짜 (21일)**: 
  - `--fg`(거의 검정) 배경의 정사각 라운드(약 `--radius-md`)
  - 텍스트 `--bg`(흰색)
  - **커서 위치 표시**를 위해 우측 하단에 커서 아이콘. 이건 UX 디테일이고 우리는 스킵.
- outside month: 훨씬 옅은 `--fg-subtle`.

**우리와 gap**:
- today를 dot으로 다시 변경할지? — 이 참고에선 dot. 근데 range 모드에서 dot이 in-range 배경 위로 올라가면 잘 보임(색만 대비). ring보다 유연.
- 선택 셀 배경이 `--primary` 아닌 `--fg` (mono inverse 톤)임. 참고 스타일에 맞추려면 `--fg` 사용. 하지만 CTDS 프리셋 컨텍스트에선 `--primary` 유지가 자연스러움. 이미지 그대로 재현할지 우리 톤 유지할지 판단 필요.

## 3. Time list (우)

- 세로 리스트, 각 항목은 `HH:MM AM/PM` 텍스트
- 항목 높이는 대략 `--control-h-md` (36px 정도)
- 좌우 padding: `--space-3` 정도, 텍스트 좌측정렬
- 상태:
  - 기본: `--fg`, 배경 transparent
  - hover: `--hover` 배경
  - **선택**: `--bg-subtle` (연한 회색) 배경, 텍스트 `--fg` (bold 아님, 그냥 진한 색). 
    - 즉 selected가 primary/accent 색이 아님! **회색 배경 + 텍스트 진하게**로 표현.
    - 이건 캘린더 선택(진한 검정)과 시각 계층을 다르게 준 것. 캘린더 선택 = 강함, 시간 선택 = 약함(secondary confirmation).
  - past/불가능: 옅은 `--fg-subtle` (12:00 PM, 1:00 PM 이하가 흐림)
- 리스트 오버플로우: `overflow-y: auto`. 우측에 얇은 스크롤바.
- 리스트 상단/하단에 페이드 마스크 없음 (그냥 잘려 보임)
- 리스트 좌측 경계: 수직 `1px --border` divider

**우리와 gap**:
- 현재 우리 `timeMode="grid30"`은 6-col grid + 각 slot이 border 있는 네모. 참고와 완전히 다름.
- 참고는 세로 리스트 방식 → 새 timeMode `list` 추가하거나 grid30을 리팩터.
- 리스트 max-height는 body 높이에 맞춰 스크롤. 우리 timeGrid의 `max-height: calc(--control-h-sm * 6 + ...)` 로직 참고.

## 4. Footer

- 카드 하단 별도 영역, 위쪽에 `1px --border` 수평선
- 3파트:
  - **좌 Cancel**: ghost 텍스트, `--fg` 색, hover 시 `--hover` 배경 없이 그냥 텍스트만.
  - **중 결과 값**: outline pill-ish button. 
    - 배경 `--bg`, 얇은 `1px --border`, 라운드 `--radius-sm`
    - 텍스트 `--fg`. "Sep 21, 2027 10:00 AM" 형식.
    - `--text-sm`.
    - 클릭 가능해 보이지만 실제 액션은 없음(선택 결과 표시용). 아마 클릭 시 focus 이동 정도.
  - **우 Schedule**: outline button (Cancel과 비슷하지만 border 있음)
    - 검정 텍스트, 흰 배경, 얇은 outline. **primary가 아님**.
    - 이 이미지에선 primary CTA도 outline. 참 조용한 디자인.
- footer padding: 상하 `--space-3`, 좌우 `--space-4` 정도
- 3영역 사이 gap: `--space-3` 정도, 중앙 결과 영역이 `flex: 1`로 가운데 늘어남.

## 5. Sizes / spacing 요약

| 요소 | 값 |
| --- | --- |
| body height | 캘린더 6주 기준 + header + weekdays = 약 8 × `--control-h-md` |
| body padding | 좌우 `--space-4`, 위 `--space-3` |
| body 좌우 divider | vertical `1px --border` |
| body ↔ footer divider | horizontal `1px --border` |
| time list item height | `--control-h-md` |
| time list padding-inline | `--space-3` |
| footer padding | `--space-3` 상하, `--space-4` 좌우 |
| footer gap | `--space-3` |

## 6. 이번 이터레이션에서 반영할 변경

우리 컴포넌트 API는 `withTime` + `timeMode` 유지. 참고 이미지 스타일에 맞춰:

1. **timeMode 리스트 스타일 신설**: `timeMode="list"` (기본으로 승격 고려)
   - 세로 스크롤 리스트, 30분 간격.
   - 항목: 배경 transparent → `--hover`, 선택 시 `--bg-subtle` 배경.
   - 리스트 좌측에 vertical divider.
2. **panel 레이아웃 변경 (withTime일 때만)**:
   - 지금은 캘린더 아래에 timeArea가 붙음 (`.timeArea`).
   - 참고처럼 **캘린더 우측에 timeArea 배치**로. `panelMain`을 flex row로.
   - divider 삽입.
3. **today dot 표시** (선택사항):
   - 지금 inset ring → 셀 하단 primary dot으로 되돌리기.
   - 이유: 참고 이미지가 dot 스타일이고, in-range와의 시각 충돌도 적음.
4. **Footer 슬롯** (선택사항, 시간 있음 = 자동 닫기 불가 케이스에서 유용):
   - `withTime` 시 자동 닫기 안 되니 confirm 버튼이 필요.
   - `withFooter` prop 추가 or `withTime` 자동으로 footer 노출.
   - 좌: 취소(값 초기화 + 닫기), 우: 확정(닫기만).

이번 스코프:
- (a) timeMode "list" 신설 + 기본화
- (b) withTime 시 panel 가로 배치 + divider
- (c) today 표시 = dot으로 전환
- (d) footer는 다음 이터레이션으로 미룸 (스코프 크고 API 결정 필요)

## 7. 이미지 그대로 재현 vs 우리 톤 유지

이미지의 특징:
- 선택 셀 배경 = `--fg` (검정)
- 시간 선택 = `--bg-subtle` (회색)
- 액션 = outline

우리 CTDS는 8축 스왑 시스템이라 `--primary`가 프리셋에 따라 다양. 이미지 그대로 흑백으로 갈 필요는 없음.

**결정**: 
- 선택 셀 = `--primary` 유지 (지금 스타일)
- 시간 리스트 선택 = `--bg-subtle` (참고와 동일, 캘린더보다 약한 강조)
- footer는 이번 스코프 밖
