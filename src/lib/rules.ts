// The booking rules in one place (see docs/FACTSHEET.md, "Booking rules").
// Every booking is one hour. Limits are per person per Canberra day, and joins
// never count. Change a limit here and nowhere else.
import type { Kind } from "./rooms";

export const ADVANCE_DAYS = 14;
export const BOOKING_HOURS = 1;
/** Joiners can check in from this many minutes before the hour until it ends (a demo assumption). */
export const CHECKIN_EARLY_MINUTES = 15;

export type PoolId = "rooms" | "desks" | "accessibility" | "microfilm";

export const POOLS: Record<PoolId, { label: string; limit: number; kinds: Kind[] }> = {
  // The general ANU room rule: 2 hours a day, shared across these kinds.
  rooms: { label: "Rooms", limit: 2, kinds: ["study_room", "study_booth", "the_deck"] },
  desks: { label: "Computer desks", limit: 3, kinds: ["computer_desk"] },
  // Not stated explicitly, so they follow the general rule (a demo assumption).
  accessibility: { label: "Accessibility computer", limit: 2, kinds: ["accessibility_computer"] },
  microfilm: { label: "Microfilm scanner", limit: 2, kinds: ["microfilm_scanner"] },
};

export function poolOf(kind: Kind): PoolId {
  const found = (Object.keys(POOLS) as PoolId[]).find((id) => POOLS[id].kinds.includes(kind));
  if (!found) throw new Error(`no pool for kind ${kind}`);
  return found;
}
