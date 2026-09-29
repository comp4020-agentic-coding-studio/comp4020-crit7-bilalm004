// PROTOTYPE DATA. Availability, bookings and messages here are generated, not
// stored, so the UI can be judged before the schema exists. Replace every use
// with a database read when the schema lands, then delete this file.
import { poolOf, POOLS, type PoolId } from "./rules";
import { getSpace, type Space } from "./rooms";
import { addDays, type Now } from "./time";

export type State =
  | { kind: "past" }
  | { kind: "booked" }
  | { kind: "free" }
  | { kind: "shared"; spare: number; booker: string | null; requests: boolean };

const NAMES = ["Priya S.", "Sam T.", "Mei T.", "Jordan R."];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A stable pseudo-random state per space and hour: busier in the daytime. */
export function sampleState(space: Space, date: string, hour: number, now: Now): State {
  if (date < now.date || (date === now.date && hour < now.hour)) return { kind: "past" };
  const h = hash(`${space.id}|${date}|${hour}`) % 100;
  const busy = hour >= 9 && hour <= 20 ? 45 : 12;
  if (h >= busy) return { kind: "free" };
  if (space.shareable && h % 2 === 0) {
    return {
      kind: "shared",
      spare: 1 + (h % (space.capacity - 1)),
      // A booker's name is shown only if they chose to make it public.
      booker: h % 4 === 0 ? NAMES[h % NAMES.length] : null,
      requests: h % 5 !== 0,
    };
  }
  return { kind: "booked" };
}

export type SampleMessage = { id: number; unread: boolean; title: string; body: string };

export const SAMPLE_INBOX: SampleMessage[] = [
  {
    id: 1,
    unread: true,
    title: "Priya S. asked to join your booking",
    body: "Chifley · Study room 3.05 · “Can I take one of the spare seats? I only need it for the hour.”",
  },
  {
    id: 2,
    unread: true,
    title: "Your request was accepted",
    body: "Hancock · Study room 3.29 · Sam T. confirmed a seat for you.",
  },
  {
    id: 3,
    unread: false,
    title: "A booking you joined was cancelled",
    body: "Menzies · Study room 115A · The booker cancelled. Your seat is released.",
  },
];

export const unreadCount = () => SAMPLE_INBOX.filter((m) => m.unread).length;

export type SampleBooking = {
  id: number;
  space: Space;
  date: string;
  hour: number;
  shared: boolean;
  seatsUsed: number;
  joiners: number;
  namePublic: boolean;
};

export function sampleBookings(now: Now): SampleBooking[] {
  const rows = [
    ["chifley-study-room-3-05", now.date, Math.min(now.hour + 2, 23), true, 2, 1, false],
    ["chifley-computer-desk-2-31", now.date, Math.min(now.hour + 1, 23), false, 1, 0, false],
    ["hancock-study-room-3-29", addDays(now.date, 1), 10, false, 4, 0, false],
  ] as const;
  return rows.flatMap(([spaceId, date, hour, shared, seatsUsed, joiners, namePublic], i) => {
    const space = getSpace(spaceId);
    return space ? [{ id: i + 1, space, date, hour, shared, seatsUsed, joiners, namePublic }] : [];
  });
}

/** Bookings used today per pool, for the "1 of 2 used" display. */
export function usageToday(bookings: SampleBooking[], now: Now): Record<PoolId, number> {
  const used = Object.fromEntries(Object.keys(POOLS).map((id) => [id, 0])) as Record<PoolId, number>;
  for (const b of bookings) if (b.date === now.date) used[poolOf(b.space.kind)] += 1;
  return used;
}
