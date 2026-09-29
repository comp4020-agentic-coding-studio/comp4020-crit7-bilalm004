import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  slotFor,
  validateBooking,
  validateCheckIn,
  validateJoin,
  validateRequest,
  validateShare,
  type BookingError,
} from "./booking";
import { emitInbox, emitSlot } from "./events";
import { getSpace } from "./rooms";
import { addDays, canberraNow, canberraToUtc, dateLabel, slotLabel } from "./time";
import { DEMO_USERS } from "./users";
import { bookings, joins, notifications, requests, type Booking, type Notification } from "./schema";

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
export type BookingRow = { booking: Booking; joinerIds: string[]; checkedInIds: string[] };

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
  const arrived = joinersOf(rows.map((r) => r.id), true);
  return rows.map((booking) => ({
    booking,
    joinerIds: joiners.get(booking.id) ?? [],
    checkedInIds: arrived.get(booking.id) ?? [],
  }));
}

/** Who joined each booking; with `onlyCheckedIn`, only those who have marked arrival. */
export function joinersOf(bookingIds: number[], onlyCheckedIn = false): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (bookingIds.length === 0) return out;
  for (const j of db.select().from(joins).where(inArray(joins.bookingId, bookingIds)).all()) {
    if (onlyCheckedIn && !j.checkedInAt) continue;
    out.set(j.bookingId, [...(out.get(j.bookingId) ?? []), j.userId]);
  }
  return out;
}

/** Ids of bookings the person has joined and checked in to. */
export function checkedInJoins(userId: string): Set<number> {
  return new Set(
    db
      .select({ id: joins.bookingId, at: joins.checkedInAt })
      .from(joins)
      .where(eq(joins.userId, userId))
      .all()
      .filter((j) => j.at)
      .map((j) => j.id),
  );
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
  return client.transaction(() => {
    // Who to tell must be read before the rows cascade away.
    const affected = [
      ...db.select({ u: joins.userId }).from(joins).where(eq(joins.bookingId, id)).all(),
      ...db
        .select({ u: requests.userId })
        .from(requests)
        .where(and(eq(requests.bookingId, id), eq(requests.status, "pending")))
        .all(),
    ].map((r) => r.u);
    const gone = db
      .delete(bookings)
      .where(and(eq(bookings.id, id), eq(bookings.userId, userId))) // ownership is checked here, not in the UI
      .returning()
      .get();
    // No booker name in the message: it may be private.
    if (gone) for (const u of new Set(affected)) notify(u, `The booking for ${slotText(gone)} was cancelled by its booker.`, "/bookings/");
    return gone;
  })();
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
    db.delete(requests).where(and(eq(requests.bookingId, bookingId), eq(requests.userId, userId))).run();
    notify(target.userId, `${nameOf(userId)} joined your booking for ${slotText(target)}.`, "/bookings/");
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
  notify(target.userId, `${nameOf(userId)} left your booking for ${slotText(target)}.`, "/bookings/");
  emitSlot({ roomId: target.roomId, startUtc: target.startUtc });
  return { ok: true };
}

/** The booker turns sharing on or off, or changes seats and privacy. */
export function updateSharing(
  userId: string,
  bookingId: number,
  next: { shared: boolean; seatsUsed: number; namePublic: boolean; requestsOn?: boolean },
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
        requestsOn: next.shared ? (next.requestsOn ?? b.requestsOn) : true,
      })
      .where(eq(bookings.id, bookingId))
      .run();
    // Requests can't stay open on a booking that no longer takes them.
    if (!next.shared || next.requestsOn === false) {
      const open = db
        .select()
        .from(requests)
        .where(and(eq(requests.bookingId, bookingId), eq(requests.status, "pending")))
        .all();
      for (const r of open) {
        db.update(requests).set({ status: "declined" }).where(eq(requests.id, r.id)).run();
        notify(r.userId, `Your request for ${slotText(b)} was declined.`, "/inbox/");
      }
    }
    touched = b;
    return { ok: true };
  })();
  if (touched) emitSlot({ roomId: touched.roomId, startUtc: touched.startUtc });
  return result;
}

// ---- Names in messages -------------------------------------------------------

const nameOf = (userId: string) => DEMO_USERS.find((u) => u.id === userId)?.name ?? "A student";

/** "Study room 1, Tue 7 Oct, 10 am". Never names the booker: that may be private. */
function slotText(b: Pick<Booking, "roomId" | "startUtc">): string {
  const at = canberraNow(new Date(b.startUtc));
  return `${getSpace(b.roomId)?.name ?? "a space"}, ${dateLabel(at.date)}, ${slotLabel(at.hour)}`;
}

// ---- Check-in ----------------------------------------------------------------

