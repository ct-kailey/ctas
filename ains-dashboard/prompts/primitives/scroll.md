# scroll

### 원칙
스크롤이 있는 곳엔 **두 겹의 패딩 규약**을 지킨다.

1. **바깥 컨테이너(스크롤 발생 요소)** 에는 패딩을 두지 않는다.
   → 패딩이 있으면 스크롤 트랙이 콘텐츠 위로 겹치거나 잘려 보인다.
2. **안쪽 트랙(items가 실제로 놓이는 자식)** 에 상하좌우 패딩을 준다.
   → 스크롤 도중 첫/끝 item이 컨테이너 엣지에 딱 붙어 잘린 느낌을 없앤다.

이 규약은 세로·가로·양방향 스크롤 모두에 동일하게 적용된다.

### Do
- 스크롤 컨테이너에 `overflow: auto`를, 안쪽 children wrapper에 `padding: var(--space-*)`를.
- 스크롤 방향에 맞춰 최소 `--space-2` 이상의 패딩을 줘서 트랙 끝에서도 콘텐츠가 카드 벽에 붙지 않도록.
- 리스트/그리드형 스크롤은 items 간 gap과 별개로 **컨테이너-item 사이의 여백**을 반드시 확보.
- 채팅창처럼 하단이 항상 최신인 경우에도 안쪽 패딩으로 마지막 메시지가 잘리지 않게.

### Don't
- 스크롤 컨테이너 자체에 `padding`을 걸지 않는다 → thumb이 콘텐츠와 겹쳐 보임.
- items에 `margin: first-child/last-child` 트릭으로 여백 흉내내지 않는다 → 정렬 깨지고 유지보수 어려움.
- `overflow: hidden` 위에 scrollTop을 JS로 조작하는 커스텀 스크롤은 접근성 무너짐. 반드시 네이티브 `overflow: auto`.

### Fallback
스크롤 필요 없는 경우엔 안쪽 트랙 패딩만으로도 무해. 그러니 규약을 컴포넌트 기본으로 두는 게 안전.

### 관련
- [[axes/density]] — `--space-*` 스케일 스왑에 자동 반응
- [[tokens/spacing]] — 안쪽 패딩은 `--space-*` 경유
- 스크롤바 시각(색·두께·hover 노출)은 globals.css의 전역 정책이 담당. 컴포넌트가 별도로 스크롤바 스타일을 선언하지 않는다.

### 정책 요약

| 요소 | overflow | padding |
|---|---|---|
| 바깥(스크롤) 컨테이너 | `auto` | 없음 |
| 안쪽(items) 트랙 | 없음 | `var(--space-2)` 이상 |

### 스크롤바 시각 정책 (전역, globals.css)

- 평상시: thumb 투명 → 스크롤바 자리는 있지만 안 보임 (overlay)
- 부모 `:hover` 또는 `:focus-within`: thumb에 `--border-strong` 페이드 인
- thumb `:hover`: `--fg-muted`로 진해짐
- 두께: `--scrollbar-size` 토큰 (Density 축 영향 없음, 고정)
- macOS 방식(사용 중일 때만 얇게 노출) — Notion/Linear/Figma 스타일

### 스크롤 페이드 (edge fade mask)

스크롤로 잘려나가는 콘텐츠 경계를 부드럽게 처리. 사용자에게 "더 있음"을 암시하면서 카드 벽에 텍스트가 딱 붙는 느낌을 없앤다.

- 세로 스크롤 컨테이너: `class="scroll-fade-y"` 부착 (상하단 페이드)
- 가로 스크롤 컨테이너: `class="scroll-fade-x"` 부착 (좌우 페이드)
- 크기 토큰: `--scroll-fade-size` (기본 `--space-4`)
- 구현: `mask-image` linear-gradient. 컨테이너 안 콘텐츠 전체가 마스킹되므로 스크롤 페이드는 **실제 스크롤이 있는 컨테이너에만** 부착. 스크롤 없는 곳에 붙이면 가장자리 요소(아이콘·버튼)가 흐릿하게 잘려 보임.

**Do**: 세로 스크롤 리스트, 가로 스크롤 테이블/탭, 채팅 메시지 리스트 등 스크롤이 상수인 자리에 클래스 명시적 부착.

**Don't**: 스크롤 유무가 유동적인 컨테이너에 blanket 적용. 콘텐츠가 짧을 때는 마스크만 남고 실제 페이드 효과 없이 가장자리가 흐릿함.

