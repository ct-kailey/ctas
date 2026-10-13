# Slider

### 원칙
연속·이산 수치를 **드래그로 조정**하는 최소 컨트롤. 트랙 + 채워진 부분 + 썸만 있는 미니멀 스펙 — 값 라벨·마크·range(양끝 두 개)는 이 컴포넌트가 다루지 않는다. 값을 텍스트로 보고 싶으면 옆에 별도 노드로 붙인다.

native `<input type="range">` 위에 스타일만 얹어 접근성(키보드 ← → Home End, 드래그, 스크린리더)을 그대로 상속.

### Do
- **연속·근사 조정에만 씀** — 볼륨, 밝기, 오프셋, 확대율처럼 "대략 이 정도" 조작이 자연스러운 값.
- **정확한 값 입력이 필요하면 [[components/input]]** (`type="number"`). 슬라이더는 근사, 입력은 정확 — 병행해도 좋다.
- **현재 값을 어딘가엔 표시**. 슬라이더 오른쪽에 `<span>{value}px</span>` 같은 라벨을 붙여 지금 값이 얼마인지 읽히게.
- **step은 의미 있는 최소 단위**. px 조정이면 1, 확대율이면 0.1, 볼륨이면 5 같은 식.

### Don't
- **불연속 3~5개 옵션 선택에 쓰지 않는다** — 그건 [[components/tabs]] `segmented` 또는 [[components/filter-button]].
- **On/Off 두 값만 있는 자리에 쓰지 않는다** — [[components/switch]].
- **range slider(양 끝 두 개)로 확장하지 않는다** — 이 컴포넌트는 단일 값만. 범위 선택은 별도 컴포넌트로.
- 썸 크기·트랙 두께를 CSS로 덮어쓰지 않는다 — Density 축 (`--control-h-*`, `--space-*`)이 결정.

### Fallback
size 애매하면 `md`, step 애매하면 `1`.

### 관련
- [[axes/density]] — `--control-h-*`가 썸 크기·트랙 높이에 매핑
- [[axes/shape]] — 트랙·썸 radius (`--radius-full` 고정, Shape 축 영향 없음)
- [[axes/motion]] — hover·drag 상태 전환 duration
- [[axes/palette]] — 채워진 트랙이 `--primary`
- [[tokens/color]] — `--primary` (채운 부분), `--bg-muted` (트랙 배경), `--border-strong` (썸 경계)
- [[components/input]] — 정확한 수치 입력 병행

### Props 시그니처
```tsx
<Slider
  size="sm | md | lg"          // default: md
  min={number}                 // default: 0
  max={number}                 // default: 100
  step={number}                // default: 1
  value={number}               // controlled
  defaultValue={number}        // uncontrolled 초기값
  onValueChange={(n) => void}  // 편의 콜백 (숫자로 바로 옴)
  disabled
  aria-label="…"               // 시각 라벨 없으면 필수
/>
```

### 상태 매트릭스
| 상태 | 트랙 | 썸 |
|---|---|---|
| default | `--bg-muted` 배경 + `--primary` fill | `--bg` + `--border-strong` 경계 + `shadow-xs` |
| hover | 동일 | 경계 `--primary` |
| focus-visible | 동일 | `--ring-shadow` + `--primary` 경계 |
| active (드래그) | 동일 | scale 1.05, cursor grabbing |
| disabled | opacity 0.5 | opacity 0.5, cursor not-allowed |

### Size 가이드
| size | 썸 (control-h) | 트랙 두께 | 언제 |
|---|---|---|---|
| `sm` | control-h-sm | space-0_5 | 툴바 · 인스펙터 · 조밀한 컨트롤 그룹 |
| `md` | control-h-md | space-1 | **기본.** 폼 · 설정 페이지 |
| `lg` | control-h-lg | space-1_5 | 터치 · 랜딩 · 큰 값 조정(볼륨·밝기 등) |

### 접근성
- 실제 `<input type="range">`라서 키보드 ← → (step), PageUp/PageDown (10*step), Home/End 가 자동 동작.
- 스크린리더가 min·max·현재 값을 읽음.
- 시각 라벨이 없으면 `aria-label` 필수. 옆에 값을 표시하는 노드가 있다면 `aria-describedby`로 연결하면 더 좋음.

### 조합 예시
```tsx
// 툴바 안 오프셋 조정 — 값 라벨을 옆에 붙여 현재 값을 노출
<div className="row">
  <Slider
    size="sm"
    min={-40}
    max={40}
    step={1}
    value={offset}
    onValueChange={setOffset}
    aria-label="Arrow offset"
  />
  <span className="value">{offset}px</span>
</div>

// 폼 안 볼륨 조정 — Input과 병행
<label>
  볼륨
  <Slider min={0} max={100} step={5} value={vol} onValueChange={setVol} />
  <Input type="number" min={0} max={100} value={vol} onChange={(e) => setVol(Number(e.target.value))} />
</label>
```
