import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { validateBooking, slotFor, type BookingError } from "./booking";
import { emitSlot } from "./events";
import { getSpace } from "./rooms";
import { addDays, canberraToUtc } from "./time";
import { bookings, type Booking } from "./schema";

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

/** Bookings starting in [fromDate, toDate] (Canberra days, inclusive). */
export function bookingsBetween(fromDate: string, toDate: string): Booking[] {
  const from = canberraToUtc(fromDate, 0).toISOString();
  const to = canberraToUtc(addDays(toDate, 1), 0).toISOString();
  return db
    .select()
    .from(bookings)
    .where(and(gte(bookings.startUtc, from), lt(bookings.startUtc, to)))
    .all();
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
  now = new Date(),
): BookResult {
  if (!getSpace(roomId)) return { ok: false, error: "unknown_space", message: "That space doesn’t exist." };
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, error: "bad_time", message: "That time isn’t valid." };
  const { startUtc, endUtc } = slotFor(date, hour);
  const result = client.transaction((): BookResult => {
    const mine = db.select().from(bookings).where(eq(bookings.userId, userId)).all();
    const here = db.select().from(bookings).where(eq(bookings.roomId, roomId)).all();
    const verdict = validateBooking({ roomId, startUtc, endUtc }, now, here, mine);
    if (!verdict.ok) return verdict;
    const booking = db.insert(bookings).values({ roomId, userId, startUtc, endUtc }).returning().get();
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