### 예시 (CSS 스케치)

```css
.list {           /* 바깥 스크롤 컨테이너 */
  overflow-y: auto;
  max-height: calc(var(--control-h-md) * 8);
  /* padding 금지 */
}

.listTrack {      /* 안쪽 items 래퍼 */
  display: flex;
  flex-direction: column;
  gap: var(--space-0_5);
  padding: var(--space-2);
}
```

---

## Textarea / 단일 콘텐츠 스크롤

리스트가 아니라 **텍스트 하나**가 자라서 스크롤되는 경우(채팅 입력창, 코드 에디터, Markdown preview 등). 리스트 규약과 다른 **특수 패턴** 필요 — 브라우저가 scroll 컨테이너의 `padding-bottom`을 scroll 영역에 포함시키지 않는 알려진 이슈(Chrome/Safari/Firefox 공통) 때문.

### 왜 특수한가
- 리스트는 "items wrapper에 padding"이면 끝 — 각 item 자체가 콘텐츠라 scroll content의 일부.
- textarea는 자신이 scroll 컨테이너면 **padding-top은 scroll track에 포함**(글이 거기까지 흘러옴)되지만, **padding-bottom은 scroll content 바깥**이 되어 "글이 bottom padding 앞에서 미리 잘리는" 현상이 생김.

### 금지 패턴 (실제 ChatInput 작업 중 겪은 삽질)

❌ **"root 전체에 padding"** — 글이 root padding 안쪽에서만 보이고 scroll clip이 root 안쪽 border에서 생겨 어색:
```css
.chatInput { padding: var(--space-2); }
.textarea  { overflow-y: auto; }
```

❌ **"textarea 자체가 scroll + 상하 padding"** — padding-bottom이 scroll 밖이라 작동 안 함:
```css
.textarea { overflow-y: auto; padding: var(--space-1); }
```

### 정답 패턴 (ChatInput이 쓰는 구조)

핵심 결정: **wrapper에 padding 0, textarea에 상·하·좌·우 padding 전부**. 왜냐하면
`overflow: auto` 요소에 padding을 두면 그 padding은 **scroll 시 고정** — 스크롤해도
빈 띠가 상·하에 남아 "글이 padding에서 미리 잘린다"는 느낌을 줌. 반면 textarea의
padding은 **자신의 content box 일부**로 취급돼, textarea 전체가 wrapper 안에서 scroll
되면 padding도 함께 올라감.

1. **root는 `padding: 0; overflow: hidden`** — scroll clip이 root border에서 생기도록.
2. **wrapper div(`.scroll`)는 `overflow-y: auto; padding: 0`** — padding 두면 "빈 띠" 생김.
3. **textarea는 상·하·좌·우 padding 전부 + `overflow: hidden`** — 자체 scroll 금지.

```css
.root {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-sm);
  border: var(--hairline) solid var(--border);
}

.scroll {
  overflow-y: auto;
  max-height: calc(var(--text-base) * 1.5 * 8);
  padding: 0;                                       /* 반드시 0 */
}

.textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-3) var(--space-4);           /* 상·하·좌·우 모두 */
  background: transparent;
  border: 0;
  outline: none;
  resize: none;
  overflow: hidden;                                 /* textarea 자체 scroll 금지 */
  font: inherit;
  line-height: 1.5;
}
```

이 구조에서:
- **짧은 글**: textarea가 자신의 padding 포함 높이 → wrapper 안에 스크롤 없음.
- **긴 글**: textarea height > wrapper max-height → wrapper 스크롤 시 textarea 전체가 올라감.
  - 상단에서 textarea padding-top을 지나며 글이 **root 상단 border에서 자연스레 clip**.
  - 하단에서 textarea padding-bottom을 지나며 글이 **root 하단 border에서 자연스레 clip**.

### 금지 패턴 추가 (이번 삽질로 확인)

❌ **"wrapper에 padding-top, textarea에 padding-bottom"** — 전에 썼던 패턴. wrapper의 padding-top이 scroll 시 "빈 띠"로 남아 글이 그 아래에서 clip돼 어색함.

### 함께 적용되는 레이아웃 룰

- `root`에 다른 섹션(attachment bar, footer 등)이 함께 있으면 각 섹션이 **자기 상하 padding을 책임**. `root`는 어떤 상·하 패딩도 걸지 않음.
- textarea JS autoResize는 `textarea.style.height = textarea.scrollHeight` 패턴. `scrollHeight`가 padding 포함이라 그대로 됨.

