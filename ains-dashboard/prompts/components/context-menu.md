# ContextMenu

### 원칙
우클릭·롱프레스로 열리는 **한 객체에 대한 2차 액션 메뉴**. 컨텐츠 상단 툴바나 상단 nav에 놓지 못한 부가 기능(잘라내기/복사/이름 변경/삭제/공유 등)이 여기 모인다. 시각·상태·슬롯은 [[components/menu-item]]이 이미 갖고 있으므로 ContextMenu는 그 위에 얹은 **얇은 어댑터** — 열림/닫힘·포커스 트랩·화살표 네비게이션·서브메뉴 안전지연·뷰포트 flip만 담당한다. Radix `@radix-ui/react-context-menu`를 감싼 compound 컴포넌트.

### Do
- **트리거는 객체를 감싼다**: 파일 아이템·캔버스 셀·리스트 행처럼 "이 메뉴가 걸리는 객체"의 시각 경계와 트리거 영역이 정확히 일치해야 한다. 애매하면 사용자가 어디에 대한 메뉴인지 모른다.
- **2차 액션만**: 핵심 CTA는 페이지 상단·인라인 버튼에. 컨텍스트 메뉴는 자주 쓰지 않지만 있을 때 반가운 옵션 자리.
- **논리 그룹화**: 관련된 액션끼리 묶고 `Separator`로 나눈다. 파괴적 액션은 항상 맨 아래 그룹, `variant="destructive"`.
- **키보드 접근 보장**: Radix가 화살표·Home/End·타이핑 서치·Esc·Tab을 이미 처리한다. 자체 키 핸들러를 얹지 말 것 — 충돌 원인.
- **선택 후 자동 닫힘 활용**: `onSelect`가 발화하면 Radix가 자동으로 닫는다. 계속 열려 있어야 하면 `e.preventDefault()` (예: 다중 체크박스 토글).
- **상태 있는 아이템**: 토글은 `CheckboxItem`, 배타 선택은 `RadioGroup` + `RadioItem`. 인디케이터(체크마크·dot)는 컴포넌트가 자동으로 그린다.
- **중첩은 `Sub` 트리오**: `Sub` / `SubTrigger` / `SubContent`. SubTrigger는 자동으로 `hasSubmenu` caret이 붙는다.
- **트리거 아이콘 힌트**: 리스트 행의 케밥(⋮)·미트볼(⋯) 아이콘으로 "메뉴가 있음"을 사전에 암시하면 발견성이 크게 오른다.
- **`asChild`로 임의 요소에 위임**: `<ContextMenu.Trigger asChild>`로 카드·이미지·행 어느 것이든 트리거로 만든다.
- **단축키는 실제 심볼**: `⌘K` · `⇧⌘P` · `⌫`. uppercase 금지 — [[feedback_no_uppercase]].
- **아이콘은 액션 의미와 정확히 일치할 때만 붙인다.** 아이콘 슬롯은 스캐닝 속도를 높이는 힌트인데 의미 어긋난 아이콘은 오히려 라벨 해석을 방해한다. 유효한 아이콘 이름은 [[web/components/Icon/Icon.tsx]]에 정의된 세트에서만 골라야 한다 — 없는 이름을 상상으로 지어내지 말 것(그 순간 렌더 실패). **적절한 매치가 없으면 아이콘을 붙이지 않고 라벨만 둔다.** 예: 잘라내기/붙여넣기는 우리 세트에 정확한 매치가 없으므로 라벨 + 단축키만으로 표현. 리스트 안에서 아이콘 있는 행과 없는 행이 섞여도 괜찮다 — 억지 아이콘보다 낫다.
  - 자주 쓰이는 안전 매핑: 열기 → `arrow-square-out` (외부로 나가는 화살표) · 문서 아이템 → `article` · 이름 변경/편집 → `pencil-simple` · 잘라내기 → `scissors` · 복사 → `copy` · 붙여넣기 → `clipboard-text` · 복제 → `copy-simple` (겹친 문서 = 같은 걸 하나 더) · 태그 → `tag` · 정보 → `info` · 삭제 → `trash` · 공유 → `share-network` (연결된 노드) · 방송/알림 뉘앙스 → `broadcast` · 이메일 → `envelope` · 메시지 → `chat-text` · 설정 → `gear` · 검색 → `search` · 즐겨찾기 → `star` · 새로 만들기 → `article` (문서) 또는 라벨만.
