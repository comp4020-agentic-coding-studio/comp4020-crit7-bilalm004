// What the pages show for a space at an hour, read from real bookings.
// "shared" arrives with Tier 2; until then a taken slot is simply "booked".
import { bookingsBetween } from "./db";
import type { Booking } from "./db";
import type { Space } from "./rooms";
import { canberraNow, canberraToUtc, type Now } from "./time";

export type State =
  | { kind: "past" }
  | { kind: "booked"; mine: boolean; bookingId: number }
  | { kind: "free" }
  | { kind: "shared"; spare: number; booker: string | null; requests: boolean };

/** Bookings keyed by space and the UTC start of the hour. */
export type Occupancy = Map<string, Booking>;

export function loadOccupancy(fromDate: string, toDate: string): Occupancy {
  return new Map(bookingsBetween(fromDate, toDate).map((b) => [`${b.roomId}|${b.startUtc}`, b]));
}

export function stateOf(
  space: Space,
  date: string,
  hour: number,
  now: Now,
  occ: Occupancy,
  userId?: string,
): State {
  if (date < now.date || (date === now.date && hour < now.hour)) return { kind: "past" };
  const b = occ.get(`${space.id}|${canberraToUtc(date, hour).toISOString()}`);
  if (!b) return { kind: "free" };
  return { kind: "booked", mine: b.userId === userId, bookingId: b.id };
}

export { canberraNow };

import { getSpace } from "./rooms";
import { POOLS, poolOf, type PoolId } from "./rules";

/** Bookings used today per pool, for "1 of 2 used". */
export function usageToday(mine: Booking[], now: Now): Record<PoolId, number> {
  const used = Object.fromEntries(Object.keys(POOLS).map((id) => [id, 0])) as Record<PoolId, number>;
  for (const b of mine) {
    const space = getSpace(b.roomId);
    if (space && canberraNow(new Date(b.startUtc)).date === now.date) used[poolOf(space.kind)] += 1;
  }
  return used;
}
