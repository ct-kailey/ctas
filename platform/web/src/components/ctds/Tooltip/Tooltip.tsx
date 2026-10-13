"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./Tooltip.module.css";

type Side = "top" | "right" | "bottom" | "left";
type Align = "start" | "center" | "end";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** 튀어나올 방향. 뷰포트 충돌 시 자동 flip. 기본 top. */
  side?: Side;
  /** 그 방향에서의 정렬. 기본 center. */
  align?: Align;
  /** 트리거와의 간격 (px). 기본 6. */
  sideOffset?: number;
  /**
   * 꼭지(arrow)의 위치를 중심에서 얼마나 밀지 (px).
   * side=top/bottom이면 x축, side=left/right면 y축으로 이동.
   * 기본 0 = 툴팁 본체의 정중앙.
   * followMouse가 true면 이 값은 무시됩니다.
   */
  arrowOffset?: number;
  /**
   * 마우스가 트리거 위에서 움직일 때 꼭지가 마우스를 따라가게 함.
   * side=top/bottom일 때 x축, left/right일 때 y축을 따라감.
   */
  followMouse?: boolean;
  delayDuration?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 화살표 표시 여부. 기본 true. */
  arrow?: boolean;
}

/* --- SVG path 프리셋 ---
   body(rounded rect) + tail(삼각형)을 하나의 path로 그린다.
   폭/높이는 사용처의 크기를 따라가고, 꼭지 위치는 CSS 변수 --arrow-x/--arrow-y로 제어. */

// 각 side별 path 함수: 컨테이너 크기(width, height)와 꼭지 위치(arrowPos), 꼭지 크기(tail), radius를 받아 path d 문자열 반환
const TAIL = 6; // 꼭지 크기 (side offset이 이만큼 필요)
const RADIUS = 6;

