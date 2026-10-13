import { addDays, startOfDay, endOfDay } from "./utils";

export interface SinglePreset {
  label: string;
  getValue: () => Date;
}

export interface RangePreset {
  label: string;
  getValue: () => { from: Date; to: Date };
}

/** 요일 index: 0=일 ... 6=토 */
function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  return addDays(d, diff);
}

export const defaultSinglePresets: SinglePreset[] = [
  { label: "오늘", getValue: () => startOfDay(new Date()) },
  { label: "내일", getValue: () => addDays(startOfDay(new Date()), 1) },
  { label: "다음 월요일", getValue: () => nextWeekday(new Date(), 1) },
];

export const defaultRangePresets: RangePreset[] = [
  {
    label: "오늘",
    getValue: () => {
      const now = new Date();
      return { from: startOfDay(now), to: endOfDay(now) };
    },
  },
  {
    label: "어제",
    getValue: () => {
      const y = addDays(startOfDay(new Date()), -1);
      return { from: y, to: endOfDay(y) };
    },
  },
  {
    label: "이번 주",
    getValue: () => {
      const today = startOfDay(new Date());
      const day = today.getDay();
      const monday = addDays(today, day === 0 ? -6 : 1 - day);
      return { from: monday, to: endOfDay(addDays(monday, 6)) };
    },
  },
  {
    label: "지난 7일",
    getValue: () => ({
      from: addDays(startOfDay(new Date()), -6),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "이번 달",
    getValue: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      return { from, to };
    },
  },
  {
    label: "지난 30일",
    getValue: () => ({
      from: addDays(startOfDay(new Date()), -29),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "올해",
    getValue: () => {
      const y = new Date().getFullYear();
      return { from: new Date(y, 0, 1), to: endOfDay(new Date(y, 11, 31)) };
    },
  },
];
