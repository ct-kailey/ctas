export type DateValue = Date | null;
export type DateRange = { from: Date | null; to: Date | null };

export const MS_DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function startOfWeek(d: Date, weekStartsOn: number): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  return addDays(x, -diff);
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}

export function isWithin(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export function clampDate(d: Date, min?: Date, max?: Date): Date {
  if (min && isBefore(d, min)) return min;
  if (max && isAfter(d, max)) return max;
  return d;
}

/** yyyy-MM-dd */
export function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** HH:mm */
export function formatHM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** 표시 포맷.
 * - "short":  25-01-15
 * - "iso":    2025-01-15   (기본)
 * - "medium": 2025년 1월 15일
 * - "long":   2025년 1월 15일 (수)
 */
export type DateFormat = "short" | "iso" | "medium" | "long";

const KO_WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function formatDate(d: Date, format: DateFormat = "iso"): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yy = String(y).slice(-2);
  const w = KO_WEEKDAY[d.getDay()];

  switch (format) {
    case "short":
      return `${yy}-${mm}-${dd}`;
    case "medium":
      return `${y}년 ${m}월 ${day}일`;
    case "long":
      return `${y}년 ${m}월 ${day}일 (${w})`;
    case "iso":
    default:
      return `${y}-${mm}-${dd}`;
  }
}

export function combineDateTime(date: Date, hours: number, minutes: number): Date {
  const x = new Date(date);
  x.setHours(hours, minutes, 0, 0);
  return x;
}

/** month의 6행 x 7열 그리드에 들어갈 42일 배열 */
export function buildMonthGrid(month: Date, weekStartsOn: number): Date[] {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const gridStart = startOfWeek(first, weekStartsOn);
  const totalDays = Math.ceil(
    (last.getTime() - gridStart.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;
  const weeks = Math.ceil(totalDays / 7);
  const cells: Date[] = [];
  for (let i = 0; i < weeks * 7; i += 1) cells.push(addDays(gridStart, i));
  return cells;
}

export const WEEKDAY_LABELS_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const MONTH_LABELS_KO = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];
