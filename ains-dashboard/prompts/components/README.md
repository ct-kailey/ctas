# prompts/components/

> **이 폴더는 CTDS 관리자용.**
> CTDS를 사용하는 개발자는 [../../USAGE.md](../../USAGE.md)를 본다.

CTDS 컴포넌트별 프롬프트 문서. Layer 2 (AI 프롬프트 컨텍스트).

각 파일은 `web/components/<Name>/`의 코드 컴포넌트와 **쌍으로** 존재해야 한다.

---

## 파일 규칙

- 파일 하나 = 컴포넌트 하나 (`button.md`, `input.md`, `select.md` ...)
- 파일명은 kebab-case, 소문자
- 문서 골격은 [../GUIDE.md](../GUIDE.md) §3.3 참고

---

## 최소 골격

```markdown
## <컴포넌트 이름>

### 원칙
<1~2줄. 이 컴포넌트가 왜 존재하고 언제 쓰는가.>

### Do
- <명령형 규칙>

### Don't
- <하드 리젝 사유>

### Fallback
<규칙이 애매할 때의 기본값.>

### 관련
- [[axes/density]] — <왜 관련되는지>
- [[tokens/spacing]] — <왜 관련되는지>

### Props 시그니처
```tsx
<Button variant="primary | secondary | ghost" size="sm | md | lg" />
```

### Variant 매트릭스
| variant | 용도 | 금지 조합 |
|---|---|---|
| `primary` | 주요 액션 | 한 화면에 2개 이상 금지 |
| `secondary` | 보조 액션 | — |

### 조합 예시
<규칙을 종합한 최소 예시 1개. 코드 블록.>
```

빈 헤딩은 `N/A` 한 줄로 표시. 헤딩 자체를 생략하지 않는다.

---

## 크로스 참조

- 축 참조: `[[axes/density]]`
- 토큰 참조: `[[tokens/spacing]]`
- 다른 컴포넌트: `[[components/button]]`
- 프리미티브: `[[primitives/fade]]`
- 최상위 문서: `[[PRINCIPLES]]`, `[[GUIDE]]`

상대 경로(`../axes/density.md`)나 URL 금지.

---

## 작성 우선순위

[PROJECT_OVERVIEW.md](../../PROJECT_OVERVIEW.md) §핵심 컴포넌트 목록의 순서를 따른다.
사용 빈도 높은 컴포넌트부터: Button → Input → Select → Table → Modal → Form ...

---

## 코드와의 연결

- 코드: `web/components/<Name>/<Name>.tsx` + `.module.css`
- 이 문서: `prompts/components/<name>.md`
- 둘이 어긋나면 AI 에이전트가 사용자에게 알림 (기본 동작)
- 새 컴포넌트 추가·수정 시 **코드와 문서를 함께 커밋** ([../../CONTRIBUTING.md](../../CONTRIBUTING.md))
