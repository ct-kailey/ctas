# SplitButton

### 원칙
시각적으로 하나로 붙어있지만 클릭 영역이 두 개로 분리된 버튼 — `main`(기본 액션) + `menu`(부가 옵션 드롭다운). 사용자에게 "이 액션의 가장 흔한 형태 + 대안" 관계를 한 컨트롤로 압축한다. 예: [저장 | ▾] → 저장 / 다른 이름으로 저장 / 사본 저장.

### Do
- **main은 예측 가능한 기본값** — 90% 사용자가 원할 액션. menu는 그 외 변형.
- `menuLabel` prop은 필수. 스크린리더가 caret 영역을 식별해야 함 ("옵션 더보기", "저장 옵션" 등).
- variant는 [[components/button]]과 동일 규칙 — 한 화면에 `primary` 1개.
- menu 열림 상태는 부모가 관리하고 `aria-expanded`는 caret button에 얹는다 (필요 시 `...rest`로 전달할 수 있게 컴포넌트 확장).

### Don't
- 두 액션이 **의미상 무관**하면 SplitButton 아님 → 그냥 Button 2개.
- menu에 3개 이상 항목이 들어가면 검토. 너무 많으면 그냥 [[components/menu]] 트리거 Button 하나로.
- 구분선 색·굵기 CSS로 덮어쓰지 않는다. currentColor × 알파로 variant 톤 자동 반응.
- `ghost` / `destructive`는 지원하지 않는다. Ghost는 무게가 최소인데 옆에 caret이 붙는 순간 시각 위계가 튀고, destructive는 부가 옵션까지 감싸기엔 위험 신호가 과함. 삭제 계열은 [[components/button]] `destructive` / `destructive-ghost` 단독으로.

### Fallback
variant 애매하면 `secondary`, size 애매하면 `md`.

### 관련
- [[components/button]] — variant/size 규칙 공유
- [[components/menu]] — menu 클릭 시 열리는 드롭다운
- [[axes/density]] — `--control-h-*`가 두 영역 높이·정사각 폭에 매핑
- [[axes/shape]] — root radius가 Shape 축에 반응

### Props 시그니처
```tsx
<SplitButton
  size="sm | md | lg"                            // default: md
  variant="primary | inverse | secondary | outline"  // default: primary
  leftIcon={ReactNode}                            // main 라벨 앞
  menuIcon={ReactNode}                            // 기본 caret-down 대체
  onMainClick={handler}
  onMenuClick={openMenu}
  menuLabel="옵션 더보기"                          // 필수, 접근성용
  fullWidth loading disabled
>
  저장
</SplitButton>
```

### 구조·동작
- 내부적으로 `<button>` 2개 + 사이 `<span>` divider
- 각 영역이 독립 `:hover` — main hover 시 menu는 그대로, 반대도 동일
- Divider는 상하 여백(`--space-1_5`) 두고 세로 hairline, 색은 variant fg의 25% 알파
- 포커스링은 각 button별로. 링이 옆 영역 위로 올라오게 z-index 처리

### 조합 예시
```tsx
// 저장 + 다른 형식으로 저장 (드롭다운)
<SplitButton
  variant="primary"
  leftIcon={<Icon name="check" />}
  onMainClick={save}
  onMenuClick={() => setMenuOpen(true)}
  menuLabel="저장 옵션"
>
  저장
</SplitButton>

// 필터 적용 + 필터 편집
<SplitButton
  variant="outline"
  onMainClick={applyLastFilter}
  onMenuClick={openFilterMenu}
  menuLabel="필터 편집"
>
  최근 필터
</SplitButton>
```
