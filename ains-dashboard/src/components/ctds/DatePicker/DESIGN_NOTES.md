# DatePicker — Reference Design Analysis

참고 이미지(모바일 팝오버 형태의 리마인더 데이트픽커)를 8축 관점으로 분해한 문서.

## 1. Container

- 흰 카드, `--radius-lg` 정도의 라운드
- `box-shadow` 약함, 배경은 회색 페이지 위에 떠있음
- 카드 안쪽 여백: 상하좌우 균일하게 약 `--space-4`
- 카드 내부 요소들은 세로 flow 하나: `[presets] → [monthHeader] → [weekdays] → [grid] → [footerActions]`
  - 이들 사이 gap은 각기 다르지만 **같은 좌우 padding 라인**을 공유. 즉 preset chip의 좌측 모서리와 nav 버튼의 좌측 모서리와 그리드 첫 컬럼의 좌측 모서리가 **동일 수직선상에 정렬됨**.

## 2. Preset chips (상단)

- 3개(Today / Tomorrow / In 2 days). 왼쪽 정렬, `wrap` 허용.
- 각 chip:
  - 높이는 `--control-h-sm`에 가까움 (32px)
  - 배경 `--bg-subtle`, 텍스트 `--fg`
  - 모서리 완전 라운드(필박스): `border-radius: 999px` (Shape 축에 종속되지 않는 100% 원형)
  - 폰트 사이즈 `--text-sm`, weight `medium`
- chip 간격 `--space-2`

**우리 현재 상태와의 gap**: `Button size="sm" variant="secondary"` 사용 중. secondary 배경/색은 맞지만 border-radius가 `--radius-xs`. → **필박스 라운드로 override 필요**.

## 3. Month header

- 좌측 `<` IconButton, 우측 `>` IconButton, 가운데 월/년 텍스트
- IconButton은 **원형 흰 배경 + 얇은 회색 보더** (하지만 실제로 자세히 보면 그림자 없는 outline 형태, `--radius-full`)
  - hover 시 살짝 배경 진해짐 정도
- 중요 포인트: `<` 버튼의 **left edge**가 그리드 첫 컬럼(Mo)의 left edge와 정확히 일치, `>` 버튼의 **right edge**가 마지막 컬럼(Su)의 right edge와 정확히 일치
  - 즉 `monthHeader`는 `padding-inline: 0`이어야 하고 IconButton 사이즈는 셀 폭(=`--control-h-sm`)과 같아야 함
- 가운데 텍스트: `--text-sm`, weight `medium`, 색 `--fg`

**우리 현재 상태와의 gap**:
- monthHeader에 `padding-inline: var(--space-1)`가 걸려서 nav 버튼이 그리드 컬럼과 어긋남 → **제거**
- IconButton variant는 ghost인데 참고 이미지는 **outline + 원형** → 새 스타일 필요. IconButton의 variant 확장보다는, DatePicker 내부에서 className overlay로 처리하는 게 스코프 작음
- IconButton size=sm이면 width=`--control-h-sm`으로 셀 폭과 자동 일치 (이건 이미 맞음)

## 4. Weekday row

- 7컬럼 균등, gap 0
- 각 라벨은 셀 폭과 같은 **정사각 박스**, 텍스트 중앙정렬
- 색 `--fg-muted`, 폰트 `--text-xs`
- 요일 코드는 두 글자(Mo, Tu, ...). 우리는 한국어(일/월/화). 유지.

**우리 현재 상태와의 gap**: weekday 이미 aspect-ratio 1, gap 0 처리 완료. OK.

## 5. Day grid

- 7×N 격자, gap 0 (셀들이 서로 붙어있음)
- 각 셀은 정사각 `--control-h-sm` × `--control-h-sm`
- 셀 폰트: 숫자만, `--text-sm`, weight `regular`, 색 `--fg`
- outside month 색: 훨씬 옅음 (`--fg-subtle` 또는 더 옅게)
- **오늘**: primary 컬러 텍스트 + primary 얇은 1px 링(inset border) — 이미 반영
  - 링의 모서리 radius는 셀 radius와 동일 (`--radius-sm`)
- **선택된 날짜**: primary 채움 원, 텍스트는 `--bg`
  - 선택 셀의 모서리도 `--radius-sm` (참고 이미지 자세히 보면 완전 원은 아니고 약간 라운드된 사각)
- range 표시(우리 케이스): in-range 셀은 배경 `--hover`, 첫/끝은 primary 채움

**우리 현재 상태와의 gap**:
- dayCell aspect-ratio 1 완료, gap 0 완료
- 그러나 **셀 폭이 `--control-h-sm`으로 강제되지 않고, monthCol width가 이를 정확히 제공하는 경우에만 성립.** 지금 monthCol width가 `--control-h-sm * 7`인데 grid-template-columns가 `repeat(7, 1fr)`이라 컬럼 폭 = `--control-h-sm`. 성립.
- outside 색은 `--fg-subtle` 사용 중. 이미지랑 대체로 부합.
- 선택 셀 hover 색 살짝 조정 여지 있으나 현재 유지 가능.

## 6. Footer / actions (참고 이미지)

- 상단: `+ Add reminder` 텍스트 링크 (ghost 버튼)
- 하단: `Remove` (outline) 좌, `Done` (primary) 우 — 하단 padding 안에서 좌우 정렬
- **우리 DatePicker는 footer 슬롯이 없음.** 지금은 값 선택하면 자동 닫힘.
- 이 부분은 확장 스코프. 이번 이터레이션에서는 **스킵**.

## 7. Density / spacing 요약

| 요소 | 값 |
| --- | --- |
| 카드 padding | `--space-4` |
| presets → header gap | `--space-3` |
| header → weekdays gap | `--space-2` |
| weekdays → grid gap | 0 (weekday가 grid 첫 행처럼 붙음) |
| chip 간격 | `--space-2` |
| cell 크기 | `--control-h-sm` |
| grid gap | 0 |

## 8. 색·라운드 요약

| 요소 | 배경 | 텍스트 | radius |
| --- | --- | --- | --- |
| Container | `--bg` | — | `--radius-lg` |
| Preset chip | `--bg-subtle` | `--fg` | 999px (pill) |
| Nav IconButton | `--bg` | `--fg` | 999px (원형) + 1px `--border` |
| Weekday cell | transparent | `--fg-muted` | — |
| Day cell (default) | transparent | `--fg` | `--radius-sm` (hover 시) |
| Day cell (today) | transparent | `--primary` | `--radius-sm` + primary 1px inset ring |
| Day cell (selected) | `--primary` | `--bg` | `--radius-sm` |
| Day cell (outside) | transparent | `--fg-subtle` | — |

## 9. 이번 이터레이션에서 반영할 변경

1. Preset chip → **pill radius (999px)** 로 override
2. Nav IconButton → **원형 + 1px `--border`** outline 스타일
3. `monthHeader` → **`padding-inline: 0`** (nav 버튼과 그리드 컬럼 좌우 정렬)
4. `panelMain` 내부 gap 재조정: header→weekdays 사이 `--space-2`, weekdays→grid는 최소로 (거의 0)
5. presets 상단 padding은 `--space-3 var(--space-4)` 유지, 카드 padding과 조화

Footer 액션 슬롯(Add reminder / Remove / Done) 은 별도 이터레이션.
