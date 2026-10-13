# TimePicker

### 원칙
시·분 선택 입력. [[components/date-picker]]의 시간 짝. 트리거는 세그먼트 입력(HH:MM 2자리씩) + popover 안에 시/분 리스트 또는 전체 슬롯 그리드. "약속 시간·회의 시작·마감 시각" 자리.

### Do
- `variant="line"` 기본. 폼 블록이면 `outline`, 밀도 극한이면 `filled` ([Input line default](../../memory/feedback_input_line_default.md) 메모리와 동일 규칙).
- `step={30}` 기본. 회의·일정은 30분 단위가 흔함. 5·10·15·60도 선택 가능하지만 그 외 값은 자동 clamp.
- 24h 지역이면 `format="24h"`(기본), 12h 지역이면 `format="12h"` + meridiem 세그먼트.
- `quickOptions`는 "지금부터 상대 시간"이 흔한 자리(알람·예약 리마인더)에서만 켠다. 일반 폼엔 노이즈.
- 예약 가능 슬롯을 그리드로 보여줘야 하는 자리(병원·식당 예약)엔 `inline + panelLayout="grid"`. gridCols 4~8 중 레이아웃 폭에 맞춰.

### Don't
- step에 7·13·45 같은 비표준 분수치를 넣지 않는다 — 리스트 가독성이 깨짐. 5·10·15·30·60만.
- `minTime`/`maxTime`은 "HH:MM" 문자열만. Date 객체·epoch 금지.
- `panelLayout="grid"`를 popover 모드(`inline=false`)에서 쓰지 않는다 — 그리드는 inline 전용.
- Input처럼 생겼다고 `<Input type="time">`을 섞어쓰지 않는다 — 네이티브 time input은 축·토큰이 적용 안 됨.

### Props 시그니처
```tsx
<TimePicker
  value?={TimeValue | null}                 // { hours, minutes }
  onChange?={(v: TimeValue | null) => void}
  step?={5 | 10 | 15 | 30 | 60}             // default: 30
  format?="24h | 12h"                         // default: 24h
  minTime?={string}                           // "HH:MM" (24h, inclusive)
  maxTime?={string}                           // "HH:MM" (24h, inclusive)
  disabled?={boolean}
  size?="sm | md | lg"                        // default: md
  variant?="outline | filled | line"          // default: outline
  inline?={boolean}                           // popover 없이 패널만
  panelLayout?="columns | grid"              // default: columns
  gridCols?={4 | 6 | 8}                       // grid 모드 열 수
  splitMeridiem?={boolean}                    // grid를 AM/PM 2섹션
  quickOptions?={QuickOption[] | boolean}
  aria-label?={string}
/>
```

### 조합 예시
```tsx
// 폼 — 시작·종료 시간
<TimePicker variant="outline" step={15} value={start} onChange={setStart} />
<TimePicker variant="outline" step={15} value={end} onChange={setEnd} minTime="09:00" />

// 예약 슬롯 그리드 (오전·오후 분리)
<TimePicker
  inline
  panelLayout="grid"
  step={30}
  splitMeridiem
  gridCols={6}
  value={slot}
  onChange={setSlot}
/>

// 알람 — 지금부터 15/30/60분 후
<TimePicker
  variant="line"
  quickOptions
  value={remind}
  onChange={setRemind}
/>
```

### 관련
- [[components/date-picker]] — 날짜 짝. 날짜+시간이 함께면 둘을 나란히.
- [[components/input]] — variant 규칙 동일
- [[components/select]] — 밀도 극한에서 Select로 대체 가능
