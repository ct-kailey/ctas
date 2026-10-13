"use client";

/**
 * 의미 기반 Icon 컴포넌트.
 *
 * 설계 원칙 — "family별 독립 세트":
 *   - 각 family(phosphor/solar/lucide)는 자기만의 아이콘 세트를 가진다.
 *   - 서로 다른 라이브러리 간의 "의미 매핑"은 하지 않는다.
 *     (search 하나를 phosphor·solar·lucide 세 군데에서 억지로 연결하지 않음)
 *   - 활성 family에 해당 이름이 없으면 그 family 전용 placeholder 아이콘을 렌더.
 *     (레이아웃 공간 유지 + 축 전환 시 "어떤 아이콘이 그 family엔 없다"는 사실이 시각적으로 드러남)
 *
 * weight(regular/fill) 반응:
 *   phosphor → weight prop으로 반응
 *   solar    → Linear(regular) / Bold(fill) 두 컴포넌트 분기
 *   lucide   → regular만 (fill 요청 시 regular 그대로)
 */

import * as React from "react";
import type { IconFamily, IconWeight } from "../_data";
import { useIconAxis } from "./context";

// Phosphor ─────────────────────────────────────────────────────────
import {
  Check as PhCheck,
  Warning as PhWarning,
  Star as PhStar,
  Heart as PhHeart,
  User as PhUser,
  MagnifyingGlass as PhSearch,
  Gear as PhGear,
  Trash as PhTrash,
  ArrowRight as PhArrowRight,
  X as PhX,
  Sun as PhSun,
  Moon as PhMoon,
  CaretDown as PhCaretDown,
  CaretLeft as PhCaretLeft,
  CaretRight as PhCaretRight,
  CaretUp as PhCaretUp,
  CaretUpDown as PhCaretUpDown,
  CaretDoubleLeft as PhCaretDoubleLeft,
  CaretDoubleRight as PhCaretDoubleRight,
  Columns as PhColumns,
  House as PhHouse,
  Palette as PhPalette,
  Ruler as PhRuler,
  Square as PhSquare,
  TextAa as PhTextAa,
  PaintBucket as PhPaintBucket,
  Stack as PhStack,
  Waveform as PhWaveform,
  Devices as PhDevices,
  SquaresFour as PhSquaresFour,
  CursorClick as PhCursorClick,
  SplitVertical as PhSplitVertical,
  Rectangle as PhRectangle,
  List as PhList,
  Rows as PhRows,
  SealCheck as PhSealCheck,
  UserCircle as PhUserCircle,
  Info as PhInfo,
  Tag as PhTag,
  Minus as PhMinus,
  Plus as PhPlus,
  Placeholder as PhPlaceholder,
  Textbox as PhTextbox,
  Keyboard as PhKeyboard,
  Article as PhArticle,
  Selection as PhSelection,
  CheckSquare as PhCheckSquare,
  RadioButton as PhRadioButton,
  ToggleRight as PhToggleRight,
  ToggleLeft as PhToggleLeft,
  Sliders as PhSliders,
  Calendar as PhCalendar,
  CalendarBlank as PhCalendarBlank,
  CalendarDots as PhCalendarDots,
  Clock as PhClock,
  UploadSimple as PhUploadSimple,
  DownloadSimple as PhDownloadSimple,
  IdentificationCard as PhIdentificationCard,
  Table as PhTable,
  GridFour as PhGridFour,
  ListBullets as PhListBullets,
  Cards as PhCards,
  ChartLine as PhChartLine,
  TrendUp as PhTrendUp,
  TrendDown as PhTrendDown,
  Empty as PhEmpty,
  ListDashes as PhListDashes,
  LineSegments as PhLineSegments,
  Tabs as PhTabs,
  Path as PhPath,
  Sidebar as PhSidebar,
  SidebarSimple as PhSidebarSimple,
  DotsThree as PhDotsThree,
  Compass as PhCompass,
  Steps as PhSteps,
  WarningCircle as PhWarningCircle,
  CheckCircle as PhCheckCircle,
  SquareHalf as PhSquareHalf,
  ChatCircle as PhChatCircle,
  ChatText as PhChatText,
  Broadcast as PhBroadcast,
  Bell as PhBell,
  Megaphone as PhMegaphone,
  Speedometer as PhSpeedometer,
  CircleNotch as PhCircleNotch,
  DotsThreeOutline as PhDotsThreeOutline,
  CaretCircleDown as PhCaretCircleDown,
  Command as PhCommand,
  RowsPlusBottom as PhRowsPlusBottom,
  MinusSquare as PhMinusSquare,
  BracketsSquare as PhBracketsSquare,
  GridNine as PhGridNine,
  ArrowsVertical as PhArrowsVertical,
  SplitHorizontal as PhSplitHorizontal,
  Layout as PhLayout,
  Envelope as PhEnvelope,
  Eye as PhEye,
  EyeSlash as PhEyeSlash,
  ArrowSquareOut as PhArrowSquareOut,
  PencilSimple as PhPencilSimple,
  ShareNetwork as PhShareNetwork,
  Copy as PhCopy,
  CopySimple as PhCopySimple,
  Scissors as PhScissors,
  ClipboardText as PhClipboardText,
  Camera as PhCamera,
  Globe as PhGlobe,
} from "@phosphor-icons/react";