/** A joiner marks arrival. Occupancy then shows checked-in against joined. */
export function checkIn(userId: string, bookingId: number, now = new Date()): ChangeResult {
  let touched: Booking | undefined;
  const result = client.transaction((): ChangeResult => {
    const target = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
    if (!target) return notFound;
    const mine = db
      .select()
      .from(joins)
      .where(and(eq(joins.bookingId, bookingId), eq(joins.userId, userId)))
      .get();
    const verdict = validateCheckIn(target, !!mine, !!mine?.checkedInAt, now);
    if (!verdict.ok) return verdict;
    db.update(joins).set({ checkedInAt: now.toISOString() }).where(eq(joins.id, mine!.id)).run();
    notify(target.userId, `${nameOf(userId)} checked in to your booking for ${slotText(target)}.`, "/bookings/");
    touched = target;
    return { ok: true };
  })();
  if (touched) emitSlot({ roomId: touched.roomId, startUtc: touched.startUtc });
  return result;
}

// ---- Ask the booker ----------------------------------------------------------

/** Send a request for a seat. The requester never sees who a private booker is. */
export function requestSeat(userId: string, bookingId: number, now = new Date()): ChangeResult {
  return client.transaction((): ChangeResult => {
    const target = db.select().from(bookings).where(eq(bookings.id, bookingId)).get();
    if (!target) return notFound;
    const joiners = joinersOf([target.id]).get(target.id) ?? [];
    const mine = db.select().from(bookings).where(eq(bookings.userId, userId)).all();
    const asked = db
      .select()
      .from(requests)
      .where(and(eq(requests.bookingId, bookingId), eq(requests.userId, userId)))
      .get();
    const verdict = validateRequest(
      { ...target, joiners },
      userId,
      now,
      mine,
      joinedSlots(userId),
      asked?.status === "pending",
    );
    if (!verdict.ok) return verdict;
    // A declined request can be sent again; a fresh row keeps the unique index simple.
    if (asked) db.delete(requests).where(eq(requests.id, asked.id)).run();
    db.insert(requests).values({ bookingId, userId }).run();
    notify(target.userId, `${nameOf(userId)} asked for a seat on your booking for ${slotText(target)}.`, "/inbox/");
    return { ok: true };
  })();
}

/** The booker accepts (which joins the requester) or declines. Owner only. */
export function decideRequest(
  userId: string,
  requestId: number,
  accept: boolean,
  now = new Date(),
): ChangeResult {
  let touched: Booking | undefined;
  const result = client.transaction((): ChangeResult => {
    const req = db.select().from(requests).where(eq(requests.id, requestId)).get();
    const target = req && db.select().from(bookings).where(eq(bookings.id, req.bookingId)).get();
    if (!req || !target || target.userId !== userId || req.status !== "pending")
      return { ok: false, error: "not_shared", message: "That request wasn’t found." };
    if (accept) {
      const joiners = joinersOf([target.id]).get(target.id) ?? [];
      const mine = db.select().from(bookings).where(eq(bookings.userId, req.userId)).all();
      const verdict = validateJoin({ ...target, joiners }, req.userId, now, mine, joinedSlots(req.userId));
      if (!verdict.ok) return verdict;
      db.insert(joins).values({ bookingId: target.id, userId: req.userId }).run();
      touched = target;
    }
    db.update(requests)
      .set({ status: accept ? "accepted" : "declined" })
      .where(eq(requests.id, req.id))
      .run();
    notify(
      req.userId,
      accept
        ? `Your request for ${slotText(target)} was accepted. You’re on the booking. Seats aren’t guaranteed.`
        : `Your request for ${slotText(target)} was declined.`,
      accept ? "/bookings/" : "/inbox/",
    );
    return { ok: true };
  })();
  if (touched) emitSlot({ roomId: touched.roomId, startUtc: touched.startUtc });
  return result;
}

/** Pending requests on the person's own upcoming bookings. Names the requester (never the booker). */
export function requestsForBooker(userId: string) {
  return db
    .select({ id: requests.id, requester: requests.userId, b: bookings })
    .from(requests)
    .innerJoin(bookings, eq(requests.bookingId, bookings.id))
    .where(and(eq(bookings.userId, userId), eq(requests.status, "pending")))
    .orderBy(asc(bookings.startUtc))
    .all()
    .map((r) => ({ id: r.id, requesterName: nameOf(r.requester), booking: r.b }));
}

/** Booking ids the person has a pending request on, so the panel shows "Requested". */
export function pendingRequestIds(userId: string): Set<number> {
  return new Set(
    db
      .select({ id: requests.bookingId })
      .from(requests)
      .where(and(eq(requests.userId, userId), eq(requests.status, "pending")))
      .all()
      .map((r) => r.id),
  );
}

// ---- Inbox -------------------------------------------------------------------

function notify(userId: string, body: string, href = "/inbox/") {
  db.insert(notifications).values({ userId, body, href }).run();
  emitInbox();
}

export function inboxOf(userId: string, limit = 50): Notification[] {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.id))
    .limit(limit)
    .all();
}

export function unreadCount(userId: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
      .get()?.n ?? 0
  );
}

export function markAllRead(userId: string) {
  db.update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .run();
  emitInbox();
}
