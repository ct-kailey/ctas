# DropdownMenu

### 원칙
버튼 클릭(또는 Enter/Space)으로 열리는 **트리거 중심 액션·옵션 메뉴**. 모델 전환, 뷰 전환, 유저 메뉴, 리스트 행의 ⋯ 메뉴처럼 "이 버튼을 눌러서 선택지 중 하나를 고른다"에 쓴다. [[components/context-menu]]와 트리거 방식만 다르고 Content 이하(Item·CheckboxItem·RadioItem·Sub) 시각·슬롯·상태는 전부 동일 — 두 컴포넌트는 같은 `.surface`와 [[components/menu-item]] 어댑터를 공유한다. Radix `@radix-ui/react-dropdown-menu` 위에 얹은 compound 어댑터.

### Do
- **트리거는 명확한 버튼**: 모델 셀렉터·"더 보기 ⋯"·유저 아바타처럼 눌러서 메뉴가 열림을 암시하는 요소. caret 아이콘·⋯ 아이콘을 붙이면 발견성↑.
- **`asChild`로 트리거 위임**: `<DropdownMenu.Trigger asChild>`로 Button·IconButton·IdentityButton 어느 것이든 트리거로. 자체 button 중첩되지 않도록 반드시 `asChild`.
- **값 선택 vs 액션 발사**: 값 선택이 폼의 일부고 label·description·invalid가 붙어야 하면 [[components/select]]를 쓸 것. 그 외(명령 발화·토글·배타 옵션 선택)는 DropdownMenu.
- **논리 그룹화**: 관련 액션끼리 묶고 `Separator`로 분리. 파괴적 액션은 맨 아래, `variant="destructive"`.
- **키보드는 Radix에 맡김**: 화살표·Home/End·타이핑 서치·Esc·Tab 이미 처리됨. 자체 키 핸들러 금지.
- **선택 후 자동 닫힘 활용**: `onSelect`가 발화하면 Radix가 자동 닫음. 다중 토글처럼 열림 유지가 필요하면 `e.preventDefault()`.
- **상태 아이템**: 토글은 `CheckboxItem`, 배타 선택은 `RadioGroup` + `RadioItem`. 인디케이터는 자동.
- **중첩은 `Sub` 트리오**: `Sub` / `SubTrigger` / `SubContent`.
- **단축키는 실제 심볼**: `⌘K` · `⇧⌘P` · `⌫`. uppercase 금지 — [[feedback_no_uppercase]].
- **아이콘은 액션 의미와 정확히 일치할 때만 붙인다.** 어긋나면 라벨만 둬도 좋다. 유효한 아이콘 이름은 [[web/components/Icon/Icon.tsx]]에 있는 세트에서만 — 없는 이름 지어내지 말 것(렌더 실패).
- **라벨은 짧게 — 한글 8–12자 · 영문 12–20자 이내.** 폭은 표준 224px이고 최대 한 스텝(+48px)만 넓어진다.

### Don't
- 폼 필드 자리에 DropdownMenu를 쓰지 말 것. label·description·invalid·필드 폭 통일이 필요하면 [[components/select]].
- 핵심 CTA를 메뉴 안에 숨기지 말 것. 자주 쓰는 액션은 메뉴 밖 버튼으로.
- 한 메뉴에 12개 이상 아이템 금지 — 넘치면 `Sub`로 접기.
- **긴 라벨 두 줄 금지.** `white-space: nowrap` + 표준 폭이 시각 계약. 짧게 못 쓰면 라벨 자체를 재설계.
- Trigger에 button을 중첩하지 말 것 — `<button><Button /></button>` 되지 않도록 `asChild` 사용.
- 시각 위해 Content에 hard-coded 색·radius·shadow 얹지 말 것. 토큰 경유 ([[PRINCIPLES]] §6).
- Radix 포지셔닝을 뒤흔들지 말 것 (Content `position: fixed`/`transform` 강제 금지). `collisionPadding`·`side`·`align`·`sideOffset`만 조절.

### Fallback
size 애매하면 `md`. Item variant 애매하면 `default`. 선택 상태가 폼 값이면 [[components/select]]로 넘길 것.

