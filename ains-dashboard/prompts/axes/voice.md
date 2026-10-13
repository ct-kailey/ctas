---
axis: voice
selector: '[data-voice]'
values: [formal, neutral, casual]
default: neutral
layer: 2
css_tokens: none
---

# Voice

### 원칙
Voice는 **카피 톤만** 지배. 토큰·CSS 변수 없는 Layer 2 전용 축.
Theme과 독립 — editorial이든 mechanical이든 어떤 Theme에도 어떤 Voice든 결합 가능.
서비스 성격 기준으로 선택하며, 다른 축(색·간격·모션)에 전혀 연쇄하지 않는다.

### Do
- 카피를 생성할 때 현재 `data-voice` 또는 사용자 지시된 Voice를 **먼저 확인**하고 그 톤으로 작성.
- 톤 전환은 종결어미만 바꾸지 말고 **어휘 선택까지** 바꾼다 (예: "오류" ↔ "앗").
- Preset(`gov-formal` 등) 적용 후에도 Voice는 사용자가 별도로 선택한 값을 유지한다.

### Don't
- Voice를 색·간격·radius와 같은 기준으로 변경하지 않는다. 다른 축에 영향 없음.
- 접근성 문구(에러 설명, 필수 필드 안내, 스크린리더 라벨)는 Voice와 무관하게 **명확성 우선**.
  `casual`이어도 필수 정보를 희석하지 않는다 (예: "비밀번호는 필수입니다" 수준은 유지).
- Voice에 CSS 변수나 토큰을 할당하지 않는다. 코드 레벨 영향은 `data-voice` 속성 노출뿐.
- **제목·헤딩·버튼 라벨·메뉴명에 em dash(—), en dash(–), 하이픈(-)으로 부제를 잇지 않는다.**
  모든 Voice 공통 하드 룰. 문서·UI 카피·AI 생성물 전부 해당.
  나쁜 예: "온보딩 — 테마를 고릅니다", "설정 — 기본값", "저장 — 완료".
  대신: 한 줄 제목으로 끝내거나(`"테마 고르기"`), 부제가 꼭 필요하면 별도 하위 텍스트로 분리.

### Fallback
`neutral`.

### 값

**Voice** (`data-voice`)
- `formal` — 격식체. 종결어미 "···합니다". 공공·금융·법무·엔터프라이즈.
  예: "저장되었습니다.", "요청을 처리할 수 없습니다."
- `neutral` — 표준 존대. 종결어미 "···입니다 / ···해요" 혼용. 일반 웹 UI 기본.
  예: "저장했어요.", "다시 시도해 주세요."
- `casual` — 친근체. 말 놓기 톤 허용. 소셜·게임·내부 도구.
  예: "저장 완료!", "앗, 뭔가 잘못됐어요."

### 기본값
`voice=neutral`

### 페어링
- 특정 Theme과의 강한 페어링 없음. Theme이 묶는 축 바깥에 있음.
- 선택 기준은 **서비스 성격**: B2G/금융 → `formal`, 일반 B2C → `neutral`, 소셜·게임·사내툴 → `casual`.
- 특정 [[axes/palette]]·[[axes/shape]]와의 강제 조합도 없음.

### 관련
- [[themes/_SCHEMA]] — Theme이 묶는 축에서 Voice는 제외됨 (Palette/Hue와 함께 Theme 바깥 3축).
