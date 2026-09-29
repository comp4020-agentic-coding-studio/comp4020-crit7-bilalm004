import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

// A real (temp) SQLite file with the real migrations: a booking survives a
// fresh module load, and only its owner can cancel it.
it("persists bookings and enforces ownership", async () => {
  process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "crit7-")), "t.db");
  const { createBooking, cancelBooking, bookingsOf } = await import("../src/lib/db");
  const { canberraNow, addDays } = await import("../src/lib/time");
  const date = addDays(canberraNow().date, 2);

  const made = createBooking("u1000001", "chifley-study-room-1-01", date, 10);
  expect(made.ok).toBe(true);
  expect(createBooking("u1000002", "chifley-study-room-1-01", date, 10)).toMatchObject({ ok: false, error: "clash" });
  expect(createBooking("u1000001", "chifley-study-room-1-03", date, 10)).toMatchObject({ ok: false, error: "you_overlap" });

  const { vi } = await import("vitest");
  vi.resetModules();
  const fresh = await import("../src/lib/db");
  expect(fresh.bookingsOf("u1000001")).toHaveLength(1);
  expect(bookingsOf("u1000002")).toHaveLength(0);
  const id = fresh.bookingsOf("u1000001")[0].id;
  expect(cancelBooking("u1000002", id)).toBeUndefined();
  expect(cancelBooking("u1000001", id)).toBeDefined();
});
