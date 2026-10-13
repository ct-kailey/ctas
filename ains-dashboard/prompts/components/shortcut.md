# Shortcut

### 원칙
키보드 단축키를 표시하는 최소 시각 라벨. Menu Item의 trailing 슬롯, Tooltip 힌트, Command Palette 결과 행이 공유한다. 얕은 표면(`--hover`) + hairline border의 &ldquo;한 덩어리 키캡&rdquo; 안에 각 심볼이 얕은 gap으로 떨어져 있는 구조. 상호작용·상태 없음 — 순수 시각 라벨이다.

`<kbd>` 태그로 렌더해 시맨틱을 유지한다. Menu Item의 `shortcut` prop이 문자열을 받아 내부에서 Shortcut을 자동 렌더링하므로, 대부분의 경우 직접 조합할 필요 없이 Menu Item 경유로 쓴다.

### Do
- **문자열이면 자동 분해에 맡긴다**: `"⌘K"` → `[⌘][K]` 두 키캡. `Array.from`으로 code point 분해하므로 이모지·서로게이트도 안전.
- **다글자 키는 배열로**: `["Ctrl", "K"]` · `["Shift", "⏎"]` 처럼 원소 하나가 한 키. Windows/Linux 표기가 필요한 서비스 대응.
- **실제 심볼을 우선**: `⌘` · `⇧` · `⌥` · `⌃` · `⏎` · `⌫` · `⇥` · `␣` · `⎋`. 대문자 축약(`CMD`·`SHIFT`)은 [[feedback_no_uppercase]] 원칙상 금지.
- **size는 붙는 곳에 맞춘다**: Menu Item `sm` 옆이면 `sm`, `md` 옆이면 `md`. 라벨 폰트보다 커지지 않게 한 단계 낮게 짝지음. Menu Item에서 렌더할 땐 자동으로 사이즈가 짝지어짐.
- **가장 흔한 사용처는 Menu Item**: `<MenuItem shortcut="⌘K">` — trailing 슬롯 맨 앞에 자동 삽입된다. 직접 `trailingActions`에 넣지 않는다.

### Don't
- 인터랙션을 붙이지 않는다. Shortcut은 &ldquo;표기&rdquo;일 뿐 실제 키 핸들링은 상위 컴포넌트(Menu Item, Command Palette, 페이지 전역 훅) 책임.
- 문장이나 아이콘을 넣지 않는다. 심볼 단위 표기 전용.
- 색을 hex/tailwind로 직접 지정하지 않는다. 표면·텍스트·border 모두 토큰 경유.
- 대문자 축약 + wide letter-spacing 조합 금지 ([[feedback_no_uppercase]]).
- 여러 키캡 사이에 `+`나 `-` 같은 구분자 문자를 넣지 않는다. 심볼 사이 gap이 이미 구분자 역할을 한다.

### Fallback
size 애매하면 `sm`. Menu Item 안에서 쓸 때는 Menu Item이 자동으로 짝지어주므로 신경 쓰지 않아도 됨.

### 관련
- [[components/menu-item]] — 가장 흔한 사용처. `shortcut` prop이 내부에서 Shortcut 렌더링.
- [[components/tooltip]] · [[components/command-palette]] — 힌트/결과 행에서 함께 등장.
- [[axes/density]] — 폰트·padding이 Density 축에 반응.
- [[axes/shape]] — radius가 Shape 축에 반응.
- [[tokens/color]] — `--hover`(표면) · `--border`(hairline) · `--fg-subtle`(텍스트).
- [[feedback_no_uppercase]] — 대문자 축약 대신 심볼 사용.

### Props 시그니처
```tsx
<Shortcut
  size="sm | md"                                     // default: sm
>
  {children}                                         // string | string[] | ReactNode
</Shortcut>
```

`children` 처리 규칙:
- `string` → `Array.from`으로 심볼 단위 분해 (`"⌘⇧P"` → `[⌘][⇧][P]`, 공백은 무시).
- `string[]` → 각 원소가 한 키 (다글자 키 대응: `["Ctrl", "K"]`).
- `ReactNode` → 그대로 렌더 (완전 자유 조합).

### Size 가이드
| size | 폰트 | radius | 언제 |
|---|---|---|---|
| `sm` | `--text-xs` | `--radius-xs` | **기본.** Menu Item sm/md 옆, Command Palette 결과 행 |
| `md` | `--label-sm-size` | `--radius-sm` | Menu Item lg 옆 (필요 시), 페이지 문서 안 예시 |

### 조합 예시
```tsx
// 가장 흔한 사용 — Menu Item shortcut prop 경유
<MenuItem leadingActions={[<Icon name="search" />]} shortcut="⌘K">
  검색
</MenuItem>

<MenuItem leadingActions={[<Icon name="user" />]} shortcut="⌘,">
  계정 설정
</MenuItem>

// 직접 사용 — Tooltip 힌트
<Tooltip content={<>붙여넣기 <Shortcut>⌘V</Shortcut></>}>
  <IconButton icon={<Icon name="clipboard" />} aria-label="붙여넣기" />
</Tooltip>

// 다글자 키 (Windows/Linux 표기)
<Shortcut>{["Ctrl", "K"]}</Shortcut>
<Shortcut>{["Shift", "⏎"]}</Shortcut>

// 조합 심볼
<Shortcut>⌘⇧P</Shortcut>   {/* Command + Shift + P */}
<Shortcut>⌫</Shortcut>      {/* Backspace 단독 */}
```