- **라벨은 짧게 — 한 줄에 자연스레 읽히는 길이(대략 한글 8–12자 · 영문 12–20자 이내).** ContextMenu 폭은 표준 224px로 고정되어 있고, 넘칠 땐 최대 한 스텝(+48px)만 늘어나며 그 뒤엔 잘린다. "선택한 항목을 휴지통으로 이동하고 30일 후 영구 삭제" 같은 문장형은 금지 — 동사 위주로 압축하고 세부 조건은 확인 다이얼로그로 넘긴다. 이 규칙은 매우 강한 권장 사항이며, 라벨을 짧게 만들 수 없으면 그 액션은 컨텍스트 메뉴 자리가 아니라는 신호다.

### Don't
- 핵심 플로우를 컨텍스트 메뉴 안으로 숨기지 말 것. "우클릭해야만 보이는" CTA는 발견 실패로 이어진다.
- 한 메뉴에 12개 이상 아이템 나열 금지 — 스캔이 무너지고 실수 클릭이 급증한다. 넘치면 `Sub`로 접기.
- **긴 라벨을 두 줄로 감싸지 말 것.** ContextMenu는 `white-space: nowrap` + 표준 폭(224px) 고정이 시각 계약. 두 줄 라벨은 리듬을 무너뜨리고 아이템 높이가 들쭉날쭉해진다. 짧게 못 쓰겠으면 라벨 자체를 재설계할 것.
- 서로 다른 객체에 대한 액션을 한 메뉴에 섞지 말 것 — 컨텍스트 = 하나의 대상.
- 시각을 위해 root · content에 hard-coded 색·radius·shadow를 얹지 말 것. 모두 토큰 경유 ([[PRINCIPLES]] §6, [[feedback_no_hardcoded_values]]).
- Radix의 포지셔닝을 뒤흔들지 말 것 (Content에 `position: fixed`/`transform` 강제 금지). `collisionPadding`만 조절.
- 트리거 위에서 `onContextMenu`를 자체 처리하지 말 것 — Radix가 이미 preventDefault로 브라우저 기본 메뉴를 눌러준다.

### Fallback
size 애매하면 `md`. Item variant 애매하면 `default`. 액션이 파괴적인지 확실치 않으면 destructive 대신 default + 확인 다이얼로그([[components/alert-dialog]]).

### 관련
- [[components/menu-item]] — 시각·슬롯·상태 규칙의 원본. ContextMenu는 이 위에 얇게 얹은 어댑터.
- [[components/dropdown-menu]] — 트리거만 다름(클릭 vs 우클릭). Content 이하는 거의 동일 패턴 공유.
- [[components/icon-button]] — 케밥(⋮)/미트볼(⋯) 트리거 아이콘. 발견성 힌트.
- [[components/alert-dialog]] — 파괴적 액션의 최종 확인은 여기.
- [[axes/shape]] · [[axes/density]] — Content radius·아이템 min-height가 이 축에 반응.
- [[tokens/color]] — `--bg` · `--border` · `--shadow-lg` · `--hover` 등이 시각을 만든다.

### Props 시그니처
```tsx
<ContextMenu>                              // Radix Root — open/onOpenChange 등 전부 통과
  <ContextMenu.Trigger asChild>            // 우클릭·롱프레스 감지 영역
    {trigger}
  </ContextMenu.Trigger>
  <ContextMenu.Content
    size="sm | md"                         // default: md — 하위 아이템 기본 size
    collisionPadding={number}              // default: 8
  >
    <ContextMenu.Label>...</ContextMenu.Label>
    <ContextMenu.Item
      size="sm | md"
      variant="default | destructive"
      leadingActions={MenuItemAction[]}
      trailingActions={MenuItemAction[]}
      shortcut="⌘C"
      disabled={boolean}
      onSelect={(e) => void}               // 발화 후 자동 닫힘 — e.preventDefault()로 유지
    >
      ...
    </ContextMenu.Item>
    <ContextMenu.CheckboxItem
      checked={boolean | "indeterminate"}
      onCheckedChange={(v) => void}
    />
    <ContextMenu.RadioGroup value onValueChange>
      <ContextMenu.RadioItem value="..." />
    </ContextMenu.RadioGroup>
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger>...</ContextMenu.SubTrigger>
      <ContextMenu.SubContent>...</ContextMenu.SubContent>
    </ContextMenu.Sub>
    <ContextMenu.Separator />
  </ContextMenu.Content>
</ContextMenu>
```

