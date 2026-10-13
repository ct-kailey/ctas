# Cascade

### 원칙
축은 `html` 또는 중간 컨테이너에 `data-*` 어트리뷰트로 선언되고, CSS 변수가
서브트리로 상속되는 방식으로 동작한다. 축 하나(예: Mode)만 뒤집으면 다른 축
(Palette·Shape·Density·Motion·Icon·Lang·Focus·Voice)은 **부모 값을 그대로 상속**한다.

### Do
- 국소 스코프 바꾸기는 `data-mode="dark"` 처럼 **바꾸는 축 하나만** 자식 컨테이너에 선언한다. 나머지는 자동 상속.
- 자식 영역의 축 변경이 손주까지 전파되길 원할 때는 **아무 것도 안 한다** — CSS 변수 상속이 공짜로 처리한다.
- 변경한 축에 영향받는 토큰 셋만 바뀐다는 사실을 명시적으로 활용 (예: 다크 카드 안에서도 Shape는 그대로).
- 디버깅할 땐 DevTools에서 `html` 또는 중간 컨테이너의 `data-*` 값을 눈으로 확인하는 걸 1순위로.

### Don't
- 자식 컨테이너에 쓸모없는 전체 축 셋을 다시 선언하지 않는다. 예: `<div data-mode="dark" data-palette="standard" data-shape="standard" ...>` → `<div data-mode="dark">` 로 충분.
- 자식 컨테이너에서 CSS 변수를 **직접** 재선언하지 않는다 (예: `style={{ "--bg": "..." }}`). 토큰 whitelist 바깥의 값을 섞으면 축 스왑이 깨짐. 축으로 못 표현하는 색은 축에 값을 추가하거나 테마 프리셋 레벨에서 해결.
- 축 중 하나가 "값이 없을 때 자동 폴백" 되지 않는다고 가정하지 않는다 — 모든 축은 `:root`에 기본값이 선언돼 있고 자식은 명시적으로 override 할 때만 바뀜.

### 선언이 두 번이면 가까운 쪽이 이긴다
```tsx
<html data-mode="light">          {/* L1 */}
  <main data-mode="dark">         {/* L2: light 뒤집음 */}
    <aside data-mode="light">     {/* L3: 다시 light */}
      {/* 여기서 --bg, --fg는 L3 light. --shape는 L1 standard 그대로. */}
    </aside>
  </main>
</html>
```

### 축별 "국소 스코프" 적용 가능성
| 축 | 국소 override | 대표 쓰임 |
|---|---|---|
| Mode | ✅ 흔함 | 이미지 오버레이, 어두운 카드, 다크 툴바 |
| Palette | ⚠️ 드물게 | 브랜드 섹션에 vivid 강조 (주의: 전체 톤 깨짐) |
| Shape | ⚠️ 드물게 | 이벤트 배너에만 soft 둥글기 |
| Density | ✅ 자주 | 대시보드 안 compact 테이블 vs 외곽 default 패널 |
| Motion | ⚠️ 거의 안 함 | 접근성용 `none` 국소 적용 외엔 금지 |
| Icon | ⚠️ 거의 안 함 | A/B 테스트용 |
| Lang | ✅ 자주 | 다국어 혼재 페이지 (한국어 본문 + 영문 코드 블록) |
| Focus | ✅ 가끔 | 키보드 네비게이션 섹션만 ring on |
| Voice | ⚠️ 드물게 | 공식·캐주얼 영역이 섞인 UI |

### 디버깅
- `html` 요소에 전체 축 셋이 다 보이는지 DevTools로 체크. ThemeController가 마운트되지 않으면 축 어트리뷰트가 비어있을 수 있음 — boot script(themeBootScript)가 `<head>`에 inline으로 들어가 있어야 FOUC 없이 뜬다.
- 자식 영역이 축을 상속받지 못한 것 같으면: (1) 중간에 `data-*` 재선언이 있는지, (2) iframe·portal로 넘어가 조상 체인이 끊긴 건 아닌지 확인.

### 관련
- 데모 앱 wiring: [web/app/layout.tsx](/web/app/layout.tsx) + [web/components/ThemeController.tsx](/web/components/ThemeController.tsx) + [web/components/themeBootScript.ts](/web/components/themeBootScript.ts)
- 각 축의 값·기본값·국소 스코프 디테일: [mode.md](mode.md) · [palette.md](palette.md) · [shape.md](shape.md) · [density.md](density.md) · [motion.md](motion.md) · [icon.md](icon.md)
