# IconButton

### 원칙
아이콘만 있는 버튼. **좁은 자리의 액션 전용** — 툴바, 테이블 행 액션, 플로팅 액션, Input의 trailing 등. [[components/button]]의 icon-only 모드와 **용도 중복**이지만 IconButton은 **크기 체계가 한 단계 작음** (Button sm = IconButton md). 좁은 자리의 밀도용. `aria-label` 필수.

### Do
- `aria-label` 반드시 지정. 아이콘은 글자가 아님.
- 툴바·테이블 행 action: `size="md"` + `variant="ghost"`가 표준.
- 플로팅 액션: `size="lg"` + `variant="secondary"`.
- `trailingIcon`을 넣으면 자동 **dual 모드**(정사각 → 가로형 2-슬롯). caret-down 등 보조 아이콘 자리.
- `asChild`로 `<a>` 또는 Next `<Link>` 위임 가능 (이땐 아이콘·trailingIcon은 자식이 담당).

### Don't
- 라벨이 필요하면 쓰지 않는다 — [[components/button]] icon-only 모드로.
- Button과 같은 size 이름이라도 실제 크기 다르니 **같은 툴바에서 섞을 땐 매핑 확인**: IconButton md(24) ↔ Button sm(28), IconButton lg(32) ↔ Button md(32).
- aria-label 생략 금지. 아이콘 의미가 자명해도 스크린리더엔 안 보임.
- 색을 variant로 override하지 않는다 — destructive 외의 상태색은 Badge/Callout 쪽.

### Fallback
size 애매하면 `md`, variant 애매하면 `ghost`.

### 관련
- [[components/button]] — 라벨 있는 버튼 또는 Button의 icon-only 모드 (신규 권장)
- [[components/icon]] — 안에 들어가는 아이콘
- [[components/toolbar]] — 가장 많이 쓰는 자리
- [[components/tooltip]] — aria-label 보충 설명 (hover 시 라벨 노출)
- [[axes/density]] — `--iconbtn-h-*`가 Density에 반응
- [[axes/shape]] — radius가 Shape 축에 반응

### Props 시그니처
```tsx
<IconButton
  icon={<Icon name="..." />}                   // asChild=true면 무시
  trailingIcon={<Icon name="caret-down" />}    // 있으면 dual 모드
  size="sm | md | lg"                          // default: md (Button sm 상당)
  variant="secondary | outline | ghost | destructive"  // default: ghost
  asChild={boolean}                            // Radix Slot — <a>/<Link> 위임
  aria-label="필수"
  disabled={boolean}
  onClick={(e) => void}
/>
```

### Size × Button 매핑
| IconButton size | 높이 | Button 대응 | 쓰임 |
|---|---|---|---|
| `sm` | 20 | — (xs 수준) | 인라인·초밀도. 거의 안 씀 |
| `md` | 24 | Button `sm`(32)과 짝 | **기본** — 툴바·테이블 행·Input trailing |
| `lg` | 32 | Button `md`(36)과 짝 | 플로팅 액션·주 액션 |

### Variant 매트릭스
| variant | 시각 | 쓰임 |
|---|---|---|
| `secondary` | primary 8% 배경 + primary 아이콘 | 강조가 필요한 플로팅 |
| `outline` | 투명 배경 + border | 툴바 그룹의 그룹핑 |
| `ghost` | 완전 투명, hover만 반응 | **기본** — 밀도 자리 |
| `destructive` | 평상시 ghost, hover 시 destructive 톤 | 삭제·제거 |

### 조합 예시
```tsx
// 툴바 — ghost md 나열
<Toolbar>
  <IconButton icon={<Icon name="pencil-simple" />} aria-label="수정" />
  <IconButton icon={<Icon name="copy" />} aria-label="복제" />
  <IconButton icon={<Icon name="trash" />} aria-label="삭제" variant="destructive" />
</Toolbar>

// Dual 모드 — 드롭다운 트리거
<IconButton
  icon={<Icon name="user" />}
  trailingIcon={<Icon name="caret-down" />}
  aria-label="사용자 메뉴"
  variant="outline"
/>

// asChild — Next Link 위임
<IconButton asChild size="md" variant="ghost" aria-label="깃허브">
  <a href="https://github.com/..." target="_blank" rel="noreferrer">
    <Icon name="github-logo" />
  </a>
</IconButton>
```
