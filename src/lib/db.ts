import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { slotFor, validateBooking, validateJoin, validateShare, type BookingError } from "./booking";
import { emitSlot } from "./events";
import { getSpace } from "./rooms";
import { addDays, canberraToUtc } from "./time";
import { bookings, joins, type Booking } from "./schema";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

export type { Booking };

/** A booking with the ids of the people who joined it. The ids never leave the server. */
export type BookingRow = { booking: Booking; joinerIds: string[] };

/** Bookings starting in [fromDate, toDate] (Canberra days, inclusive). */
export function bookingsBetween(fromDate: string, toDate: string): BookingRow[] {
  const from = canberraToUtc(fromDate, 0).toISOString();
  const to = canberraToUtc(addDays(toDate, 1), 0).toISOString();
  const rows = db
    .select()
    .from(bookings)
    .where(and(gte(bookings.startUtc, from), lt(bookings.startUtc, to)))
    .all();
  const joiners = joinersOf(rows.map((r) => r.id));
  return rows.map((booking) => ({ booking, joinerIds: joiners.get(booking.id) ?? [] }));
}

export function joinersOf(bookingIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (bookingIds.length === 0) return out;
  for (const j of db.select().from(joins).where(inArray(joins.bookingId, bookingIds)).all()) {
    out.set(j.bookingId, [...(out.get(j.bookingId) ?? []), j.userId]);
  }
  return out;
}

/** Upcoming bookings the person has joined (someone else's booking). */
export function joinedBy(userId: string, now = new Date()): Booking[] {
  const from = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  return db
    .select({ b: bookings })
    .from(joins)
    .innerJoin(bookings, eq(joins.bookingId, bookings.id))
    .where(and(eq(joins.userId, userId), gte(bookings.startUtc, from)))
    .orderBy(asc(bookings.startUtc))
    .all()
    .map((r) => r.b);
}

export function bookingsOf(userId: string, now = new Date()): Booking[] {
  // Upcoming, including the current hour.
  const from = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  return db
    .select()
    .from(bookings)
    .where(and(eq(bookings.userId, userId), gte(bookings.startUtc, from)))
    .orderBy(asc(bookings.startUtc))
    .all();
}

export type BookResult = { ok: true; booking: Booking } | { ok: false; error: BookingError; message: string };

/** Validate and insert in one transaction, so two people can't take the same slot. */
export function createBooking(
  userId: string,
  roomId: string,
  date: string,
  hour: number,
  share?: { seatsUsed: number; namePublic: boolean },
  now = new Date(),
): BookResult {
  if (!getSpace(roomId)) return { ok: false, error: "unknown_space", message: "That space doesn’t exist." };
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "bad_time", message: "That time isn’t valid." };
  const { startUtc, endUtc } = slotFor(date, hour);
  const result = client.transaction((): BookResult => {
    const mine = db.select().from(bookings).where(eq(bookings.userId, userId)).all();
    const here = db.select().from(bookings).where(eq(bookings.roomId, roomId)).all();
    const verdict = validateBooking({ roomId, startUtc, endUtc }, now, here, mine, joinedSlots(userId));
    if (!verdict.ok) return verdict;
    const bad = share ? validateShare(roomId, share.seatsUsed, 0) : null;
    if (bad && !bad.ok) return bad;
    const booking = db
      .insert(bookings)
      .values({
        roomId,
        userId,
        startUtc,
        endUtc,
        shared: !!share,
        seatsUsed: share?.seatsUsed ?? 1,
        namePublic: share?.namePublic ?? false,
      })
      .returning()
      .get();
    return { ok: true, booking };
  })();
  if (result.ok) emitSlot({ roomId, startUtc });
  return result;
}

export function cancelBooking(userId: string, id: number): Booking | undefined {
  return db
    .delete(bookings)
    .where(and(eq(bookings.id, id), eq(bookings.userId, userId))) // ownership is checked here, not in the UI
    .returning()
    .get();
}

/** The slots a person has joined, for overlap checks. */
function joinedSlots(userId: string) {
  return db
    .select({ roomId: bookings.roomId, startUtc: bookings.startUtc, endUtc: bookings.endUtc })
    .from(joins)
    .innerJoin(bookings, eq(joins.bookingId, bookings.id))
    .where(eq(joins.userId, userId))
    .all();
}

export type ChangeResult = { ok: true } | { ok: false; error: BookingError; message: string };
const notFound: ChangeResult = { ok: false, error: "not_shared", message: "That booking wasn’t found." };

/** Take one spare seat on a shared booking. Direct: no approval. */
export function joinBooking(userId: string, bookingId: number, now = new Date()): ChangeResult {
  let touched: Booking | undefined;
  const result = client.transaction((): ChangeResult => {
    const target = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
    if (!target) return notFound;
    const joiners = joinersOf([target.id]).get(target.id) ?? [];
    const mine = db.select().from(bookings).where(eq(bookings.userId, userId)).all();
    const verdict = validateJoin({ ...target, joiners }, userId, now, mine, joinedSlots(userId));
    if (!verdict.ok) return verdict;
    db.insert(joins).values({ bookingId, userId }).run();
    touched = target;
    return { ok: true };
  })();
  if (touched) emitSlot({ roomId: touched.roomId, startUtc: touched.startUtc });
  return result;
}

export function leaveBooking(userId: string, bookingId: number): ChangeResult {
  const target = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
  const gone = db
    .delete(joins)
    .where(and(eq(joins.bookingId, bookingId), eq(joins.userId, userId)))
    .returning()
    .get();
  if (!gone || !target) return { ok: false, error: "not_shared", message: "You hadn’t joined that booking." };
  emitSlot({ roomId: target.roomId, startUtc: target.startUtc });
  return { ok: true };
}

/** The booker turns sharing on or off, or changes seats and privacy. */
export function updateSharing(
  userId: string,
  bookingId: number,
  next: { shared: boolean; seatsUsed: number; namePublic: boolean },
): ChangeResult {
  let touched: Booking | undefined;
  const result = client.transaction((): ChangeResult => {
    const b = db
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.userId, userId))) // owner only
      .get();
    if (!b) return notFound;
    const joiners = joinersOf([b.id]).get(b.id) ?? [];
    if (!next.shared) {
      if (joiners.length > 0)
        return { ok: false, error: "has_joiners", message: "Others have joined, so you can’t stop sharing. Cancel the booking instead." };
    } else {
      const bad = validateShare(b.roomId, next.seatsUsed, joiners.length);
      if (bad && !bad.ok) return bad;
    }
    db.update(bookings)
      .set({
        shared: next.shared,
        seatsUsed: next.shared ? next.seatsUsed : 1,
        namePublic: next.shared ? next.namePublic : false,
      })
      .where(eq(bookings.id, bookingId))
      .run();
    touched = b;
    return { ok: true };
  })();
  if (touched) emitSlot({ roomId: touched.roomId, startUtc: touched.startUtc });
  return result;
}
