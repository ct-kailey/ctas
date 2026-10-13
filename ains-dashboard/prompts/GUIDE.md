# CTDS 프롬프트 작성 가이드

이 문서는 **CTDS의 프롬프트 컨텍스트 문서(Layer 2)를 어떻게 쓸지**에 대한 규칙이다.
축(Axis), 토큰(Token), 컴포넌트(Component), 모션 프리미티브(Primitive) 문서를 작성할 때
이 가이드를 따른다.

---

## 0. 전제

이 가이드는 [[PRINCIPLES]]의 전역 원칙을 이미 읽었다고 가정한다.
특히 §1(값과 판단의 분리), §6(하드코딩 금지)는 모든 섹션 문서 작성의 대전제다.

---

## 1. 소비 주체

**1차 소비자는 AI다.** Claude/Cursor 등에 통째로 주입되거나 부분 인용된다.
따라서:

- 밀도 높게 쓴다. 서론·에필로그 없음.
- 규칙은 명령형으로. "~하는 것이 좋습니다" ❌ → "~한다" ✅
- 예시는 규칙당 최대 1개. 반복 예시는 컨텍스트 낭비.
- Markdown 구조를 엄격히 따른다 (AI가 헤딩으로 섹션을 찾음).

사람이 참고로 읽을 순 있지만, **사람이 읽기 편하려고 형식을 무너뜨리지 않는다.**

---

## 2. 공통 골격

모든 섹션 문서는 아래 5개 헤딩을 **이 순서로, 빠짐없이** 갖는다.
해당 사항이 없으면 헤딩 아래에 `N/A` 한 줄만 쓴다 (헤딩 자체를 생략하지 않는다).
리스트 헤딩(`Do`, `Don't`, `관련`)에서도 불릿 없이 `N/A` 한 줄로 표시한다.

```markdown
## <섹션 이름>

### 원칙
<1~2줄. 이 규칙이 왜 존재하는가.>

### Do
- <명령형 규칙>
- <명령형 규칙>

### Don't
- <하드 리젝 사유. 강도가 애매하면 bullet 앞에 `[HARD]` 또는 `[SOFT]` 명시 — PRINCIPLES §4a 참고>

### Fallback
<규칙이 애매할 때의 기본값. 없으면 "규칙대로 판단 불가한 경우 사용자에게 확인".>

### 관련
- [[다른-섹션-이름]] — <왜 관련되는지 한 줄>
```

**N/A 예시:**
```markdown
### Don't
N/A

### 관련
N/A
```

**왜 골격이 강제인가:**
- AI가 항상 같은 위치에서 정보를 찾을 수 있음
- 작성자가 "금지 규칙"을 빠뜨리지 않음 (빈칸이 눈에 띔)
- 크로스 참조가 왕복으로 성립함

---

## 3. 섹션 타입별 추가 항목

공통 골격 뒤에 타입별 추가 섹션을 붙인다.

### 3.1 축(Axis) — 예: Shape, Density, Motion

공통 골격 다음에:

```markdown
### 값
- `<값1>` — <한 줄 설명>
- `<값2>` — <한 줄 설명>

### 기본값
`<값>`

### 페어링
- `<이 축의 값>` + `<다른 축의 값>` — <권장/비권장 및 이유>
```

### 3.2 토큰(Token) — 예: Spacing, Radius, Shadow

공통 골격 다음에:

```markdown
### 토큰 표
| Token | 용도 |
|---|---|
| `<토큰명>` | <어디에 쓰는가 — 값이 아니라 용도> |
```

토큰 표에는 **값을 쓰지 않는다.** 값은 `PROJECT_OVERVIEW.md` 또는 실제 CSS에 있다.
프롬프트에는 "언제 쓰는가"만 담는다.

**그룹핑 허용:** 한 문서에 여러 토큰 계열이 포함되면 굵은 텍스트 그룹 헤딩으로 표를 나눌 수 있다 (예: color.md의 `**표면**`, `**텍스트**`, `**브랜드**`). 그룹 헤딩은 `###` 헤딩을 쓰지 않는다 — 골격 순서를 흐리기 때문. 굵은 텍스트만 사용.

### 3.3 컴포넌트(Component) — 예: Button, Modal, Table

공통 골격 다음에:

```markdown
### Props 시그니처
```tsx
<Component prop1="a | b | c" prop2={boolean} />
```

### Variant 매트릭스
| variant | 용도 | 금지 조합 |
|---|---|---|
| `<이름>` | <언제 쓰는가> | <어떤 축/prop과 못 씀> |

### 조합 예시
<규칙을 종합한 최소 예시 1개. 코드 블록.>
```

### 3.4 모션 프리미티브(Primitive) — 예: fade, slide, scale

공통 골격 다음에:

