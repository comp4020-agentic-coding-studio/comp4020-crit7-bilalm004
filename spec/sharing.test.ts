import { describe, expect, inject, it } from "vitest";
import { slotFor, spareSeats, validateJoin, validateShare, type JoinTarget } from "../src/lib/booking";
import { addDays, canberraNow } from "../src/lib/time";

const NOW = new Date("2026-10-06T00:30:00Z");
const today = canberraNow(NOW).date;
const ROOM = "chifley-study-room-1-01"; // capacity 4
const target = (over: Partial<JoinTarget> = {}): JoinTarget => ({
  roomId: ROOM,
  ...slotFor(addDays(today, 1), 10),
  userId: "u1000001",
  shared: true,
  seatsUsed: 1,
  joiners: [],
  ...over,
});
const code = (v: ReturnType<typeof validateJoin>) => (v.ok ? "ok" : v.error);

describe("sharing rules", () => {
  it("spare seats are capacity minus booker minus joiners, never negative", () => {
    expect(spareSeats(4, 1, 2)).toBe(1);
    expect(spareSeats(4, 3, 2)).toBe(0);
  });
  it("a capacity-1 space can't be shared", () => {
    expect(validateShare("chifley-computer-desk-2-22", 1, 0)).toMatchObject({ ok: false, error: "not_shareable" });
    expect(validateShare(ROOM, 1, 0)).toBeNull();
    expect(validateShare(ROOM, 4, 0)).toMatchObject({ ok: false, error: "bad_seats" });
  });
  it("joiners can never push a booking over capacity", () => {
    const full = target({ joiners: ["u1000002", "u1000003", "u1000004"] });
    expect(code(validateJoin(full, "u1000005", NOW, [], []))).toBe("full");
  });
  it("can't join your own, an unshared, or the same booking twice", () => {
    expect(code(validateJoin(target(), "u1000001", NOW, [], []))).toBe("own_booking");
    expect(code(validateJoin(target({ shared: false }), "u1000002", NOW, [], []))).toBe("not_shared");
    expect(code(validateJoin(target({ joiners: ["u1000002"] }), "u1000002", NOW, [], []))).toBe("already_joined");
  });
  it("can't join a booking that overlaps one of your own or another join", () => {
    const mine = [{ roomId: "chifley-study-room-1-03", ...slotFor(addDays(today, 1), 10) }];
    expect(code(validateJoin(target(), "u1000002", NOW, mine, []))).toBe("you_overlap");
    expect(code(validateJoin(target(), "u1000002", NOW, [], mine))).toBe("you_overlap");
    expect(code(validateJoin(target(), "u1000002", NOW, [], []))).toBe("ok");
  });
});

// The running app, over HTTP, as different people.
const baseUrl = inject("baseUrl");
const as = (id?: string) => ({
  Origin: baseUrl,
  ...(id ? { Cookie: `demo_uid=${id}` } : {}),
});
const post = (path: string, id: string | undefined, body: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { ...as(id), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
const where = (r: Response) => decodeURIComponent(r.headers.get("location") ?? "");
const page = async (path: string, id?: string) => (await fetch(new URL(path, baseUrl), { headers: as(id) })).text();

describe("sharing over HTTP", () => {
  const date = addDays(canberraNow().date, 4);
  const view = `/?space=${ROOM}&library=chifley&kind=study_room&date=${date}&time=10:00`;

  it("keeps a private booker's name out of every page and the event stream", async () => {
    const stream = new AbortController();
    const chunks: string[] = [];
    const res = await fetch(new URL("/api/events", baseUrl), { signal: stream.signal });
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const reading = (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } catch {
        // aborted
      }
    })();

    const booked = await post("/api/book/", "u1000001", {
      space: ROOM, date, hour: "10", shared: "1", seats: "1", next: "/",
    });
    expect(where(booked)).toContain("booked=1");

    for (const path of [view, `${view}&view=grid`, "/?open=1", "/bookings/"]) {
      const html = await page(path, "u1000002");
      expect(html).not.toContain("Alex Chen");
      expect(html).not.toContain("u1000001");
    }
    expect(await page(view, "u1000002")).toContain("A student");
    expect(await page(view, "u1000002")).toContain("aren’t guaranteed");

    await new Promise((r) => setTimeout(r, 300));
    stream.abort();
    await reading;
    const sse = chunks.join("");
    expect(sse).toContain("event: slot");
    expect(sse).not.toContain("Alex");
    expect(sse).not.toContain("u1000001");
  });

  it("shows the name only when the booker chose to", async () => {
    const d = addDays(date, 1);
    await post("/api/book/", "u1000001", {
      space: ROOM, date: d, hour: "10", shared: "1", seats: "1", name_public: "1", next: "/",
    });
    const html = await page(`/?space=${ROOM}&library=chifley&kind=study_room&date=${d}&time=10:00`, "u1000002");
    expect(html).toContain("Alex Chen");
  });

  it("joins directly, stops at capacity, and never uses the daily limit", async () => {
    const list = await page("/bookings/", "u1000001");
    const id = /name="booking" value="(\d+)"/.exec(list)?.[1];
    expect(id).toBeTruthy();

    for (const u of ["u1000002", "u1000003", "u1000004"]) {
      expect(where(await post("/api/join/", u, { booking: id!, next: "/" }))).toContain("joined=1");
    }
    expect(where(await post("/api/join/", "u1000005", { booking: id!, next: "/" }))).toContain("error=No seats");

    // Joined, yet u1000002 still has both room bookings for that day.
    const other = addDays(date, 2);
    for (const hour of ["9", "13"]) {
      const r = await post("/api/book/", "u1000002", { space: "chifley-study-room-1-03", date: other, hour, next: "/" });
      expect(where(r)).toContain("booked=1");
    }
    // And they can't join a booking overlapping one they already hold.
    await post("/api/book/", "u1000001", { space: ROOM, date: other, hour: "9", shared: "1", seats: "1", next: "/" });
    const ids = [...(await page("/bookings/", "u1000001")).matchAll(/name="booking" value="(\d+)"/g)];
    const overlapId = ids[ids.length - 1][1]; // upcoming is ordered by start: the latest one
    expect(where(await post("/api/join/", "u1000002", { booking: overlapId, next: "/" }))).toContain(
      "error=You already have",
    );
  });

  it("refuses to share a single-seat space, and anonymous joins", async () => {
    const r = await post("/api/book/", "u1000001", {
      space: "chifley-computer-desk-2-22", date, hour: "15", shared: "1", seats: "1", next: "/",
    });
    expect(where(r)).toContain("error=");
    const anon = await post("/api/join/", undefined, { booking: "1", next: "/" });
    expect(where(anon)).toContain("/login/");
  });

  it("lets only the owner change sharing", async () => {
    const id = /name="booking" value="(\d+)"/.exec(await page("/bookings/", "u1000001"))?.[1];
    const r = await post("/api/share/", "u1000003", { booking: id!, shared: "1", seats: "1", next: "/bookings/" });
    expect(where(r)).toContain("error=");
  });
});
