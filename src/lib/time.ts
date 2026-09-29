// All dates and hours in the app are Australia/Canberra wall-clock time, as
// "YYYY-MM-DD" strings and integer hours 0-23. Storage will use UTC (see
// CLAUDE.md); these helpers are for what people see and pick.
const TZ = "Australia/Canberra";

export type Now = { date: string; hour: number };

export function canberraNow(at = new Date()): Now {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
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
