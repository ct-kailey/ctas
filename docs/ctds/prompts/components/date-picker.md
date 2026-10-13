# Date Picker

### 원칙

날짜·기간·시간 선택을 **하나의 컴포넌트**로 커버한다. props 조합으로 유즈케이스를 조립한다 — 별도의 `DateRangePicker` / `TimePicker` 컴포넌트를 만들지 않는다. 컴포넌트 분화보다 prop 표면이 예측 가능성이 높다.

### Do
- `mode` 하나로 단일/기간을 결정한다 — `mode="single"` 또는 `mode="range"`.
- `range`는 기본 `months=2` (양옆 두 달). 좁은 자리는 `months=1`로 명시.
- 시간이 필요하면 `withTime` 활성 + `timeMode`로 UI 방식 지정.
- 자주 쓰는 기간이 있으면 `withPresets`로 사이드바 노출. 기본 프리셋은 mode에 맞게 자동 선택됨.
- 값은 항상 통제형(controlled). `value`/`rangeValue` + `onChange`/`onRangeChange`로 다룬다.
- 대시보드 사이드바처럼 항상 노출해야 하면 `inline`을 켜서 Popover 없이 렌더링.

### Don't
- 시간만 단독으로 필요한 화면에 이 컴포넌트를 쓰지 않는다 — 날짜가 없이는 의미 없음. 순수 시간 입력은 별도 `TimePicker` (미구현) 몫.
- `mode="single"`에 `months=2`를 함께 쓰지 않는다 — 시각적 낭비.
- `timeMode="grid30"`은 30분 슬롯 예약/미팅 UI가 아닌 경우 피한다 — 세로로 길어져 Popover가 뷰포트를 밀어낸다.
- 하드코딩된 min/max width를 CSS로 덮어쓰지 않는다. 크기 조정은 `size` prop 경유.

### Fallback
mode가 명확하지 않으면 `single`. 시간 필요 여부가 명확하지 않으면 `withTime` 꺼두고 필요할 때 켠다. timeMode가 애매하면 `dropdown` (범용성 최고).

### 관련
- [[components/input]] — 트리거로 `<Input readOnly role="combobox">`를 재사용. 별도 트리거 스타일 없음.
- [[components/form-field]] — 라벨/에러 필요 시 DatePicker를 FormField로 감쌀 수 있음.
- [[axes/density]] — 트리거·달력 셀 높이가 `--control-h-sm/md/lg` 경유로 자동 반응.
- [[axes/motion]] — Popover in/out은 전역 유틸 `.m-float` 하나로 통일. 자체 keyframe 만들지 않는다. 자세히는 `axes/motion.md` §플로팅 서페이스 In/Out.
- [[axes/shape]] — 트리거·Popover의 radius가 Shape 축에 반응.
- [[tokens/color]] — `--primary`(선택), `--hover`(범위 하이라이트), `--border`(경계) 경유.
- [[components/popover]] — 트리거+오버레이 패턴 공유 (Radix Popover 기반).

### Props 시그니처

```tsx
<DatePicker
  mode="single | range"
  months={1 | 2}                                  // range의 기본은 2
  value={Date | null}                             // single
  rangeValue={{ from: Date | null, to: Date | null }} // range
  onChange={(d) => void}                          // single
  onRangeChange={({ from, to }) => void}          // range

  withTime={boolean}
  timeMode="grid30 | dropdown | input"            // default: "dropdown"
  minuteStep={5 | 10 | 15 | 30 | 60}              // dropdown 전용

  withPresets={boolean}
  presets={SinglePreset[] | RangePreset[]}        // mode에 맞춘 타입

  minDate={Date} maxDate={Date}
  weekStartsOn={0..6}                             // default: 0 (일)

  size="sm | md | lg"
  disabled={boolean}
  inline={boolean}                                // Popover 없이 인라인
  trigger={ReactNode}                             // asChild 커스텀 트리거
  placeholder={string}
/>
```

### Variant 매트릭스

`variant`가 아니라 **prop 조합**으로 형태가 결정된다. 자주 쓰는 조합:

| 조합 | 용도 | 금지 조합 |
|---|---|---|
| `mode="single"` | 하나의 날짜 선택 (생일, 만료일) | `months=2` |
| `mode="single"` + `withTime` | 예약 시각, 게시 예약 | — |
| `mode="range"` + `months=1` | 좁은 자리의 짧은 기간 | — |
| `mode="range"` + `months=2` (기본) | 대시보드 조회 기간, 장기 일정 | — |
| `mode="range"` + `withPresets` | 애널리틱스/리포트 조회 필터 | — |
| `mode="range"` + `withTime` + `timeMode="grid30"` | 회의실 예약 (30분 슬롯) | 뷰포트가 좁을 때 |
| `inline` | 사이드바에 상시 노출된 달력 | `trigger` |

**timeMode 선택:**
- `grid30` — 예약/미팅. 30분 단위 그리드. 세로로 길어지므로 공간 여유 확인.
- `dropdown` — 범용. 시/분 각각의 select. 밀도 좋음.
- `input` — HH:MM 직접 타이핑. 자유도 최고, 실수 여지도 최고.

### 조합 예시

```tsx
// 대시보드 조회 필터: 기간 + 퀵메뉴 + 두 달 뷰
<DatePicker
  mode="range"
  months={2}
  withPresets
  rangeValue={period}
  onRangeChange={setPeriod}
  maxDate={new Date()}
/>

// 예약 시스템: 단일 날짜 + 30분 슬롯
<DatePicker
  value={slot}
  onChange={setSlot}
  withTime
  timeMode="grid30"
/>

// 인라인 위젯: 사이드바에 상시 노출
<DatePicker inline value={date} onChange={setDate} />
```
