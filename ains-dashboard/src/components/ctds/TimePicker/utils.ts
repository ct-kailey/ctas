export type TimeValue = { hours: number; minutes: number };

export type TimeFormat = "24h" | "12h";

/** step 분 단위로 자정부터 하루치 슬롯 생성. endExclusive=24시간. */
export function buildSlots(stepMinutes: number): TimeValue[] {
  const list: TimeValue[] = [];
  const total = Math.floor((24 * 60) / stepMinutes);
  for (let i = 0; i < total; i += 1) {
    const total = i * stepMinutes;
    list.push({ hours: Math.floor(total / 60), minutes: total % 60 });
  }
  return list;
}

export function clampStep(step: number): number {
  if (step <= 0) return 30;
  if (step > 60) return 60;
  return step;
}

/** "HH:MM" (24h). placeholder 치환용엔 null 반환. */
export function format24(t: TimeValue | null): string {
  if (!t) return "";
  const h = String(t.hours).padStart(2, "0");
  const m = String(t.minutes).padStart(2, "0");
  return `${h}:${m}`;
}

/** "h:MM AM" 형식. */
export function format12(t: TimeValue | null): string {
  if (!t) return "";
  const suffix = t.hours < 12 ? "AM" : "PM";
  const hour12 = t.hours % 12 === 0 ? 12 : t.hours % 12;
  const m = String(t.minutes).padStart(2, "0");
  return `${hour12}:${m} ${suffix}`;
}

export function formatTime(t: TimeValue | null, format: TimeFormat): string {
  return format === "12h" ? format12(t) : format24(t);
}

/**
 * 자유 타이핑 파싱.
 * - "14:30", "1430", "14.30" → 14:30
 * - "2:30pm", "2:30 pm", "230p" → 14:30
 * - "9", "09" → 09:00
 * - "9:5" → 09:05
 * 실패 시 null.
 */
export function parseTimeInput(raw: string): TimeValue | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;

  let suffix: "am" | "pm" | null = null;
  let core = s;
  if (/am\b|a\.?m\.?\s*$|\ba$/.test(core) || core.endsWith("a")) {
    suffix = "am";
    core = core.replace(/\s*(a\.?m\.?|am|a)\s*$/i, "");
  } else if (/pm\b|p\.?m\.?\s*$|\bp$/.test(core) || core.endsWith("p")) {
    suffix = "pm";
    core = core.replace(/\s*(p\.?m\.?|pm|p)\s*$/i, "");
  }
  core = core.trim();

  let hours: number;
  let minutes: number;

  const sep = core.match(/^(\d{1,2})\s*[:.\s]\s*(\d{1,2})$/);
  if (sep) {
    hours = Number(sep[1]);
    minutes = Number(sep[2]);
  } else if (/^\d{3,4}$/.test(core)) {
    const padded = core.padStart(4, "0");
    hours = Number(padded.slice(0, 2));
    minutes = Number(padded.slice(2));
  } else if (/^\d{1,2}$/.test(core)) {
    hours = Number(core);
    minutes = 0;
  } else {
    return null;
  }

  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

/** HH:MM 문자열 → 분. 유효하지 않으면 null. */
export function toMinutes(hhmm: string | TimeValue | null | undefined): number | null {
  if (hhmm == null) return null;
  if (typeof hhmm === "object") return hhmm.hours * 60 + hhmm.minutes;
  const parsed = parseTimeInput(hhmm);
  return parsed ? parsed.hours * 60 + parsed.minutes : null;
}

export function toTotalMinutes(t: TimeValue): number {
  return t.hours * 60 + t.minutes;
}

export function isSameTime(a: TimeValue | null, b: TimeValue | null): boolean {
  if (!a || !b) return false;
  return a.hours === b.hours && a.minutes === b.minutes;
}

/** step에 맞춰 반올림 (내림 기준). */
export function snapToStep(t: TimeValue, stepMinutes: number): TimeValue {
  const total = t.hours * 60 + t.minutes;
  const snapped = Math.floor(total / stepMinutes) * stepMinutes;
  return { hours: Math.floor(snapped / 60), minutes: snapped % 60 };
}