// Solar (Linear = regular, Bold = fill) ───────────────────────────
import {
  DangerTriangleLinear as SoWarningL, DangerTriangleBold as SoWarningB,
  StarLinear as SoStarL, StarBold as SoStarB,
  HeartLinear as SoHeartL, HeartBold as SoHeartB,
  UserLinear as SoUserL, UserBold as SoUserB,
  MagniferLinear as SoSearchL, MagniferBold as SoSearchB,
  SettingsLinear as SoGearL, SettingsBold as SoGearB,
  TrashBinMinimalisticLinear as SoTrashL, TrashBinMinimalisticBold as SoTrashB,
  ArrowRightLinear as SoArrowRightL, ArrowRightBold as SoArrowRightB,
  SunLinear as SoSunL, SunBold as SoSunB,
  MoonLinear as SoMoonL, MoonBold as SoMoonB,
  AltArrowDownLinear as SoCaretDownL, AltArrowDownBold as SoCaretDownB,
  AltArrowLeftLinear as SoCaretLeftL, AltArrowLeftBold as SoCaretLeftB,
  AltArrowRightLinear as SoCaretRightL, AltArrowRightBold as SoCaretRightB,
  AltArrowUpLinear as SoCaretUpL, AltArrowUpBold as SoCaretUpB,
  SortVerticalLinear as SoCaretUpDownL, SortVerticalBold as SoCaretUpDownB,
  DoubleAltArrowLeftLinear as SoCaretDoubleLeftL, DoubleAltArrowLeftBold as SoCaretDoubleLeftB,
  DoubleAltArrowRightLinear as SoCaretDoubleRightL, DoubleAltArrowRightBold as SoCaretDoubleRightB,
  ScissorsLinear as SoScissorsL, ScissorsBold as SoScissorsB,
  CopyLinear as SoCopyL, CopyBold as SoCopyB,
  ClipboardTextLinear as SoClipboardTextL, ClipboardTextBold as SoClipboardTextB,
  ShareLinear as SoShareL, ShareBold as SoShareB,
  SquareTopUpLinear as SoSquareTopUpL, SquareTopUpBold as SoSquareTopUpB,
  PenLinear as SoPenL, PenBold as SoPenB,
  DocumentTextLinear as SoDocumentTextL, DocumentTextBold as SoDocumentTextB,
  InfoCircleLinear as SoInfoCircleL, InfoCircleBold as SoInfoCircleB,
  ListLinear as SoListL, ListBold as SoListB,
  Widget5Linear as SoWidget5L, Widget5Bold as SoWidget5B,
  Widget2Linear as SoWidget2L, Widget2Bold as SoWidget2B,
} from "solar-icon-set";

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

// 표준 아이콘 이름. family별 세트가 서로 완전히 겹칠 필요 없음 — 각 family에
// 있는 것만 렌더하고 나머지는 family별 placeholder로 떨어진다.
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
// Solar는 weight별 두 컴포넌트가 필요. 다른 family는 단일 컴포넌트.
type SolarPair = { regular: AnyComp; fill: AnyComp };

