# Onboarding

### 원칙
CTDS 설치 직후 `/ctds` 라우트에 뜨는 위자드. 스타일·분위기·밀도·컬러·레이아웃을 6단계로 결정해 `ctds.config.json` + `DESIGN.md`를 생성한다. 소비자 프로젝트의 "설정 전 단계" — 테마·축 기본값은 보류하고 중립 라이트로 뜬다 ([themeBootScript](../../web/components/themeBootScript.ts)가 `/onboarding` 경로를 감지해 다크 선호도 무시).

### Do
- `OnboardingPage`를 그대로 소비자 프로젝트의 `/ctds` 라우트에 심는다 (`ctds-cli init`이 자동 복사).
- 사용자가 "적용"을 누르면 `actions.applyOnboarding`이 `ctds.config.json` + `DESIGN.md`를 소비자 레포 루트에 쓰고, 그 커밋 이후 ThemeController가 config를 읽어 축 기본값으로 사용.
- 소비자가 자체 설정 플로우를 쓰고 싶으면 OnboardingPage를 교체하지 말고 **wizardData의 choices만 override** 하거나, 자체 라우트에서 `applyOnboarding`을 직접 호출.

### Don't
- OnboardingPage를 메인 앱 안으로 포팅하지 않는다 — 설정 전 단계 전용. 메인 앱의 테마 변경은 ThemeController가 담당.
- `OnboardingAxisPanel`을 다른 페이지에서 재사용하지 않는다 — 축 디버거는 docs 전용([Docs axis controller replacement TODO](../../memory/project_docs_axis_todo.md)).
- 위자드 단계 수를 늘리지 않는다 — 6단계는 심리적 상한. 신규 설정은 "적용" 이후 메인 앱의 설정 페이지에서.

### Props 시그니처
```tsx
<OnboardingPage />   // props 없음. 내부에서 useTheme + wizardData로 조립.
```

하위 블록은 OnboardingPage 안에서만 조립:
- `PresetsGallery` — 테마 프리셋 그리드 (step 1)
- `OnboardingAxisPanel` — 축 디버거 패널 (docs 전용 재사용 금지)
- `LayoutBuilder` — 레이아웃 선택 (step 5)
- `DocsIndex` — 설치 후 문서 지도

### Flow
1. **theme** — "디자인 스타일" 프리셋 선택 (standard · spare · expressive 등)
2. **vibe** — "프로덕트 분위기" (일반 · 생산성 · 소셜) → 축 세트 결정
3. **density** — 정보 밀도 (default · dense)
4. **color** — Palette + brand hex
5. **layout** — 사이드바·탑바 조합
6. **summary** — 선택 확인 + 적용

### 적용 결과
- `ctds.config.json` — 선택한 축 값 + palette hue
- `DESIGN.md` — 소비자 프로젝트의 "현재 디자인 결정" 기록
- 두 파일 커밋 후 ThemeController가 config를 initialConfig로 받아 축 기본값으로 사용

### 관련
- [[components/stepper]] — 단계 네비
- [[components/selectable-card]] — 각 step의 선택 카드
- [[axes/*]] — 선택 결과가 세팅하는 축
