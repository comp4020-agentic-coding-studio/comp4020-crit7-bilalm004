import { describe, expect, it } from "vitest";
import { slotFor, validateBooking, type Slot } from "../src/lib/booking";
import { addDays, canberraNow } from "../src/lib/time";

// Contracts from docs/PLAN.md, as pure rule tests (no database).
const NOW = new Date("2026-10-06T00:30:00Z"); // 11:30 Canberra (AEDT)
const today = canberraNow(NOW).date;
const slot = (roomId: string, date: string, hour: number): Slot => ({ roomId, ...slotFor(date, hour) });
const ROOM = "chifley-study-room-1-01";
const ok = (r: Slot, mine: Slot[] = [], here: Slot[] = []) => validateBooking(r, NOW, here, mine);
const err = (r: Slot, mine: Slot[] = [], here: Slot[] = []) => {
  const v = ok(r, mine, here);
  return v.ok ? "ok" : v.error;
};

describe("booking rules", () => {
  it("refuses an overlapping booking of the same space", () => {
    expect(err(slot(ROOM, today, 14), [], [slot(ROOM, today, 14)])).toBe("clash");
  });
  it("accepts back-to-back bookings", () => {
    expect(err(slot(ROOM, today, 15), [], [slot(ROOM, today, 14)])).toBe("ok");
  });
  it("requires exactly one hour on the hour", () => {
    const s = slot(ROOM, today, 14);
    expect(err({ ...s, endUtc: new Date(Date.parse(s.startUtc) + 7_200_000).toISOString() })).toBe("not_one_hour");
    expect(err({ ...s, startUtc: new Date(Date.parse(s.startUtc) + 1_800_000).toISOString() })).toBe("bad_time");
  });
  it("shares one pool of 2 across rooms, the Deck and booths", () => {
    const mine = [slot(ROOM, today, 13), slot("chifley-the-deck", today, 14)];
    expect(err(slot("chifley-study-booth-3-10", today, 16), mine)).toBe("daily_limit");
  });
  it("allows 3 computer desks a day, not 4", () => {
    const desk = (n: number, h: number) => slot(`chifley-computer-desk-2-${n}`, today, h);
    expect(err(desk(24, 16), [desk(22, 13), desk(23, 14)])).toBe("ok");
    expect(err(desk(25, 17), [desk(22, 13), desk(23, 14), desk(24, 16)])).toBe("daily_limit");
  });
  it("resets the daily limit at the Canberra day boundary, not UTC", () => {
    // 23:00 Canberra today is 12:00 UTC today; 01:00 tomorrow Canberra is still today in UTC.
    const mine = [slot(ROOM, today, 22), slot(ROOM, today, 23)];
    expect(err(slot("chifley-study-room-1-03", addDays(today, 1), 1), mine)).toBe("ok");
  });
  it("refuses the past and more than 14 days ahead", () => {
    expect(err(slot(ROOM, today, 9))).toBe("past");
    expect(err(slot(ROOM, addDays(today, 14), 9))).toBe("ok");
    expect(err(slot(ROOM, addDays(today, 15), 9))).toBe("too_far_ahead");
  });
  it("refuses a person double-booking themselves", () => {
    expect(err(slot("chifley-study-room-1-03", today, 14), [slot(ROOM, today, 14)])).toBe("you_overlap");
  });
});
