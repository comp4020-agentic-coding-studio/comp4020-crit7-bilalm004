import { sql } from "drizzle-orm";
import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.

// Seeded by a migration from docs/FACTSHEET.md (via src/lib/rooms.ts).
export const rooms = sqliteTable("rooms", {
  id: text().primaryKey(),
  library: text().notNull(),
  kind: text().notNull(),
  name: text().notNull(),
  capacity: int().notNull(),
});

// A booking is one hour, half-open [start_utc, end_utc), stored as UTC ISO
// strings. The unique index is a backstop: clash detection lives in
// src/lib/booking.ts and runs in the same transaction as the insert.
export const bookings = sqliteTable(
  "bookings",
  {
    id: int().primaryKey({ autoIncrement: true }),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id),
    userId: text("user_id").notNull(),
    startUtc: text("start_utc").notNull(),
    endUtc: text("end_utc").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("bookings_room_start").on(t.roomId, t.startUtc),
    index("bookings_user_start").on(t.userId, t.startUtc),
  ],
);

export type Booking = typeof bookings.$inferSelect;
