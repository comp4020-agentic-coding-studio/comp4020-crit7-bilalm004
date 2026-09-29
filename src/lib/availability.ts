// What the pages show for a space at an hour, read from real bookings.
// "shared" arrives with Tier 2; until then a taken slot is simply "booked".
import { bookingsBetween, type Booking, type BookingRow } from "./db";
import { spareSeats } from "./booking";
import { DEMO_USERS } from "./users";
import type { Space } from "./rooms";
import { canberraNow, canberraToUtc, type Now } from "./time";

export type State =
  | { kind: "past" }
  | { kind: "booked"; mine: boolean; bookingId: number }
  | { kind: "free" }
  | {
      kind: "shared";
      bookingId: number;
      spare: number;
      /** Only set when the booker chose to show their name. Never the id. */
      booker: string | null;
      mine: boolean;
      joined: boolean;
      requests: boolean;
    };

/** Bookings keyed by space and the UTC start of the hour. */
export type Occupancy = Map<string, BookingRow>;

export function loadOccupancy(fromDate: string, toDate: string): Occupancy {
  return new Map(bookingsBetween(fromDate, toDate).map((r) => [`${r.booking.roomId}|${r.booking.startUtc}`, r]));
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
  const row = occ.get(`${space.id}|${canberraToUtc(date, hour).toISOString()}`);
  if (!row) return { kind: "free" };
  const { booking: b, joinerIds } = row;
  const mine = b.userId === userId;
  const joined = !!userId && joinerIds.includes(userId);
  const spare = spareSeats(space.capacity, b.seatsUsed, joinerIds.length);
  // A full or unshared booking looks like any other booked slot.
  if (!b.shared || (spare === 0 && !mine && !joined)) return { kind: "booked", mine, bookingId: b.id };
  // Privacy: the name leaves the server only if the booker chose to show it.
  const booker = b.namePublic ? (DEMO_USERS.find((u) => u.id === b.userId)?.name ?? null) : null;
  return { kind: "shared", bookingId: b.id, spare, booker, mine, joined, requests: false };
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
