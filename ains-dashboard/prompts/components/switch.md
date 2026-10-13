# Switch

### 원칙
**즉시 적용되는 on/off** 컨트롤. 토글하는 순간 상태가 변한다 — 저장 버튼이 따로 없는 자리에 쓴다.
시맨틱은 `role="switch"`가 붙은 native checkbox. 시각은 알약 트랙 + 원형 썸 — 켜지면 트랙이 `--primary`로 채워지고 썸이 우측으로 이동.

### Do
- **즉시 반영에만**: 다크모드, 알림 on/off, 자동 저장, 필터 옵션. 토글 → 부작용까지 즉시.
- **"선택 여부"가 아니라 "상태 전환"에만**: 폼 제출 후 반영되는 옵션은 [[components/checkbox]].
- **라벨은 별도 컴포넌트로**: Switch 자체는 컨트롤만. 라벨은 `<label>` wrap이나 옆 텍스트 노드로 배치. 컴팩트한 툴바에서는 라벨을 아예 생략(그룹 자체가 라벨 역할)해도 됨.
- **폼 안이면 `name` 필수**: native checkbox 위에 얹은 거라 폼 제출에 자연스럽게 포함됨.

### Don't
- **다중 선택에 쓰지 않는다** — [[components/checkbox]].
- **저장이 필요한 자리에 쓰지 않는다** — Switch를 켜자마자 부작용이 없다면 사용자는 "정말 켜졌나?" 헷갈린다.
- 트랙 색을 status(성공/경고/삭제)로 바꾸지 않는다 — 켜짐은 항상 `--primary`. 상태 표현은 다른 컴포넌트가 담당.
- 썸·트랙 크기를 CSS로 덮어쓰지 않는다. `size` prop · Density 축이 결정.

### Fallback
size 애매하면 `md`.

### 관련
- [[components/checkbox]] — 선택 여부(폼 제출 후 반영)
- [[components/tabs]] `segmented` — 세 개 이상 배타 옵션
- [[axes/density]] — `--space-*` 스케일이 트랙·썸 크기에 매핑
- [[axes/motion]] — 썸 이동 duration
- [[tokens/color]] — `--primary` (켜짐), `--bg-muted` (꺼짐), `--fg-disabled` (disabled 썸)

### Props 시그니처
```tsx
<Switch
  size="sm | md | lg"                    // default: md
  checked / defaultChecked                // native input props
  onCheckedChange={(on) => void}          // 편의 콜백 (boolean 바로 옴)
  disabled
  name
  aria-label="…"                         // 시각 라벨 없으면 필수
/>
```

### 상태 매트릭스
| 상태 | 트랙 | 썸 |
|---|---|---|
| off · default | `--bg-muted` + `--border` hairline | `--bg` 원 + `shadow-xs` |
| off · hover | 경계 `--border-strong` | 동일 |
| on · default | `--primary` fill, 보더도 `--primary` | 우측 이동 |
| on · hover | `--primary`를 fg 12% 섞어 살짝 진하게 | 동일 |
| focus-visible | 트랙에 `--ring-shadow` | 동일 |
| disabled | `--bg-muted`, 투명 보더 | `--fg-disabled`, shadow none |

### Size 가이드
| size | 트랙 (w × h) | 언제 |
|---|---|---|
| `sm` | space-6 × space-3 | 툴바, 인스펙터, 밀집 폼 |
| `md` | space-8 × space-4 | **기본.** 설정 페이지, 일반 폼 |
| `lg` | space-10 × space-5 | 터치, 온보딩, 큰 옵션 그룹 |

### 접근성
- `role="switch"` + native `input type="checkbox"` → 스크린리더가 "스위치, 켜짐/꺼짐"으로 읽음.
- 시각 라벨이 없으면 `aria-label` 필수.
- `<label>` 래퍼가 있어서 트랙·썸 어디 클릭해도 토글.
- 키보드: Space로 토글, Tab으로 포커스.

### 조합 예시
```tsx
// 툴바 안 옵션 토글 — 그룹이 라벨 역할, aria-label로만 시맨틱 라벨
<div className="toolbar-group">
  <span>Time</span>
  <Switch size="sm" checked={withTime} onCheckedChange={setWithTime} aria-label="Time" />
</div>

// 폼 안 옵션 — 텍스트 라벨과 세트
<label className="row">
  <Switch checked={notify} onCheckedChange={setNotify} name="notify" />
  <span>이메일 알림 받기</span>
</label>

// 설정 페이지 — 라벨 왼쪽, Switch 오른쪽 (justify-between)
<div className="setting-row">
  <div>
    <div>다크 모드</div>
    <div className="hint">시스템 설정을 따르지 않고 강제 적용</div>
  </div>
  <Switch checked={dark} onCheckedChange={setDark} aria-label="다크 모드" />
</div>
```
