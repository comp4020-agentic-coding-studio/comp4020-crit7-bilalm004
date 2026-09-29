// Booking rules as a pure function: no database, no clock. The caller passes
// in what it needs (the bookings that could clash) and the current time, so
// the same rules run in the server and in tests. See docs/PLAN.md.
import { getSpace } from "./rooms";
import { ADVANCE_DAYS, CHECKIN_EARLY_MINUTES, poolOf, POOLS } from "./rules";
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
  | "daily_limit"
  | "not_shareable"
  | "bad_seats"
  | "has_joiners"
  | "own_booking"
  | "not_shared"
  | "full"
  | "already_joined"
  | "requests_off"
  | "already_requested"
  | "not_joined"
  | "already_checked_in"
  | "too_early"
  | "too_late";

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
  /** Existing bookings of the person asking (any space). These use the daily limit. */
  myBookings: Slot[],
  /** Slots the person has joined. They count for overlap but never for the limit. */
  myJoins: Slot[] = [],
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
  if ([...myBookings, ...myJoins].some((b) => overlaps(slot, b)))
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

export const spareSeats = (capacity: number, seatsUsed: number, joiners: number) =>
  Math.max(0, capacity - seatsUsed - joiners);

/** Offering seats: only spaces of 2+ seats, and the booker keeps at least one seat and leaves at least one spare. */
export function validateShare(roomId: string, seatsUsed: number, joiners: number): Verdict | null {
  const space = getSpace(roomId);
  if (!space) return fail("unknown_space", "That space doesn’t exist.");
  if (!space.shareable) return fail("not_shareable", "A single-seat space can’t be shared.");
  if (!Number.isInteger(seatsUsed) || seatsUsed < 1 || seatsUsed > space.capacity - 1 - joiners)
    return fail(
      "bad_seats",
      joiners > 0
        ? `Others have joined, so you can use at most ${space.capacity - 1 - joiners} seats.`
        : `Choose between 1 and ${space.capacity - 1} seats for yourself.`,
    );
  return null;
}

export type JoinTarget = Slot & { userId: string; shared: boolean; seatsUsed: number; joiners: string[] };

export function validateJoin(
  target: JoinTarget,
  userId: string,
  now: Date,
  myBookings: Slot[],
  myJoins: Slot[],
): Verdict {
  const space = getSpace(target.roomId);
  if (!space) return fail("unknown_space", "That space doesn’t exist.");
  if (target.userId === userId) return fail("own_booking", "That’s your own booking.");
  if (!target.shared || !space.shareable) return fail("not_shared", "That booking isn’t open to others.");
  if (target.joiners.includes(userId)) return fail("already_joined", "You’ve already joined that booking.");
  const thisHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  if (new Date(target.startUtc).getTime() < thisHour) return fail("past", "That time has already passed.");
  if (spareSeats(space.capacity, target.seatsUsed, target.joiners.length) < 1)
    return fail("full", "No seats are left on that booking.");
  if ([...myBookings, ...myJoins].some((b) => overlaps(target, b)))
    return fail("you_overlap", "You already have a booking or a join at that time.");
  return { ok: true, endUtc: target.endUtc };
}

/** Asking the booker: the same seat and overlap rules as a join, plus the booker's switch and no repeat asks. */
export function validateRequest(
  target: JoinTarget & { requestsOn: boolean },
  userId: string,
  now: Date,
  myBookings: Slot[],
  myJoins: Slot[],
  alreadyRequested: boolean,
): Verdict {
  if (target.userId !== userId && target.shared && !target.requestsOn)
    return fail("requests_off", "The booker isn’t taking requests for this booking.");
  if (alreadyRequested) return fail("already_requested", "You’ve already asked for a seat on this booking.");
  return validateJoin(target, userId, now, myBookings, myJoins);
}

/** Checking in: only someone who joined, once, from a little before the hour until it ends. */
export function validateCheckIn(
  target: Slot,
  isJoiner: boolean,
  alreadyCheckedIn: boolean,
  now: Date,
): Verdict {
  if (!isJoiner) return fail("not_joined", "You haven’t joined that booking.");
  if (alreadyCheckedIn) return fail("already_checked_in", "You’ve already checked in.");
  const t = now.getTime();
  if (t < new Date(target.startUtc).getTime() - CHECKIN_EARLY_MINUTES * 60_000)
    return fail("too_early", `You can check in from ${CHECKIN_EARLY_MINUTES} minutes before the hour.`);
  if (t >= new Date(target.endUtc).getTime()) return fail("too_late", "That booking has ended.");
  return { ok: true, endUtc: target.endUtc };
}
