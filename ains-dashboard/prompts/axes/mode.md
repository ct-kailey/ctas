# Mode

### 원칙
전체 배경·전경·그림자의 명도를 결정하는 축. OS 선호와 콘텐츠 성격 반영.

### Do
- 첫 진입 시 OS `prefers-color-scheme`을 존중한다.
- 데이터 밀도가 높은 대시보드/관리도구는 `dark` 기본 검토 (장시간 응시 완화).
- `mode`만 스왑해도 시각적 완성도가 유지되도록 semantic 토큰만 참조한다.

### Don't
- 특정 mode에만 존재하는 컴포넌트 만들지 않는다. 모든 컴포넌트가 두 mode 지원.
- 순백(`#fff`)·순흑을 직접 지정하지 않는다. 항상 `--bg` 경유.

### Fallback
지정 없으면 `light`. OS 힌트 있으면 그 값.

### 값
- `light` — 밝은 배경, 어두운 텍스트. 일반 웹 UI 기본.
- `dark` — 어두운 배경, 밝은 텍스트. 야간·장시간 응시·대시보드.

### 접근성 — 하이콘트라스트
OS 하이콘트라스트 모드(macOS Increase Contrast · Windows High Contrast)를 켠 사용자는 `@media (prefers-contrast: more)`로 자동 처리 — border alpha + muted fg를 상향해 WCAG AA 선을 넘긴다. 축 값이 아니라 토큰 override라, 컴포넌트는 변경 없이 자동 적용. 테스트: Chrome DevTools "Emulate CSS prefers-contrast: more" 또는 OS 설정 토글.

### 기본값
`light`

### 국소 스코프 (라이트 페이지 안의 어두운 영역)
라이트 모드 페이지 내에서 특정 영역만 다크로 뒤집고 싶을 때 (예: 이미지 위 오버레이, 어두운 카드/배너, 검정 툴바 위 IconButton) — 해당 컨테이너에 `data-mode="dark"`를 그대로 씌운다. `--bg`·`--fg`·`--border`·`--shadow` 등 시맨틱 토큰이 서브트리 안에서 다크 값으로 자동 반전되므로, 안쪽 컴포넌트는 별도 tone/inverse prop 없이 기존 토큰만 참조하면 된다.

```tsx
<div data-mode="dark" style={{ background: 'var(--bg)', padding: 'var(--space-4)' }}>
  <IconButton icon="close" />   {/* --fg가 밝은 값으로 자동 반전 */}
</div>
```

### Do (국소 스코프)
- 어두운 표면 위에 컴포넌트를 얹을 때는 컨테이너를 `data-mode="dark"`로 감싸고, 배경은 반드시 `var(--bg)` 또는 `var(--bg-subtle/muted)`로 지정한다 (컨테이너 자체가 반전된 토큰을 사용해야 안쪽과 일관).
- 국소 스코프는 palette·shape 등 다른 축은 상속받고 Mode만 바꾼다.

### Don't (국소 스코프)
- 컴포넌트에 `tone="inverse"`·`variant="onDark"` 같은 prop을 새로 만들지 않는다. 컨텍스트가 스타일을 결정한다.
- 컨테이너 배경을 `#000`·`black`·하드코딩 hex로 지정하지 않는다. `var(--bg)` 경유.
- 현재는 **다크 방향 반전만 지원**한다 (다크 페이지 안에 라이트 영역을 뚫는 `data-mode="light"` 국소 스코프는 미지원 — 필요해지면 별도 논의).

### 페어링
- `dark` + [[axes/density]] `compact` — 장시간 응시 대시보드 표준 조합
- `high-contrast` — 다른 축과 무관하게 접근성 우선 ([[PRINCIPLES]] §5)
- 특정 Mode + Palette 조합 제한 없음. 모든 Palette가 두 Mode 모두 지원해야 함

### 관련
- [[tokens/color]] — Mode가 스왑하는 semantic 컬러
