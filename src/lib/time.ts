// All dates and hours in the app are Australia/Canberra wall-clock time, as
// "YYYY-MM-DD" strings and integer hours 0-23. Storage will use UTC (see
// CLAUDE.md); these helpers are for what people see and pick.
const TZ = "Australia/Canberra";

export type Now = { date: string; hour: number };

// Building an Intl formatter is slow, and the pages ask for thousands of
// slots, so it is built once.
const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function canberraNow(at = new Date()): Now {
  const parts = FORMAT.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today plus `advance` days, inclusive. */
export function bookableDates(today: string, advance: number): string[] {
  return Array.from({ length: advance + 1 }, (_, i) => addDays(today, i));
}

export function dateLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function slotLabel(hour: number): string {
  return `${hourLabel(hour)}–${hourLabel((hour + 1) % 24)}`;
}

/** The instant a Canberra wall-clock date and hour starts (handles daylight saving). */
const startCache = new Map<string, number>();
export function canberraToUtc(date: string, hour: number): Date {
  const key = `${date}|${hour}`;
  const hit = startCache.get(key);
  if (hit !== undefined) return new Date(hit);
  const t = computeStart(date, hour);
  if (startCache.size > 5000) startCache.clear();
  startCache.set(key, t.getTime());
  return t;
}

function computeStart(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hour);
  let t = wanted;
  for (let i = 0; i < 2; i++) {
    const c = canberraNow(new Date(t));
    const [cy, cm, cd] = c.date.split("-").map(Number);
    t = wanted - (Date.UTC(cy, cm - 1, cd, c.hour) - t);
  }
  return new Date(t);
}

export const HOUR_MS = 3_600_000;