### 관련
- [[components/menu-item]] — 시각·슬롯·상태 규칙의 원본. DropdownMenu는 이 위에 얇게 얹은 어댑터.
- [[components/context-menu]] — 트리거만 다름(우클릭 vs 클릭). Content 이하는 동일 패턴 공유.
- [[components/select]] — 폼 필드로서의 "선택" UI. form-field trigger가 필요하면 이쪽.
- [[components/icon-button]] — 케밥(⋮)·미트볼(⋯) 트리거.
- [[components/alert-dialog]] — 파괴적 액션 확인은 여기.
- [[axes/shape]] · [[axes/density]] — Content radius·아이템 min-height가 반응.
- [[tokens/color]] — `--bg` · `--border` · `--shadow-lg` · `--hover`가 시각.

### Props 시그니처
```tsx
<DropdownMenu>                               // Radix Root — open/onOpenChange/modal 전부 통과
  <DropdownMenu.Trigger asChild>             // 클릭·Enter·Space 트리거
    <Button>...</Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content
    size="sm | md"                           // default: md
    side="top | right | bottom | left"       // Radix default: bottom
    align="start | center | end"             // default: center
    sideOffset={6}                           // default: 6
    collisionPadding={8}                     // default: 8
  >
    <DropdownMenu.Label>...</DropdownMenu.Label>
    <DropdownMenu.Item
      size="sm | md"
      variant="default | destructive"
      leadingActions={MenuItemAction[]}
      trailingActions={MenuItemAction[]}
      shortcut="⌘C"
      disabled={boolean}
      onSelect={(e) => void}
    >
      ...
    </DropdownMenu.Item>
    <DropdownMenu.CheckboxItem
      checked={boolean | "indeterminate"}
      onCheckedChange={(v) => void}
    />
    <DropdownMenu.RadioGroup value onValueChange>
      <DropdownMenu.RadioItem value="..." />
    </DropdownMenu.RadioGroup>
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>...</DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>...</DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    <DropdownMenu.Separator />
  </DropdownMenu.Content>
</DropdownMenu>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| 열림 · 닫힘 | Content in/out은 전역 `.m-float` 유틸. 자체 애니메이션 재정의 금지. |
| 아이템 highlight | `--hover` 배경, `fg-strong` — MenuItem 규칙 그대로 |
| checked (Checkbox) | leading 맨 앞 checkmark 자동 |
| checked (Radio) | leading 맨 앞 dot 인디케이터 |
| disabled | `fg-disabled`, 커서 not-allowed, 키보드 순환 제외 |
| destructive · hover | 배경 destructive 8%, 텍스트·아이콘 destructive |

### Size 가이드
| size | 언제 |
|---|---|
| `sm` | 밀도 높은 관리 UI · 툴바 메뉴 |
| `md` | **기본.** 일반 드롭다운 |

### 조합 예시
```tsx
// ChatInput 모델 셀렉터
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <ModelSelector label="Llama" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" size="sm">
    <DropdownMenu.RadioGroup value={model} onValueChange={setModel}>
      <DropdownMenu.RadioItem value="llama">Llama</DropdownMenu.RadioItem>
      <DropdownMenu.RadioItem value="claude">Claude</DropdownMenu.RadioItem>
      <DropdownMenu.RadioItem value="gpt">GPT</DropdownMenu.RadioItem>
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu>

// 리스트 행의 ⋯ 메뉴
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <IconButton icon="dots-three" aria-label="더 보기" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Item shortcut="⌘E" onSelect={rename}>이름 변경</DropdownMenu.Item>
    <DropdownMenu.Item shortcut="⌘D" onSelect={duplicate}>복제</DropdownMenu.Item>
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="destructive" shortcut="⌫" onSelect={remove}>삭제</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu>

// 유저 아바타 메뉴 — Label + 중첩
<DropdownMenu>
  <DropdownMenu.Trigger asChild>
    <IdentityButton avatar={...} />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Label>Signed in as hehe@...</DropdownMenu.Label>
    <DropdownMenu.Item onSelect={profile}>프로필</DropdownMenu.Item>
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger>테마</DropdownMenu.SubTrigger>
      <DropdownMenu.SubContent>
        <DropdownMenu.Item onSelect={() => setTheme("light")}>라이트</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => setTheme("dark")}>다크</DropdownMenu.Item>
      </DropdownMenu.SubContent>
    </DropdownMenu.Sub>
    <DropdownMenu.Separator />
    <DropdownMenu.Item variant="destructive" onSelect={signOut}>로그아웃</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu>
```
