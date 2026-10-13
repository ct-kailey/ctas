# Filter Button

### 원칙
리스트·테이블 상단에서 결과를 좁힐 때 쓰는 **토글 컨트롤**. 액션 실행([[components/button]])이 아니라 &ldquo;적용 중&rdquo; 상태 유지가 목적이라 별도 컴포넌트. Hue/Palette와 무관하게 항상 명도 대비(fg↔bg 반전)로 강조 → 어느 테마에서도 &ldquo;선택됨&rdquo;이 확실히 읽힌다.

`role="button"` + `aria-pressed`로 순수 토글. 여러 개를 조합해도 되고 하나만 켜도 되지만 &ldquo;체크박스/라디오 시맨틱&rdquo;이 필요한 폼 UI는 [[components/checkbox]]/[[components/radio]]를 직접 쓴다.

count는 [[components/badge]]로 위임 — unselected는 `variant="soft"`, selected(반전 상태)에서는 `variant="inverse"`.

### Do
- **필터 바 전용**: 리스트·테이블 상단, 카드 그리드 상단의 &ldquo;결과 좁히기&rdquo;. 폼 안에 두면 [[components/checkbox]]/[[components/radio]]가 맞다.
- **count는 미리 알려줄 수 있을 때만**: 서버가 매칭 개수를 이미 알고 있는 경우에만 표시. lazy 계산은 UX상 어색.

### Don't
- Chip(정보 라벨)로 오해되게 두지 않는다 — FilterButton은 언제나 **인터랙션 컨트롤**, `<button>` 시맨틱.
- 폼 시맨틱(체크박스·라디오)이 필요한 곳에 대체품으로 쓰지 않는다 — 시맨틱이 다르다.

### Fallback
size 애매하면 `md`.

### 관련
- [[components/checkbox]] · [[components/radio]] — 폼 안이라면 이 둘을 직접 쓴다.
- [[components/badge]] — count 슬롯이 Badge로 위임. `soft` ↔ `inverse` 자동 스왑.
- [[components/button]] — 시각적 형제. 액션 실행용은 이쪽.

### Props 시그니처
```tsx
<FilterButton
  size="sm | md"                                     // default: md
  selected={boolean}
  onToggle={(next: boolean) => void}
  leftIcon={ReactNode}
  count={number}                                      // Badge로 위임
  disabled={boolean}
>{children}</FilterButton>
```

### 상태 매트릭스
| state | 시각 |
|---|---|
| unselected | outline (fg-muted 텍스트) |
| selected   | **반전** (fg 배경 + bg 텍스트) |