### 상태 매트릭스
| 상태 | 시각 |
|---|---|
| 열림 · 닫힘 | Content in/out은 전역 유틸 `.m-float` 담당 (open: emerge-from-* + base + emphasized, close: recede-to-* + fast + ease-in). 자체 애니메이션 재정의 금지. |
| 아이템 highlight (마우스·키보드) | `--hover` 배경, `fg-strong` — MenuItem 규칙 그대로 |
| checked (Checkbox) | leading 맨 앞에 checkmark 자동 삽입 |
| checked (Radio) | leading 맨 앞에 dot 인디케이터, fill=currentColor |
| disabled | `fg-disabled`, 커서 not-allowed, 키보드 순환에서 자동 제외 |
| destructive · hover | 배경 destructive 8%, 텍스트·아이콘 destructive |

### Size 가이드
| size | 언제 |
|---|---|
| `sm` | 밀도 높은 관리 UI · Command Palette 조합 · 우클릭이 잦은 캔버스 |
| `md` | **기본.** 일반 컨텍스트 메뉴 |

### 조합 예시
```tsx
// 캔버스 셀 우클릭 — 잘라내기/복사/붙여넣기 + 삭제
<ContextMenu>
  <ContextMenu.Trigger asChild>
    <Cell />
  </ContextMenu.Trigger>
  <ContextMenu.Content>
    <ContextMenu.Item shortcut="⌘X" onSelect={cut}>잘라내기</ContextMenu.Item>
    <ContextMenu.Item shortcut="⌘C" onSelect={copy}>복사</ContextMenu.Item>
    <ContextMenu.Item shortcut="⌘V" onSelect={paste}>붙여넣기</ContextMenu.Item>
    <ContextMenu.Separator />
    <ContextMenu.Item variant="destructive" shortcut="⌫" onSelect={remove}>삭제</ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu>

// 뷰 옵션 — Label + Checkbox + Radio
<ContextMenu.Content>
  <ContextMenu.Label>보기</ContextMenu.Label>
  <ContextMenu.CheckboxItem checked={grid} onCheckedChange={setGrid} shortcut="⌘G">
    그리드 표시
  </ContextMenu.CheckboxItem>
  <ContextMenu.Separator />
  <ContextMenu.Label>배치</ContextMenu.Label>
  <ContextMenu.RadioGroup value={view} onValueChange={setView}>
    <ContextMenu.RadioItem value="list">리스트</ContextMenu.RadioItem>
    <ContextMenu.RadioItem value="grid">그리드</ContextMenu.RadioItem>
  </ContextMenu.RadioGroup>
</ContextMenu.Content>

// 중첩 서브메뉴 — 공유 대상 세분화
<ContextMenu.Content>
  <ContextMenu.Item onSelect={open}>열기</ContextMenu.Item>
  <ContextMenu.Sub>
    <ContextMenu.SubTrigger leadingActions={[<Icon name="arrow-right" />]}>공유</ContextMenu.SubTrigger>
    <ContextMenu.SubContent>
      <ContextMenu.Item onSelect={mail}>이메일로</ContextMenu.Item>
      <ContextMenu.Item onSelect={link}>링크 복사</ContextMenu.Item>
    </ContextMenu.SubContent>
  </ContextMenu.Sub>
</ContextMenu.Content>

// 다중 토글 유지 — onSelect에서 preventDefault로 열림 유지
<ContextMenu.CheckboxItem
  checked={pinned}
  onCheckedChange={setPinned}
  onSelect={(e) => e.preventDefault()}
>
  고정
</ContextMenu.CheckboxItem>
```
