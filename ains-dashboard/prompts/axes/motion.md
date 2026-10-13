# Motion

### 원칙
애니메이션의 **성격**을 결정 — duration, easing, 이동 거리 3요소를 세트로 스왑.
컴포넌트의 모든 애니는 모션 토큰 또는 프리미티브 경유. 하드코딩 금지.

### Do
- 프로젝트 성격에 맞춰 하나 선택. 화면마다 다르게 쓰지 않는다.
- 컴포넌트의 모든 트랜지션/애니메이션은 `--duration-*` 토큰 또는 모션 프리미티브 경유.
- 인터랙티브 컴포넌트(hover/press/focus)는 반드시 `--transition-colors` / `--transition-ring` / `--transition-press` 3종 시맨틱 프리셋 조합만 사용.
- `prefers-reduced-motion: reduce`가 오면 축 값과 무관하게 즉시 정지.

### Don't
- `transition-duration`이나 `animation-duration`에 밀리초 하드코딩 금지.
- 두 개 이상 프리미티브를 겹치지 않는다 (예외: 오버레이는 fade+scale 조합만 허용).
- `motion=none`이라도 스피너·프로그레스는 예외적으로 동작 유지 (기능성 우선).

### Fallback
`standard`

### 값
- `bouncy` — 크고 오래(400ms 기본). Spring easing. 브랜드·마케팅·온보딩.
- `standard` — 표준(200ms). Ease-out. 일반 웹 UI.
- `calm` — 짧고 은은(100ms). Linear. 관리 도구·데이터 대시보드.
- `none` — 즉시(0ms). 접근성 우선·저사양·정적 프리뷰.

### 기본값
`standard`

### 페어링
- `bouncy` + [[axes/shape]] `soft` — 부드러운 촉감 + 표현력 있는 모션
- `calm` + [[axes/shape]] `crisp` — 신뢰·전문 인상 + 절제된 모션
- `calm` + [[axes/density]] `compact` — 밀도 높은 화면에서 모션 이동 거리도 자동 축소
- `none` — `prefers-reduced-motion: reduce` 사용자에게 강제 (다른 축 값과 무관, [[PRINCIPLES]] §5)

### 인터랙션 트랜지션 시맨틱 프리셋
모든 인터랙티브 컴포넌트(Button/IconButton/MenuItem/Input/Tabs 등)의 hover/press/focus는 아래 3종을 조합해서 사용. 컴포넌트가 `transition` 속성에 duration·easing을 직접 적지 않는다.

- `--transition-colors` — background/color/border-color, `slow` + `ease-out`. hover가 스르륵 물듦 (소음 최소).
- `--transition-ring` — box-shadow(focus ring), `fast` + `ease-out`. 키보드 사용자에게 즉각 피드백.
- `--transition-press` — transform(press), `base` + `ease-out`. 진입·해제 대칭.

```css
.root {
  transition: var(--transition-colors), var(--transition-ring), var(--transition-press);
}
```

색이 안 변하면 `--transition-colors` 생략, press가 없으면 `--transition-press` 생략 — 필요한 프리셋만 조합. 값 튜닝은 globals.css의 토큰 정의에서만 (컴포넌트에서 override 금지).

### 플로팅 서페이스 In/Out — `.m-float` 유틸 강제
Tooltip · ContextMenu · DropdownMenu · Select · Popover · DatePicker · HoverCard 등 **떠오르는 표면(overlay/popover)은 예외 없이** globals.css의 전역 유틸 `.m-float`을 사용한다. 컴포넌트별로 자체 keyframe(`dp-emerge`, `menu-in` 등)이나 자체 `animation:` 규칙을 만들지 않는다.

**적용법 (Radix 기반):**
```tsx
<Radix.Content
  className={[styles.content, "m-float"].filter(Boolean).join(" ")}
  {/* ... */}
/>
```

**작동 원리:**
- `data-state`(`open`|`closed`|`delayed-open`) × `data-side`(`top`|`bottom`|`left`|`right`) 조합으로 자동 매칭.
- open은 앵커 반대편에서 자라남 (`--duration-base` + `--ease-emphasized`).
- close는 앵커 쪽으로 되감김 (`--duration-fast` + `--ease-in`, 이동량 절반).
- `prefers-reduced-motion: reduce`면 자동 정지.

**왜 전역 유틸인가:**
Turbopack CSS Modules는 컴포넌트 CSS 안의 `animation: <name>` shorthand에서 keyframe identifier를 hash로 rewrite한다 → globals.css의 전역 `@keyframes m-emerge-*`가 매칭 실패. `.m-float` 규칙 자체를 globals.css에 두어 스코핑을 회피하면 컴포넌트는 클래스 문자열만 붙이면 된다.

**Don't:**
- 컴포넌트 CSS에 `@keyframes` 새로 만들어 오버레이 등장 애니메이션 정의.
- 오버레이 Content에 `animation:` 또는 `animation-*` 재정의.
- `data-state="closed"` 애니메이션 생략 (인·아웃 대칭이 원칙).

### 관련
- [[primitives/fade]] · [[primitives/emerge]] · [[primitives/recede]] — Motion 축이 파라미터를 스왑, `.m-float`이 side별 매핑
