---
name: ctds
description: CTDS 하이브리드 디자인 시스템. 8축(Mode/Palette/Hue/Shape/Icon/Density/Motion/Font) CSS 변수 스왑. 색/크기/시간/폰트 하드코딩 금지, 토큰·프리미티브 경유 강제. CTDS 작업 시작점 — 작업 유형 식별 후 하위 스킬로 라우팅.
---

# CTDS Design System — Foundation

Layer 1(shadcn 방식 컴포넌트 코드) + Layer 2(AI 프롬프트 컨텍스트) 하이브리드. 상세는 `prompts/` 원본 문서 참조.

## 발동 시 — 온보딩 페이지 자동 오픈

1. `curl -sf http://localhost:3000 -o /dev/null && echo ok || echo down`
2. ok → `open http://localhost:3000/onboarding`
3. down → "dev 서버 꺼져있어요. `cd web && pnpm dev` 후 다시" 안내

## 절대 규칙 (항상 적용)

1. **하드코딩 금지** — 색(hex/rgb/oklch), 크기(px/rem/em), 시간(ms/s), 그림자, 폰트명. 전부 CSS 변수·토큰 경유. 예외: 1px border, 100%, 0.
2. **축 우선** — 8축 값 확인 전에 컴포넌트 결정 금지.
3. **접근성 > 축** — `prefers-reduced-motion:reduce`면 `motion=none`. WCAG AA 미달 금지.
4. **플로팅 서페이스 = `.m-float`만** — Tooltip/Popover/ContextMenu/DropdownMenu/Select/DatePicker/HoverCard. 컴포넌트별 keyframe/animation 재정의 금지.
5. **애매하면 묻는다** — 규칙으로 판단 안 서면 사용자 확인.

전체 원칙: `prompts/PRINCIPLES.md`.

## 작업 유형 → 스킬 라우팅

| 작업 | 호출 스킬 |
|---|---|
| 컴포넌트 신규 제작·variant/prop 수정 (`web/components/<Name>/` 또는 `prompts/components/<name>.md`) | `ctds-component` |
| 페이지·대시보드·레이아웃 조합 (`web/app/**/page.tsx`) | `ctds-page` |
| **와이어프레임/기존 페이지를 CTDS로 번역·교체** (사용자가 "CTDS로 바꿔줘/교체해줘/일괄 변경" 요청, 또는 와이어프레임 코드·이미지를 입력) | `ctds-wireframe` |
| 테마 프리셋 생성·수정 (`prompts/themes/*` 또는 `web/app/theme-demo/*`) | `ctds-theme` |
| 코드 검증 (하드코딩·유령 토큰·메모리 규칙·문서-코드 동기화) | `ctds-validate` |
| 3D 아이콘 일러스트 자산 생성 | `ctds-illust` |

각 스킬이 자기 영역의 축·토큰 매트릭스를 들고 간다. foundation은 라우팅만.
