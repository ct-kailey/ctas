# Pagination

### 원칙

긴 목록·테이블을 페이지 단위로 끊어 탐색시키는 nav 컨트롤. **하나의 컴포넌트가 variant로 세 가지 유즈케이스**(numbered / compact / jump)를 커버한다 — `DateRangePicker`처럼 분화된 컴포넌트를 만들지 않는다. prop 조합이 컴포넌트 분화보다 예측 가능성이 높다.

### Do

- **기본은 `size="md"`**. Pagination은 테이블 하단·관리 UI처럼 데이터 밀도 높은 자리에 가장 자주 들어가므로 md가 기본. 폼이나 일반 페이지의 긴 리스트에선 `lg`. (md는 내부적으로 Button sm을, lg는 Button md를 쓴다 — Button보다 한 단계 압축된 체계.)
- 현재 페이지는 **`variant="secondary"`로 표시**. primary 8% 알파 배경 + primary 텍스트. 페이지 안의 다른 primary 액션(저장·제출)과 시각 위계가 겹치지 않는다.
- 숫자 아이템은 **Button을 재사용**한다 — 라벨이 있으므로 Button이 맞다. `className`으로 `min-width`만 정사각 보정.
- prev/next·처음/끝 아이콘 아이템은 **IconButton을 재사용**한다 — Button을 icon-only로 쓰면 가로 패딩이 남아 정사각이 안 떨어진다. 사이즈 매핑은 `Pagination size=md → IconButton md`, `Pagination size=lg → IconButton lg` (width/height만 Pagination 내부 CSS에서 Button height와 일치시킴). 전부 `variant="ghost"` + `aria-label` 필수.
- 긴 목록(≥ 10쪽)에는 `variant="numbered"` 또는 `jump` 사용. 숫자 영역은 **현재 페이지 중심의 슬라이딩 윈도우** — 생략(…)이나 양 끝 고정 숫자를 쓰지 않는다. `windowSize`(5~10, 기본 5)로 보이는 숫자 개수만 조절.
- **prev/next는 "보이는 윈도우의 끝 숫자"로 점프**한다 (±1 아님). 예: `1 2 (3) 4 5`에서 next → 5, `1 2 3 4 (5) 6 7 8 9 10`에서 next → 10. 사용자가 이미 보이는 숫자 중 하나로 바로 점프해 윈도우를 통째로 넘길 수 있다. compact(숫자 윈도우 없음)에선 기존 ±1 유지.
- 테이블 하단의 좁은 상태 자리엔 `variant="compact"` — `"3/24"` 또는 커스텀 포맷터. prev/next와 숫자가 하나의 블록처럼 밀착(gap=0).
- 값은 1-indexed(`page=1`이 첫 페이지). controlled만 지원 — `page` + `onChange` 세트로 다룬다.

### Don't

- 현재 페이지를 `variant="primary"`로 쓰지 않는다 — 페이지의 "진짜" primary 액션과 시각 위계가 충돌한다.
- 전체 페이지 수가 1 이하일 때 Pagination을 숨긴다. 비활성 상태로 노출하지 않는다 (의미 없는 노이즈).
- 숫자 버튼에 `size` prop을 직접 섞어 쓰지 않는다. 한 Pagination 안의 모든 아이템은 같은 size.
- 커스텀 CSS로 Button 색/높이를 덮지 않는다. 모든 시각 조정은 Button variant/size 경유.
- 생략(…) 셀이나 "첫/끝 페이지 고정 노출" 패턴(`1 … 5 6 7 … 100`)을 되살리지 않는다. 숫자 영역은 **항상 연속된 슬라이딩 윈도우**다. 중간을 건너뛰고 싶으면 `jump` variant의 처음/끝 아이콘 버튼이 그 역할.
- disabled 시 숫자 Button을 Button 기본 disabled 스타일(회색 배경)로 두지 않는다. **배경 투명 + 숫자 색만 `--fg-disabled`로 연해져야** 밀집 자리에서 밑 배경을 가리지 않는다. Pagination.module.css에서 `.list .numberBtn*:disabled` 셀렉터로 덮어씀 — IconButton ghost disabled와 톤 일치.

### Fallback

variant 애매하면 `numbered`. 좁은 자리/모바일인데 variant 지정이 없으면 `simple`. 전체 페이지 수 모를 땐 `compact`로 "현재 페이지"만 표시.

### 관련

- [[components/button]] — 숫자·prev·next·처음/끝 아이템은 전부 Button 재사용. 사이즈·variant 체계 공유.
- [[components/table-row]] — 데이터 테이블 하단에 가장 자주 짝지어 놓는다. compact variant가 흔히 테이블 푸터에 들어감.
- [[axes/density]] — 버튼 높이가 `--control-h-md` 경유로 Density 축에 반응.
- [[axes/shape]] — radius가 Shape 축에 반응.
- [[tokens/color]] — 현재 페이지의 배경·텍스트는 `--secondary-bg` / `--secondary-fg` 경유.

### Props 시그니처

```tsx
<Pagination
  variant="numbered | compact | jump"             // default: "numbered"
  size="md | lg"                                  // default: "md"
  page={number}                                   // 1-indexed, controlled
  total={number}                                  // 전체 페이지 수
  onChange={(page: number) => void}

  windowSize={number}                             // default: 5. 5~10 범위, 자동 클램프

  disabled={boolean}
  compactFormatter={(page, total) => ReactNode}   // compact variant 전용
  aria-label={string}
/>
```

### Variant 매트릭스

| variant | 용도 | 금지 조합 |
|---|---|---|
| `numbered` | 10쪽 이상 긴 목록의 표준. 현재 페이지 중심 슬라이딩 윈도우 + prev/next | 모바일 좁은 자리에서는 가로가 넘침 → `compact` |
| `compact` | 테이블 하단, 밀도 높은 상태 영역. `"3/24"`. prev/next와 숫자가 밀착한 블록. | 사용자가 임의 페이지로 점프해야 하는 자리 (숫자 클릭 불가) |
| `jump` | 매우 긴 아카이브·검색 결과. 처음·끝 포함 full nav | 전체 페이지 수가 적을 때(≤ 5)엔 과잉 |

### 조합 예시

```tsx
// 데이터 테이블 하단: 밀집 자리에 compact
<Pagination
  variant="compact"
  page={page}
  total={totalPages}
  onChange={setPage}
/>

// 긴 검색 결과: numbered가 표준
<Pagination
  variant="numbered"
  page={page}
  total={120}
  onChange={setPage}
/>

// 아카이브: 처음·끝까지 한 번에, 윈도우 10개
<Pagination
  variant="jump"
  page={page}
  total={320}
  windowSize={10}
  onChange={setPage}
/>
```
