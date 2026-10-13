"use client";

/** AINS pins the CTDS Icon family to Lucide. See docs/ctds/ains-components.md. */
import * as React from "react";
import type { IconFamily, IconWeight } from "../_data";
// Lucide ──────────────────────────────────────────────────────────
import {
  Check as LuCheck,
  AlertTriangle as LuWarning,
  Star as LuStar,
  Heart as LuHeart,
  User as LuUser,
  Search as LuSearch,
  Settings as LuGear,
  Trash as LuTrash,
  ArrowRight as LuArrowRight,
  X as LuX,
  Sun as LuSun,
  Moon as LuMoon,
  ChevronDown as LuCaretDown,
  ChevronLeft as LuCaretLeft,
  ChevronRight as LuCaretRight,
  ChevronUp as LuCaretUp,
  ChevronsUpDown as LuCaretUpDown,
  ChevronsLeft as LuCaretDoubleLeft,
  ChevronsRight as LuCaretDoubleRight,
  Columns as LuColumns,
  Scissors as LuScissors,
  Copy as LuCopy,
  Files as LuFiles,
  ClipboardType as LuClipboardType,
  Share2 as LuShare,
  ExternalLink as LuExternalLink,
  Pencil as LuPencil,
  FileText as LuFileText,
  Info as LuInfo,
  List as LuList,
  LayoutGrid as LuLayoutGrid,
  Grid3X3 as LuGrid3X3,
  Square as LuSquare,
} from "lucide-react";

export type IconName =
  | "check"
  | "warning"
  | "star"
  | "heart"
  | "user"
  | "search"
  | "gear"
  | "trash"
  | "arrow-right"
  | "arrows-down-up"
  | "x"
  | "sun"
  | "moon"
  | "caret-down"
  | "caret-left"
  | "caret-right"
  | "caret-up"
  | "caret-up-down"
  | "caret-double-left"
  | "caret-double-right"
  | "columns"
  | "house"
  | "palette"
  | "ruler"
  | "square"
  | "text-aa"
  | "paint-bucket"
  | "stack"
  | "waveform"
  | "devices"
  | "squares-four"
  | "cursor-click"
  | "split-vertical"
  | "rectangle"
  | "list"
  | "rows"
  | "seal-check"
  | "user-circle"
  | "info"
  | "tag"
  | "minus"
  | "plus"
  | "placeholder"
  | "textbox"
  | "keyboard"
  | "article"
  | "selection"
  | "check-square"
  | "radio-button"
  | "toggle-right"
  | "toggle-left"
  | "sliders"
  | "calendar"
  | "calendar-blank"
  | "calendar-dots"
  | "clock"
  | "upload-simple"
  | "download-simple"
  | "identification-card"
  | "table"
  | "grid-four"
  | "list-bullets"
  | "cards"
  | "chart-line"
  | "trend-up"
  | "trend-down"
  | "empty"
  | "list-dashes"
  | "line-segments"
  | "tabs"
  | "path"
  | "sidebar"
  | "sidebar-simple"
  | "dots-three"
  | "compass"
  | "steps"
  | "warning-circle"
  | "check-circle"
  | "square-half"
  | "chat-circle"
  | "chat-text"
  | "broadcast"
  | "bell"
  | "megaphone"
  | "speedometer"
  | "circle-notch"
  | "dots-three-outline"
  | "caret-circle-down"
  | "command"
  | "rows-plus-bottom"
  | "minus-square"
  | "brackets-square"
  | "grid-nine"
  | "arrows-vertical"
  | "split-horizontal"
  | "layout"
  | "envelope"
  | "eye"
  | "eye-slash"
  | "arrow-square-out"
  | "pencil-simple"
  | "share-network"
  | "copy"
  | "copy-simple"
  | "scissors"
  | "clipboard-text"
  | "camera"
  | "globe";

type AnyComp = React.ComponentType<any>;

