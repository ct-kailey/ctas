# Code Block

### 원칙
[[components/ai-message]] 안에 들어가는 코드 블록. 상단 언어 라벨 + copy 버튼, 본문은 mono font pre+code. 가로 overflow 시 scroll. **Syntax highlighting은 CodeBlock의 책임이 아님** — 소비처가 highlighted ReactNode를 `code`로 넘기거나(span 조합) plain string.

### Do
- 언어 아는 경우 `language="html"` 처럼 라벨 노출 — 작게 fg-muted로.
- `onCopyCode`를 안 주면 clipboard API로 자동 복사. 성공 시 Check 아이콘으로 1.5s 피드백.
- 가로가 넘치면 pre 안에서 가로 스크롤 — body wrapping 대신.

### Don't
- CodeBlock 안에 "실행" 버튼이나 "preview 전환" 넣지 않는다. 그건 소비처 책임.
- syntax highlighting을 내장하지 않는다 — shiki/highlight.js는 소비처에서.

### Fallback
language 애매하면 생략. onCopy 애매하면 clipboard API 기본.

### 관련
- [[components/ai-message]] — 상위 소비처
- [[primitives/scroll]] — pre 가로 스크롤 룰

### Props 시그니처
```tsx
<CodeBlock
  code={string | ReactNode}        // 코드 본문 (string이면 clipboard 복사 대상)
  language={string}                // "html" / "tsx" 등. 없으면 숨김
  onCopyCode={(code) => void}      // 미지정 시 navigator.clipboard (React의 onCopy와 이름 충돌 회피)
/>
```

### 레이아웃
- root: `primary-subtle` bg, `radius-md`, overflow hidden
- header: `space-2 space-3` padding, 언어 라벨(mono text-xs fg-muted) + copy 버튼
- copy 버튼: `space-6` 정사각, **ghost (transparent → hover `--hover` 틴트)**
- 본문 `<pre>`: `space-2 space-4 space-4` padding, mono text-sm, line-height 1.6, overflow-x auto
