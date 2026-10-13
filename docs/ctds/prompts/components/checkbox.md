# Checkbox

### 원칙
폼에서 **다중 선택**을 표시하는 최소 컨트롤. 시각 요소(`.indicator`)와 접근성(실제 `<input type="checkbox">`, visually-hidden)을 분리해 native 시맨틱을 유지한다.

색은 [[tokens/color]]의 `--primary` 기반. 상태(성공/경고/삭제/정보)를 표시할 뜻이 정확하면 `status` prop으로 상태 토큰 스왑.

### Do
- **다중 선택에만**: "여러 개 켤 수 있음"이 의미의 핵심. 하나만 켜지는 그룹은 [[components/radio]].
- **라벨과 세트로 렌더**: `<label>` 래퍼가 컨트롤 + 텍스트 hitbox를 확장. children이 없으면 별도 라벨 요소에 `htmlFor` 연결 필수.
- **indeterminate는 부모 노드에만**: 트리·리스트에서 자식 일부만 체크된 부모에 표시. 자식 자체를 indeterminate로 두지 않는다.
- **status는 뜻이 명확할 때만**: 예를 들어 "삭제 확인" 체크박스에 `destructive`. 브랜드 톤 대신 primary 그대로 두는 게 대부분 자연스럽다.

### Don't
- native input을 완전히 없애지 않는다 — visually-hidden으로 감추되 DOM엔 남긴다(폼 제출·스크린리더).
- 커스텀 SVG를 직접 그려 넣지 않는다. indicator 안 마크는 [[components/icon]]의 `check` / `minus` 사용.
- Switch 대체로 쓰지 않는다. 체크박스는 &ldquo;선택 여부&rdquo;, Switch는 &ldquo;즉시 적용되는 on/off&rdquo;.

### Fallback
status 애매하면 없음(=primary).

### 관련
- [[components/radio]] — 단일 선택 버전. 시각·시맨틱은 형제.
- [[components/badge]] — status 4종 토큰을 공유.
- [[tokens/color]] — `--primary` · `--*-fg`

### Props 시그니처
```tsx
<Checkbox
  status="success | warning | destructive | info"        // optional
  indeterminate={boolean}                                 // 부모 노드 부분선택 표시
  checked / defaultChecked / onChange / disabled ...      // native input props
>
  {children}                                              // 라벨 (없어도 됨)
</Checkbox>
```

### 상태 매트릭스
| 상태 | 배경 | 테두리 | 마크 |
|---|---|---|---|
| unchecked | `--bg` | `--border-strong` | 없음 |
| hover | `--bg` | `--fg` | 없음 |
| checked | `--primary` | `--primary` | `--bg` (check) |
| indeterminate | `--primary` | `--primary` | `--bg` (minus) |
| checked + status | 각 상태 토큰 | 각 상태 토큰 | 각 `--*-fg` |
| disabled | 그대로 | 그대로 | opacity 0.5 |