/* lucide 세트 — 자연스러운 대응이 있는 것만. */
const lucideSet: Partial<Record<IconName, AnyComp>> = {
  check: LuCheck,
  warning: LuWarning,
  star: LuStar,
  heart: LuHeart,
  user: LuUser,
  search: LuSearch,
  gear: LuGear,
  trash: LuTrash,
  "arrow-right": LuArrowRight,
  x: LuX,
  sun: LuSun,
  moon: LuMoon,
  "caret-down": LuCaretDown,
  "caret-left": LuCaretLeft,
  "caret-right": LuCaretRight,
  "caret-up": LuCaretUp,
  "caret-up-down": LuCaretUpDown,
  "caret-double-left": LuCaretDoubleLeft,
  "caret-double-right": LuCaretDoubleRight,
  columns: LuColumns,
  square: LuSquare,
  "squares-four": LuGrid3X3,
  list: LuList,
  info: LuInfo,
  article: LuFileText,
  "grid-four": LuLayoutGrid,
  "arrow-square-out": LuExternalLink,
  "pencil-simple": LuPencil,
  "share-network": LuShare,
  copy: LuCopy,
  "copy-simple": LuFiles,
  scissors: LuScissors,
  "clipboard-text": LuClipboardType,
};

/* family 공통 fallback — 매핑 없는 아이콘 호출 시 "사각형 + 대각선" 금지표시 느낌.
   family별 라이브러리 아이콘("빈 네모")보다 "이 아이콘은 없음" 신호가 명확하도록
   전용 SVG로 그린다. stroke는 currentColor, size는 phosphor/lucide와 동일하게 size prop을
   받는 형태로 흉내낸다. */
function MissingIcon({
  size = 20,
  ...rest
}: React.SVGAttributes<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth={16}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <rect x="40" y="40" width="176" height="176" rx="8" />
      <line x1="216" y1="40" x2="40" y2="216" />
    </svg>
  );
}

/* arrows-down-up: table header sort indicator 전용 커스텀 아이콘.
   phosphor ArrowsDownUp과 동일한 모양이지만 두 path를 각각 분리해 class를 걸어
   호출 쪽에서 "위 path(=desc 방향)"와 "아래 path(=asc 방향)"의 톤을 독립 제어할 수 있게 함.
   icon family 축에 영향받지 않고 항상 동일 모양. */
function ArrowsDownUpIcon({
  size = 20,
  upClassName,
  downClassName,
  ...rest
}: React.SVGAttributes<SVGSVGElement> & {
  size?: number | string;
  /** 상단 path (아래 방향 ↓, desc 지시). */
  upClassName?: string;
  /** 하단 path (위 방향 ↑, asc 지시). */
  downClassName?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      {...rest}
    >
      <path
        className={upClassName}
        d="M117.66,170.34a8,8,0,0,1,0,11.32l-32,32a8,8,0,0,1-11.32,0l-32-32a8,8,0,0,1,11.32-11.32L72,188.69V48a8,8,0,0,1,16,0V188.69l18.34-18.35A8,8,0,0,1,117.66,170.34Z"
      />
      <path
        className={downClassName}
        d="M213.66,74.34l-32-32a8,8,0,0,0-11.32,0l-32,32a8,8,0,0,0,11.32,11.32L168,67.31V208a8,8,0,0,0,16,0V67.31l18.34,18.35a8,8,0,0,0,11.32-11.32Z"
      />
    </svg>
  );
}

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
  name: IconName;
  /** Compatibility only: AINS keeps one Lucide family. */
  family?: IconFamily;
  weight?: IconWeight;
  size?: number | string;
  upClassName?: string;
  downClassName?: string;
}

export function Icon({ name, family: _family, weight: _weight, size = 20, upClassName, downClassName, ...rest }: IconProps) {
  if (name === "arrows-down-up") return <ArrowsDownUpIcon size={size} upClassName={upClassName} downClassName={downClassName} {...rest} />;
  const Component = lucideSet[name];
  return Component ? <Component size={size} {...rest} /> : <MissingIcon size={size} {...rest} />;
}