/* phosphor 세트 — 가장 풍부. 지금까지 쓰던 아이콘 전원 보유. */
const phosphorSet: Partial<Record<IconName, AnyComp>> = {
  check: PhCheck,
  warning: PhWarning,
  star: PhStar,
  heart: PhHeart,
  user: PhUser,
  search: PhSearch,
  gear: PhGear,
  trash: PhTrash,
  "arrow-right": PhArrowRight,
  x: PhX,
  sun: PhSun,
  moon: PhMoon,
  "caret-down": PhCaretDown,
  "caret-left": PhCaretLeft,
  "caret-right": PhCaretRight,
  "caret-up": PhCaretUp,
  "caret-up-down": PhCaretUpDown,
  "caret-double-left": PhCaretDoubleLeft,
  "caret-double-right": PhCaretDoubleRight,
  columns: PhColumns,
  house: PhHouse,
  palette: PhPalette,
  ruler: PhRuler,
  square: PhSquare,
  "text-aa": PhTextAa,
  "paint-bucket": PhPaintBucket,
  stack: PhStack,
  waveform: PhWaveform,
  devices: PhDevices,
  "squares-four": PhSquaresFour,
  "cursor-click": PhCursorClick,
  "split-vertical": PhSplitVertical,
  rectangle: PhRectangle,
  list: PhList,
  rows: PhRows,
  "seal-check": PhSealCheck,
  "user-circle": PhUserCircle,
  info: PhInfo,
  tag: PhTag,
  minus: PhMinus,
  plus: PhPlus,
  placeholder: PhPlaceholder,
  textbox: PhTextbox,
  keyboard: PhKeyboard,
  article: PhArticle,
  selection: PhSelection,
  "check-square": PhCheckSquare,
  "radio-button": PhRadioButton,
  "toggle-right": PhToggleRight,
  "toggle-left": PhToggleLeft,
  sliders: PhSliders,
  calendar: PhCalendar,
  "calendar-blank": PhCalendarBlank,
  "calendar-dots": PhCalendarDots,
  clock: PhClock,
  "upload-simple": PhUploadSimple,
  "download-simple": PhDownloadSimple,
  "identification-card": PhIdentificationCard,
  table: PhTable,
  "grid-four": PhGridFour,
  "list-bullets": PhListBullets,
  cards: PhCards,
  "chart-line": PhChartLine,
  "trend-up": PhTrendUp,
  "trend-down": PhTrendDown,
  empty: PhEmpty,
  "list-dashes": PhListDashes,
  "line-segments": PhLineSegments,
  tabs: PhTabs,
  path: PhPath,
  sidebar: PhSidebar,
  "sidebar-simple": PhSidebarSimple,
  "dots-three": PhDotsThree,
  compass: PhCompass,
  steps: PhSteps,
  "warning-circle": PhWarningCircle,
  "check-circle": PhCheckCircle,
  "square-half": PhSquareHalf,
  "chat-circle": PhChatCircle,
  "chat-text": PhChatText,
  broadcast: PhBroadcast,
  bell: PhBell,
  megaphone: PhMegaphone,
  speedometer: PhSpeedometer,
  "circle-notch": PhCircleNotch,
  "dots-three-outline": PhDotsThreeOutline,
  "caret-circle-down": PhCaretCircleDown,
  command: PhCommand,
  "rows-plus-bottom": PhRowsPlusBottom,
  "minus-square": PhMinusSquare,
  "brackets-square": PhBracketsSquare,
  "grid-nine": PhGridNine,
  "arrows-vertical": PhArrowsVertical,
  "split-horizontal": PhSplitHorizontal,
  layout: PhLayout,
  envelope: PhEnvelope,
  eye: PhEye,
  "eye-slash": PhEyeSlash,
  "arrow-square-out": PhArrowSquareOut,
  "pencil-simple": PhPencilSimple,
  "share-network": PhShareNetwork,
  copy: PhCopy,
  "copy-simple": PhCopySimple,
  scissors: PhScissors,
  "clipboard-text": PhClipboardText,
  camera: PhCamera,
  globe: PhGlobe,
};