```markdown
### 축별 스왑
| data-motion | 파라미터 |
|---|---|
| `expressive` | <이 프리미티브에서 뭐가 바뀌는가> |
| `standard` | ... |
| `subtle` | ... |
| `none` | <보통 즉시 완료 또는 스킵> |

### 겹침 규칙
<다른 프리미티브와 조합 가능 여부. 예: "fade와 scale만 조합 허용, 그 외 단독 사용.">
```

### 3.5 테마(Theme) — 예: spare, expressive

Theme은 **6개 축 preset 묶음 + 축 밖 산문 레이어**다. Palette / Hue / Voice는 Theme 바깥(같은 Theme × 다른 색·보이스 성립).
공통 골격 다음에 아래 4블록을 **이 순서로** 붙인다. 자세한 스키마·셀프 체크리스트는 [[themes/_SCHEMA]].

```markdown
### Signature
이 Theme IS ___. <비교 수사 1문장>

### Preset
| Axis | Value | Why |
|---|---|---|
| [[axes/mode]] | `<값>` | <한 줄 이유> |
| ... | ... | ... |  # Mode / Shape / Density / Font / Icon / Motion 6행

### Layout / Imagery / Decoration / Negative
<수치 금지, 선호·태도만. Negative는 최소 3개. 없는 섹션은 N/A.>

### Override / Known Gaps / Iteration Guide
<override는 전부 자유, 책임은 사용자. Known Gaps·Iteration Guide 의무.>
```

---

## 4. 크로스 참조

다른 섹션을 참조할 땐 `[[섹션-이름]]` 형식을 쓴다 (kebab-case).
`관련` 헤딩 외에도 본문에서 자유롭게 링크한다.

```markdown
`crisp`은 데이터 밀도 높은 화면에 권장. [[axes/density]]가 `compact`일 때 특히 잘 맞음.
```

**링크 원칙:**
- 참조는 `[[폴더/이름]]` 형식. 폴더 접두어로 타입을 명시한다 (`[[axes/density]]`, `[[tokens/spacing]]`, `[[components/button]]`, `[[primitives/fade]]`, `[[presets/gov-formal]]`).
- 최상위 문서(`GUIDE`, `PRINCIPLES`)는 폴더 없이 `[[PRINCIPLES]]`.
- URL이나 상대 경로(`../axes/density.md`)로 걸지 않는다 — 파일 구조가 바뀌면 다 깨진다.
- 아직 안 쓴 섹션도 링크 가능. 나중에 쓸 것의 표식이 된다.
- `관련` 섹션에 링크가 없어도 됨 (`N/A`). 단, 정말 다른 어떤 섹션과도 무관한지 재검토한다.

---

## 5. 파일 구조

```
prompts/
├── GUIDE.md              # 이 문서
├── PRINCIPLES.md         # 전역 원칙 (모든 섹션의 상위 규칙)
├── axes/
│   ├── mode.md
│   ├── palette.md
│   ├── hue.md
│   ├── shape.md
│   ├── icon.md
│   ├── density.md
│   ├── motion.md
│   ├── font.md
│   └── voice.md
├── tokens/
│   ├── spacing.md
│   ├── radius.md
│   ├── typography.md
│   ├── color.md
│   ├── shadow.md
│   ├── z-index.md
│   └── breakpoint.md
├── components/
│   ├── button.md
│   ├── input.md
│   └── ...
├── primitives/           # 모션 프리미티브
│   ├── fade.md
│   ├── slide.md
│   └── ...
├── themes/               # 6축 묶음 + 축 밖 산문 레이어 (Palette/Hue/Voice는 바깥)
│   ├── _SCHEMA.md
│   ├── _TEMPLATE.md
│   └── <theme-slug>.md
└── presets/
    └── <preset-name>.md  # 프리셋 정의 + 프리셋 특유의 판단 규칙
```

**파일 하나 = 섹션 하나.** 여러 섹션을 한 파일에 묶지 않는다.
AI에 부분 주입할 때 파일 단위로 자르는 게 가장 안전하다.

---

## 6. 작성 순서 권장

1. `PRINCIPLES.md` — 대전제(§0)와 전역 규칙
2. `axes/` 전 9개 — 축이 컴포넌트 규칙의 전제가 됨
3. `tokens/` 전 7개 — 토큰 이름을 컴포넌트가 참조함
4. `primitives/` — 컴포넌트가 프리미티브를 참조함
5. `components/` — 우선순위 컴포넌트부터
6. `presets/` — 축 조합 확정 후

---

## 7. 셀프 체크리스트

새 프롬프트 문서를 커밋하기 전에 확인:

- [ ] 공통 골격 5개 헤딩이 모두 있는가 (없으면 `N/A`)
- [ ] [[PRINCIPLES]] §6 하드코딩 금지 목록을 위반하지 않는가
- [ ] 규칙이 명령형인가
- [ ] 예시는 규칙당 1개 이하인가
- [ ] 섹션 타입별 추가 항목을 붙였는가
- [ ] `관련` 링크가 있거나, 없다면 진짜 독립적인지 재확인 (§4 참고)
