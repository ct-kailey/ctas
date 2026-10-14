# CommandPalette

### 원칙
⌘K로 열리는 **전역 명령·검색 창**. 페이지 이동과 자주 쓰는 액션을 키보드만으로 끝내는 자리. 사이드바·메뉴·설정을 뒤지지 않고 "이름으로 바로 간다". VSCode·Linear·Notion·Figma가 공유하는 관용. CTDS는 쉘(Radix Dialog)·검색/필터/네비(cmdk)·시각(MenuItem)을 **얇게 묶은 어댑터**. 상호작용·접근성·fuzzy 매칭은 라이브러리에 맡기고, CTDS는 스킨과 API 다듬기에 집중한다. [[components/context-menu]]·[[components/dropdown-menu]]와 같은 메뉴 패밀리 — 아이템 시각 규칙은 [[components/menu-item]] 하나로 수렴.

### Do
- **데이터·관리 UI에선 거의 필수로 넣는다.** 페이지 수가 10개 넘고 액션이 반복될수록 ⌘K 하나로 사용자 숙련도의 천장이 올라간다. 콘텐츠 사이트에선 선택적.
- **두 종류를 섞는다 — 페이지 이동 + 액션.** 그룹 heading으로 명시 분리하면 사용자는 "어디로 갈까"와 "뭘 할까"를 같은 입구에서 결정한다.
- **라벨은 동사·명사 짧게.** 리스트 폭이 넓긴 하지만 한 줄에 자연스레 읽히는 길이로. "선택한 항목을 휴지통으로 이동" 같은 문장형 금지 — 동사 하나로 압축.
- **아이콘은 의미가 명확할 때만**. [[components/context-menu]]와 같은 규칙 — 억지 아이콘보다 라벨만 두는 게 낫다. 아이콘 이름은 [[web/components/Icon/Icon.tsx]] 세트에서만.
- **단축키는 실제 심볼로 표시.** `⌘N` · `⇧⌘P` · `⌫`. uppercase 금지 — [[feedback_no_uppercase]].
- **선택 후 자동 닫힘.** `onSelect` 안에서 라우팅/액션을 실행한 다음 `onOpenChange(false)`를 명시적으로 호출. cmdk는 자동으로 닫지 않는다.
- **열기는 Hook으로 위임.** `useCommandPaletteHotkey(() => setOpen((v) => !v))` 한 줄이면 ⌘K/Ctrl+K가 어디서든 토글된다. 입력 중에도 발화 — 검색은 어디서나 열려야.
- **Empty state는 꼭 넣는다.** 결과 0일 때 그냥 사라지면 사용자는 "뭐가 잘못됐나" 혼란. 짧은 한 줄로 "결과 없음" 명시, 필요하면 "다른 검색어" 유도.
- **최근 사용·즐겨찾기는 상단 그룹**. 입력이 비었을 때만 노출. 입력이 생기면 그 그룹은 숨기거나 가중치 낮게.
- **그룹은 3~5개 이하로.** 더 많으면 스캐닝이 무너진다. "페이지 / 액션 / 설정" 정도가 상한.

### Don't
- **핵심 플로우를 ⌘K 뒤에만 두지 말 것.** 신규 가입·결제 같은 CTA는 눈에 보이는 자리에. 팔레트는 **알고 있는 사용자용 지름길**이지 발견 입구가 아니다.
- 아이템에 큰 썸네일·멀티라인 설명 금지. 리스트 밀도가 핵심 — 설명이 필요하면 `description` prop 한 줄까지. 그보다 길면 결과 페이지로.
- 트리거 버튼을 "Open Palette"라고 라벨 붙이지 말 것. 사용자는 그 용어를 모른다. **「검색…」 + ⌘K 힌트**가 관용.
- 열림 상태로 영구 고정 금지 (`defaultOpen` 패턴 등). 팔레트는 **임시 입구** — 상주하는 UI는 사이드바·툴바.
- Modal과 혼용 금지. 결정·입력 다이얼로그는 [[components/modal]], 전역 명령 검색은 Palette. 서로 포커스 레벨이 다르다.
- 색·radius·shadow 하드코딩 금지 — [[feedback_no_hardcoded_values]]. 쉘 시각은 CommandPalette CSS가 토큰 경유로 이미 처리.

### Fallback
size 애매하면 `md`. 그룹 분류 애매하면 "액션" 하나로. 트리거 UI 애매하면 상단 툴바의 **"검색… ⌘K" 버튼** — Button `variant="outline"` + `leftIcon={<Icon name="search" />}` + `rightIcon={<Shortcut>⌘K</Shortcut>}`.