/* solar 세트 — 라이브러리에 자연스러운 1:1 대응이 있는 것만.
   매핑 안 된 이름은 solar family에서 placeholder로 떨어진다. */
const solarSet: Partial<Record<IconName, SolarPair>> = {
  warning: { regular: SoWarningL, fill: SoWarningB },
  star: { regular: SoStarL, fill: SoStarB },
  heart: { regular: SoHeartL, fill: SoHeartB },
  user: { regular: SoUserL, fill: SoUserB },
  search: { regular: SoSearchL, fill: SoSearchB },
  gear: { regular: SoGearL, fill: SoGearB },
  trash: { regular: SoTrashL, fill: SoTrashB },
  "arrow-right": { regular: SoArrowRightL, fill: SoArrowRightB },
  sun: { regular: SoSunL, fill: SoSunB },
  moon: { regular: SoMoonL, fill: SoMoonB },
  "caret-down": { regular: SoCaretDownL, fill: SoCaretDownB },
  "caret-left": { regular: SoCaretLeftL, fill: SoCaretLeftB },
  "caret-right": { regular: SoCaretRightL, fill: SoCaretRightB },
  "caret-up": { regular: SoCaretUpL, fill: SoCaretUpB },
  "caret-up-down": { regular: SoCaretUpDownL, fill: SoCaretUpDownB },
  "caret-double-left": { regular: SoCaretDoubleLeftL, fill: SoCaretDoubleLeftB },
  "caret-double-right": { regular: SoCaretDoubleRightL, fill: SoCaretDoubleRightB },
  "squares-four": { regular: SoWidget5L, fill: SoWidget5B },
  list: { regular: SoListL, fill: SoListB },
  info: { regular: SoInfoCircleL, fill: SoInfoCircleB },
  article: { regular: SoDocumentTextL, fill: SoDocumentTextB },
  "grid-four": { regular: SoWidget2L, fill: SoWidget2B },
  "arrow-square-out": { regular: SoSquareTopUpL, fill: SoSquareTopUpB },
  "pencil-simple": { regular: SoPenL, fill: SoPenB },
  "share-network": { regular: SoShareL, fill: SoShareB },
  copy: { regular: SoCopyL, fill: SoCopyB },
  "copy-simple": { regular: SoCopyL, fill: SoCopyB },
  scissors: { regular: SoScissorsL, fill: SoScissorsB },
  "clipboard-text": { regular: SoClipboardTextL, fill: SoClipboardTextB },
};

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
  /** 축 기본값(html data-icon-family) 오버라이드 */
  family?: IconFamily;
  /** phosphor·solar에서 실제 반응. lucide는 무시(regular 유지). */
  weight?: IconWeight;
  size?: number | string;
  /** arrows-down-up 전용: 상/하 path 톤을 각기 제어. 다른 아이콘에서는 무시. */
  upClassName?: string;
  downClassName?: string;
}

export function Icon({
  name,
  family: familyProp,
  weight: weightProp,
  size = 20,
  upClassName,
  downClassName,
  ...rest
}: IconProps) {
  const axis = useIconAxis();
  const family = familyProp ?? axis.family;
  const weight = weightProp ?? axis.weight;

  /* family와 무관하게 늘 같은 모양으로 나와야 하는 커스텀 아이콘 분기. */
  if (name === "arrows-down-up") {
    return (
      <ArrowsDownUpIcon
        size={size}
        upClassName={upClassName}
        downClassName={downClassName}
        {...rest}
      />
    );
  }

  let Component: AnyComp;
  let familyProps: Record<string, unknown> = {};

  if (family === "solar") {
    const entry = solarSet[name];
    if (!entry) return <MissingIcon size={size} {...rest} />;
    Component = entry[weight];
  } else if (family === "lucide") {
    const entry = lucideSet[name];
    if (!entry) return <MissingIcon size={size} {...rest} />;
    Component = entry;
  } else {
    // phosphor (기본)
    const entry = phosphorSet[name];
    if (!entry) return <MissingIcon size={size} {...rest} />;
    Component = entry;
    familyProps = { weight };
  }

  return <Component size={size} {...familyProps} {...rest} />;
}