function buildPath(
  side: Side,
  w: number,
  h: number,
  arrowPos: number, // side가 top/bottom이면 x좌표, left/right면 y좌표
  hasArrow: boolean
): string {
  const r = Math.min(RADIUS, Math.min(w, h) / 2);
  const t = TAIL;

  if (side === "top") {
    // body는 0..w-t 세로, arrow는 아래로 삐죽
    const bodyH = h - t;
    // arrow 위치는 x축, tail의 tip이 아래로 나감
    const cx = clamp(arrowPos, r + t, w - r - t);
    return [
      `M${r},0`,
      `H${w - r}`,
      `Q${w},0 ${w},${r}`,
      `V${bodyH - r}`,
      `Q${w},${bodyH} ${w - r},${bodyH}`,
      hasArrow ? `H${cx + t}` : "",
      hasArrow ? `L${cx},${h}` : "",
      hasArrow ? `L${cx - t},${bodyH}` : "",
      `H${r}`,
      `Q0,${bodyH} 0,${bodyH - r}`,
      `V${r}`,
      `Q0,0 ${r},0`,
      `Z`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (side === "bottom") {
    // body는 t..h 세로, arrow는 위로 삐죽
    const bodyTop = t;
    const cx = clamp(arrowPos, r + t, w - r - t);
    return [
      `M${r},${bodyTop}`,
      hasArrow ? `H${cx - t}` : "",
      hasArrow ? `L${cx},0` : "",
      hasArrow ? `L${cx + t},${bodyTop}` : "",
      `H${w - r}`,
      `Q${w},${bodyTop} ${w},${bodyTop + r}`,
      `V${h - r}`,
      `Q${w},${h} ${w - r},${h}`,
      `H${r}`,
      `Q0,${h} 0,${h - r}`,
      `V${bodyTop + r}`,
      `Q0,${bodyTop} ${r},${bodyTop}`,
      `Z`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (side === "left") {
    // body는 0..w-t 가로, arrow는 오른쪽으로 삐죽
    const bodyW = w - t;
    const cy = clamp(arrowPos, r + t, h - r - t);
    return [
      `M${r},0`,
      `H${bodyW - r}`,
      `Q${bodyW},0 ${bodyW},${r}`,
      hasArrow ? `V${cy - t}` : "",
      hasArrow ? `L${w},${cy}` : "",
      hasArrow ? `L${bodyW},${cy + t}` : "",
      `V${h - r}`,
      `Q${bodyW},${h} ${bodyW - r},${h}`,
      `H${r}`,
      `Q0,${h} 0,${h - r}`,
      `V${r}`,
      `Q0,0 ${r},0`,
      `Z`,
    ]
      .filter(Boolean)
      .join(" ");
  }

  // right
  // body는 t..w 가로, arrow는 왼쪽으로 삐죽
  const bodyLeft = t;
  const cy = clamp(arrowPos, r + t, h - r - t);
  return [
    `M${bodyLeft + r},0`,
    `H${w - r}`,
    `Q${w},0 ${w},${r}`,
    `V${h - r}`,
    `Q${w},${h} ${w - r},${h}`,
    `H${bodyLeft + r}`,
    `Q${bodyLeft},${h} ${bodyLeft},${h - r}`,
    hasArrow ? `V${cy + t}` : "",
    hasArrow ? `L0,${cy}` : "",
    hasArrow ? `L${bodyLeft},${cy - t}` : "",
    `V${r}`,
    `Q${bodyLeft},0 ${bodyLeft + r},0`,
    `Z`,
  ]
    .filter(Boolean)
    .join(" ");
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Radix Content를 감싼 컴포넌트. content 크기를 재서 SVG path를 다시 그린다.
 * data-side는 Radix가 자동 flip 후 세팅해주는 값(top/right/bottom/left)을 그대로 씀.
 */
const CustomContent = forwardRef<
  HTMLDivElement,
  {
    initialSide: Side;
    align: Align;
    sideOffset: number;
    arrowOffset: number;
    arrow: boolean;
    children: ReactNode;
  }
>(({ initialSide, align, sideOffset, arrowOffset, arrow, children }, ref) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [side, setSide] = useState<Side>(initialSide);

  // 크기 측정 + 실제 렌더링된 side(자동 flip 반영) 관측
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      const s = el.getAttribute("data-side") as Side | null;
      if (s) setSide(s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // data-side는 Radix가 mount 후 세팅하므로 MutationObserver로 관측
    const mo = new MutationObserver(measure);
    mo.observe(el, { attributes: true, attributeFilter: ["data-side"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  // arrow 위치: side에 따라 x 또는 y 좌표
  const arrowPos = size
    ? side === "top" || side === "bottom"
      ? size.w / 2 + arrowOffset
      : size.h / 2 + arrowOffset
    : 0;

  const d = size ? buildPath(side, size.w, size.h, arrowPos, arrow) : "";

  return (
    <RadixTooltip.Content
      ref={(node) => {
        contentRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={[styles.content, "m-float"].join(" ")}
      side={initialSide}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={8}
      // side에 따라 tail 방향 패딩 확보
      style={
        {
          "--tail": `${TAIL}px`,
        } as React.CSSProperties
      }
      data-side-current={side}
    >
      {size && (
        <svg
          className={styles.shape}
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={d} className={styles.shapePath} />
        </svg>
      )}
      <div className={styles.text}>{children}</div>
    </RadixTooltip.Content>
  );
});
CustomContent.displayName = "CustomContent";

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      content,
      children,
      side = "top",
      align = "center",
      sideOffset = 6,
      arrowOffset = 0,
      followMouse = false,
      delayDuration,
      open,
      onOpenChange,
      arrow = true,
    },
    ref
  ) => {
    const triggerRef = useRef<HTMLElement | null>(null);
    const [mouseOffset, setMouseOffset] = useState(0);

    // followMouse: 트리거 위에서의 마우스 좌표를 arrow 위치로 환산
    useEffect(() => {
      if (!followMouse) return;
      const el = triggerRef.current;
      if (!el) return;
      const onMove = (e: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        if (side === "top" || side === "bottom") {
          const cx = rect.left + rect.width / 2;
          setMouseOffset(e.clientX - cx);
        } else {
          const cy = rect.top + rect.height / 2;
          setMouseOffset(e.clientY - cy);
        }
      };
      el.addEventListener("mousemove", onMove);
      return () => el.removeEventListener("mousemove", onMove);
    }, [followMouse, side]);

    const effectiveArrowOffset = followMouse ? mouseOffset : arrowOffset;

    return (
      <RadixTooltip.Root
        delayDuration={delayDuration}
        open={open}
        onOpenChange={onOpenChange}
      >
        <RadixTooltip.Trigger asChild ref={triggerRef as React.RefObject<HTMLButtonElement>}>
          {children}
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <CustomContent
            ref={ref}
            initialSide={side}
            align={align}
            sideOffset={sideOffset}
            arrowOffset={effectiveArrowOffset}
            arrow={arrow}
          >
            {content}
          </CustomContent>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    );
  }
);

Tooltip.displayName = "Tooltip";

export const TooltipProvider = ({
  delayDuration = 300,
  skipDelayDuration = 300,
  children,
}: {
  delayDuration?: number;
  skipDelayDuration?: number;
  children: ReactNode;
}) => (
  <RadixTooltip.Provider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
  >
    {children}
  </RadixTooltip.Provider>
);