### 관련
- [[components/menu-item]] — 아이템 시각·슬롯·active 규칙의 원본. CommandPalette.Item은 이 위에 cmdk `data-selected`를 매핑.
- [[components/modal]] — 쉘 상호작용 비교군. Modal은 바깥 클릭 안 닫힘·중앙 배치, Palette는 바깥 클릭 닫힘·상단 배치.
- [[components/dropdown-menu]] · [[components/context-menu]] — 같은 메뉴 패밀리. 트리거만 다름(클릭 vs 우클릭 vs 전역 단축키).
- [[components/shortcut]] — ⌘K 힌트는 Shortcut 컴포넌트로.
- [[components/input]] — Palette의 Input은 전용 스타일. 일반 폼 Input과 섞지 말 것.
- [[tokens/color]] · [[tokens/shadow]] — `--bg` · `--border` · `--shadow-xl` · `--scrim`이 쉘 시각을 만든다.

### Props 시그니처
```tsx
<CommandPalette
  open={boolean}
  onOpenChange={(open: boolean) => void}
  size="sm | md"                            // default: md — 아이템 기본 size
  label="명령 검색"                           // 스크린리더용. 다이얼로그 접근성 네임
>
  <CommandPalette.Input
    placeholder="검색..."
    leadingIcon="search | IconName | null"  // default: search
  />
  <CommandPalette.List>
    <CommandPalette.Empty>결과가 없어요</CommandPalette.Empty>

    <CommandPalette.Group heading="페이지">
      <CommandPalette.Item
        leadingIcon="house"                 // 또는 leadingActions={[...]}
        shortcut="⌘,"
        description="보조 설명 한 줄"
        disabled={boolean}
        onSelect={() => void}               // 자동 닫힘 ❌ — 안에서 onOpenChange(false) 명시
      >
        대시보드
      </CommandPalette.Item>
    </CommandPalette.Group>

    <CommandPalette.Separator />

    <CommandPalette.Group heading="액션">...</CommandPalette.Group>
  </CommandPalette.List>
</CommandPalette>

// 전역 단축키 Hook
useCommandPaletteHotkey(
  () => setOpen((v) => !v),
  { key: "k", mod: true, shift: false, alt: false, disabled: false },
);
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| 열림 · 닫힘 | 쉘은 Radix Dialog 애니메이션(scale 0.98→1 + fade). 상단 20vh 고정 배치. |
| 아이템 highlight (↑↓·마우스) | cmdk `[data-selected="true"]` → MenuItem fill 스타일(`--hover` 배경 + `fg-strong`) 자동 매핑 |
| 입력 필터링 | cmdk fuzzy 매칭. 매치되는 아이템만 표시, 그룹 heading은 매치된 아이템이 있을 때만 노출 |
| Empty | 매치 0일 때 `Empty` children 렌더 — 다른 아이템 전부 숨김 |
| disabled 아이템 | `fg-disabled` + 선택/엔터 모두 꺼짐 (cmdk + MenuItem 공통 처리) |

### Size 가이드
| size | 언제 |
|---|---|
| `sm` | 밀도 높은 관리 UI · 결과가 많이 나와야 할 때 |
| `md` | **기본.** 일반 ⌘K |

### 조합 예시
```tsx
// 기본 — 페이지 + 액션 두 그룹
const [open, setOpen] = useState(false);
const router = useRouter();
useCommandPaletteHotkey(() => setOpen((v) => !v));

function go(path: string) {
  router.push(path);
  setOpen(false);
}

<CommandPalette open={open} onOpenChange={setOpen}>
  <CommandPalette.Input placeholder="검색 또는 명령어 입력" />
  <CommandPalette.List>
    <CommandPalette.Empty>결과가 없어요</CommandPalette.Empty>
    <CommandPalette.Group heading="페이지">
      <CommandPalette.Item leadingIcon="house" onSelect={() => go("/dashboard")}>
        대시보드
      </CommandPalette.Item>
      <CommandPalette.Item leadingIcon="gear" shortcut="⌘," onSelect={() => go("/settings")}>
        설정
      </CommandPalette.Item>
    </CommandPalette.Group>
    <CommandPalette.Separator />
    <CommandPalette.Group heading="액션">
      <CommandPalette.Item leadingIcon="plus" shortcut="⌘N" onSelect={newDoc}>
        새 문서
      </CommandPalette.Item>
    </CommandPalette.Group>
  </CommandPalette.List>
</CommandPalette>

// 상단 툴바 트리거 — 「검색… ⌘K」 관용
<Button
  variant="outline" size="sm"
  leftIcon={<Icon name="search" />}
  rightIcon={<Shortcut>⌘K</Shortcut>}
  onClick={() => setOpen(true)}
>
  검색
</Button>

// 최근 사용 — 입력이 비었을 때만
<CommandPalette.List>
  {query === "" && (
    <CommandPalette.Group heading="최근">
      {recents.map((r) => (
        <CommandPalette.Item key={r.id} leadingIcon="clock" onSelect={() => go(r.href)}>
          {r.label}
        </CommandPalette.Item>
      ))}
    </CommandPalette.Group>
  )}
  <CommandPalette.Group heading="페이지">...</CommandPalette.Group>
</CommandPalette.List>
```
