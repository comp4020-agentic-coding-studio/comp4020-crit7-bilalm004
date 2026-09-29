// Booking rules as a pure function: no database, no clock. The caller passes
// in what it needs (the bookings that could clash) and the current time, so
// the same rules run in the server and in tests. See docs/PLAN.md.
import { getSpace } from "./rooms";
import { ADVANCE_DAYS, poolOf, POOLS } from "./rules";
import { addDays, canberraNow, canberraToUtc, HOUR_MS } from "./time";

export type Slot = { roomId: string; startUtc: string; endUtc: string };

export type BookingError =
  | "unknown_space"
  | "bad_time"
  | "not_one_hour"
  | "past"
  | "too_far_ahead"
  | "clash"
  | "you_overlap"
  | "daily_limit";

export type Verdict = { ok: true; endUtc: string } | { ok: false; error: BookingError; message: string };

const fail = (error: BookingError, message: string): Verdict => ({ ok: false, error, message });

/** Half-open intervals [start, end): back-to-back slots don't overlap. */
const overlaps = (a: Slot, b: Slot) => a.startUtc < b.endUtc && b.startUtc < a.endUtc;

export function slotFor(date: string, hour: number): { startUtc: string; endUtc: string } {
  const start = canberraToUtc(date, hour);
  return { startUtc: start.toISOString(), endUtc: new Date(start.getTime() + HOUR_MS).toISOString() };
}

export function validateBooking(
  req: Slot,
  now: Date,
  /** Existing bookings of the same space. */
  spaceBookings: Slot[],
  /** Existing bookings of the person asking (any space). */
  myBookings: Slot[],
): Verdict {
  const space = getSpace(req.roomId);
  if (!space) return fail("unknown_space", "That space doesn’t exist.");

  const start = new Date(req.startUtc);
  const end = new Date(req.endUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return fail("bad_time", "That time isn’t valid.");
  if (start.getTime() % HOUR_MS !== 0) return fail("bad_time", "Bookings start on the hour.");
  if (end.getTime() - start.getTime() !== HOUR_MS)
    return fail("not_one_hour", "Every booking is exactly one hour.");

  // The current hour is still bookable; anything earlier is past.
  const thisHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  if (start.getTime() < thisHour) return fail("past", "That time has already passed.");

  const today = canberraNow(now).date;
  const day = canberraNow(start).date;
  if (day > addDays(today, ADVANCE_DAYS))
    return fail("too_far_ahead", `You can book up to ${ADVANCE_DAYS} days ahead.`);

  const iso = { startUtc: start.toISOString(), endUtc: end.toISOString() };
  const slot = { roomId: req.roomId, ...iso };
  if (spaceBookings.some((b) => overlaps(slot, b))) return fail("clash", "Someone has already booked that slot.");
  if (myBookings.some((b) => overlaps(slot, b)))
    return fail("you_overlap", "You already have a booking at that time.");

  const pool = poolOf(space.kind);
  const usedThatDay = myBookings.filter((b) => {
    const s = getSpace(b.roomId);
    return s && poolOf(s.kind) === pool && canberraNow(new Date(b.startUtc)).date === day;
  }).length;
  if (usedThatDay >= POOLS[pool].limit)
    return fail(
      "daily_limit",
      `You’ve used all ${POOLS[pool].limit} ${POOLS[pool].label.toLowerCase()} bookings for that day.`,
    );

  return { ok: true, endUtc: iso.endUtc };
}
