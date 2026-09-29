import { describe, expect, inject, it } from "vitest";
import { slotFor, validateCheckIn, validateRequest, type JoinTarget } from "../src/lib/booking";
import { CHECKIN_EARLY_MINUTES } from "../src/lib/rules";
import { getSpace } from "../src/lib/rooms";
import { addDays, canberraNow, dateLabel } from "../src/lib/time";

const NOW = new Date("2026-10-06T00:30:00Z");
const today = canberraNow(NOW).date;
const ROOM = "chifley-study-room-1-01"; // capacity 4
const target = (over: Partial<JoinTarget & { requestsOn: boolean }> = {}) => ({
  roomId: ROOM,
  ...slotFor(addDays(today, 1), 10),
  userId: "u1000001",
  shared: true,
  seatsUsed: 1,
  joiners: [] as string[],
  requestsOn: true,
  ...over,
});
const code = (v: { ok: boolean; error?: string }) => (v.ok ? "ok" : v.error);

describe("request rules", () => {
  it("are accepted on an open shared booking", () => {
    expect(code(validateRequest(target(), "u1000002", NOW, [], [], false))).toBe("ok");
  });
  it("are refused when the booker turned them off", () => {
    expect(code(validateRequest(target({ requestsOn: false }), "u1000002", NOW, [], [], false))).toBe("requests_off");
  });
  it("can't be repeated while one is pending", () => {
    expect(code(validateRequest(target(), "u1000002", NOW, [], [], true))).toBe("already_requested");
  });
  it("are refused on a full booking", () => {
    const full = target({ joiners: ["u1000002", "u1000003", "u1000004"] });
    expect(code(validateRequest(full, "u1000005", NOW, [], [], false))).toBe("full");
  });
  it("are refused when they overlap one of your bookings or joins", () => {
    const mine = [{ roomId: "chifley-study-room-1-03", ...slotFor(addDays(today, 1), 10) }];
    expect(code(validateRequest(target(), "u1000002", NOW, mine, [], false))).toBe("you_overlap");
    expect(code(validateRequest(target(), "u1000002", NOW, [], mine, false))).toBe("you_overlap");
  });
  it("are refused on your own booking", () => {
    expect(code(validateRequest(target(), "u1000001", NOW, [], [], false))).toBe("own_booking");
  });
});

describe("check-in rules", () => {
  const slot = { roomId: ROOM, ...slotFor(today, 12) };
  const start = new Date(slot.startUtc).getTime();
  const end = new Date(slot.endUtc).getTime();
  const at = (ms: number) => new Date(ms);
  const early = CHECKIN_EARLY_MINUTES * 60_000;

  it("is refused for someone who hasn't joined, or who already checked in", () => {
    expect(code(validateCheckIn(slot, false, false, at(start)))).toBe("not_joined");
    expect(code(validateCheckIn(slot, true, true, at(start)))).toBe("already_checked_in");
  });
  it("opens exactly CHECKIN_EARLY_MINUTES before the start", () => {
    expect(code(validateCheckIn(slot, true, false, at(start - early - 1)))).toBe("too_early");
    expect(code(validateCheckIn(slot, true, false, at(start - early)))).toBe("ok");
    expect(code(validateCheckIn(slot, true, false, at(start)))).toBe("ok");
  });
  it("closes at the end, half-open: exactly at the end is too late", () => {
    expect(code(validateCheckIn(slot, true, false, at(end - 1)))).toBe("ok");
    expect(code(validateCheckIn(slot, true, false, at(end)))).toBe("too_late");
    expect(code(validateCheckIn(slot, true, false, at(end + 60_000)))).toBe("too_late");
  });
});

// ---- The running app, over HTTP ---------------------------------------------

const baseUrl = inject("baseUrl");
const as = (id?: string) => ({ Origin: baseUrl, ...(id ? { Cookie: `demo_uid=${id}` } : {}) });
const post = (path: string, id: string | undefined, body: Record<string, string>) =>
  fetch(new URL(path, baseUrl), {
    method: "POST",
    redirect: "manual",
    headers: { ...as(id), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
const where = (r: Response) => decodeURIComponent(r.headers.get("location") ?? "");
const page = async (path: string, id?: string) => (await fetch(new URL(path, baseUrl), { headers: as(id) })).text();
const unread = async (id?: string) =>
  ((await (await fetch(new URL("/api/unread", baseUrl), { headers: as(id) })).json()) as { count: number }).count;

// Bookings here are made by u1000005, not u1000001, so sharing.test.ts (which reads
// u1000001's booking list) is never disturbed.
const BOOKER = { id: "u1000005", name: "Jordan Reyes" };
const nameOfRoom = (room: string) => getSpace(room)!.name;

/** The <li> blocks of a page, so one card can be found by its text. */
const cards = (html: string) => html.split("<li").slice(1);
const cardWith = (html: string, ...needles: string[]) => cards(html).find((c) => needles.every((n) => c.includes(n)));

async function book(user: string, room: string, date: string, hour: number, extra: Record<string, string> = {}) {
  const r = await post("/api/book/", user, {
    space: room, date, hour: String(hour), shared: "1", seats: "1", next: "/", ...extra,
  });
  expect(where(r)).toContain("booked=1");
  const html = await page("/bookings/", user);
  const id = /name="booking" value="(\d+)"/.exec(
    cardWith(html, nameOfRoom(room), dateLabel(date), `${String(hour).padStart(2, "0")}:00–`) ?? "",
  )?.[1];
  expect(id, "booking id on /bookings/").toBeTruthy();
  return id!;
}

async function requestId(booker: string, requesterName: string, room: string, date: string) {
  const html = await page("/inbox/", booker);
  const id = /name="request" value="(\d+)"/.exec(
    cardWith(html, `${requesterName} asks for a seat`, nameOfRoom(room), dateLabel(date)) ?? "",
  )?.[1];
  expect(id, "request id in the booker's inbox").toBeTruthy();
  return id!;
}

/** Joined = the My bookings card offers "Leave" (a pending request card doesn't). */
async function hasJoined(user: string, room: string, date: string) {
  return !!cardWith(await page("/bookings/", user), nameOfRoom(room), dateLabel(date), 'action="/api/leave/"');
}

const base = canberraNow().date;

describe("ask the booker over HTTP", () => {
  it("lets a booker accept a request, which joins the requester and tells them", async () => {
    const room = "chifley-study-room-1-04";
    const date = addDays(base, 8);
    const b = await book(BOOKER.id, room, date, 10);
    expect(where(await post("/api/request/", "u1000002", { booking: b, next: "/" }))).toContain("requested=1");

    const inbox = await page("/inbox/", BOOKER.id);
    expect(inbox).toContain("Priya Shah asks for a seat");
    // A third person never sees someone else's request.
    const other = await page("/inbox/", "u1000003");
    expect(other).not.toContain("Priya Shah");
    expect(other).not.toContain("asks for a seat</strong>");
    expect(other).not.toContain(`name="request"`);
    // Not a joiner yet.
    expect(await hasJoined("u1000002", room, date)).toBe(false);

    const rid = await requestId(BOOKER.id, "Priya Shah", room, date);
    const done = await post("/api/decide/", BOOKER.id, { request: rid, decision: "accept", next: "/inbox/" });
    expect(where(done)).toContain("decided=1");

    const joined = await page("/bookings/", "u1000002");
    expect(joined).toContain(nameOfRoom(room));
    expect(joined).toContain(dateLabel(date));
    expect(joined).toContain("Check-in opens"); // a future join: no button until the window opens
    expect(await page("/inbox/", "u1000002")).toContain("was accepted");
    // The request is no longer pending for the booker.
    expect(await page("/inbox/", BOOKER.id)).not.toContain(`name="request" value="${rid}"`);
  });

  it("lets a booker decline: the requester is told and does not join", async () => {
    const room = "chifley-study-room-1-04";
    const date = addDays(base, 9);
    const b = await book(BOOKER.id, room, date, 10);
    await post("/api/request/", "u1000003", { booking: b, next: "/" });
    const rid = await requestId(BOOKER.id, "Sam Taylor", room, date);
    expect(where(await post("/api/decide/", BOOKER.id, { request: rid, decision: "decline", next: "/inbox/" }))).toContain(
      "decided=1",
    );
    expect(await page("/inbox/", "u1000003")).toContain("was declined");
    expect(await hasJoined("u1000003", room, date)).toBe(false);
    // Already answered: deciding again changes nothing and is refused.
    expect(where(await post("/api/decide/", BOOKER.id, { request: rid, decision: "accept", next: "/inbox/" }))).toContain("error=");
    expect(await hasJoined("u1000003", room, date)).toBe(false);
  });

  it("refuses a decision from anyone but the booker, and changes nothing", async () => {
    const room = "chifley-study-room-1-05";
    const date = addDays(base, 10);
    const b = await book(BOOKER.id, room, date, 10);
    await post("/api/request/", "u1000002", { booking: b, next: "/" });
    const rid = await requestId(BOOKER.id, "Priya Shah", room, date);

    for (const who of ["u1000003", "u1000002"]) {
      const r = await post("/api/decide/", who, { request: rid, decision: "accept", next: "/inbox/" });
      expect(where(r)).toContain("error=");
    }
    expect(await hasJoined("u1000002", room, date)).toBe(false);
    expect(await page("/inbox/", BOOKER.id)).toContain(`name="request" value="${rid}"`); // still pending
  });

  it("refuses requests once the booker switches them off, and declines pending ones", async () => {
    const room = "chifley-study-room-1-05";
    const date = addDays(base, 11);
    const b = await book(BOOKER.id, room, date, 10);
    await post("/api/request/", "u1000002", { booking: b, next: "/" });
    const rid = await requestId(BOOKER.id, "Priya Shah", room, date);
    // A repeat ask while pending is refused.
    expect(where(await post("/api/request/", "u1000002", { booking: b, next: "/" }))).toContain("error=");

    const before = await unread("u1000002");
    const off = await post("/api/share/", BOOKER.id, {
      booking: b, shared: "1", seats: "1", requests: "off", next: "/bookings/",
    });
    expect(where(off)).toContain("saved=1");
    expect(await unread("u1000002")).toBe(before + 1);
    expect(await page("/inbox/", "u1000002")).toContain("was declined");
    expect(await page("/inbox/", BOOKER.id)).not.toContain(`name="request" value="${rid}"`);

    const late = await post("/api/request/", "u1000003", { booking: b, next: "/" });
    expect(where(late)).toContain("error=");
    expect(where(late)).toContain("taking requests");
    expect(await page("/inbox/", BOOKER.id)).not.toContain("Sam Taylor asks for a seat");
  });
});

describe("privacy and notifications over HTTP", () => {
  it("never leaks a private booker's name or id to a requester, the unread API or the stream", async () => {
    const room = "chifley-study-room-1-06";
    const date = addDays(base, 12);

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

    const b = await book(BOOKER.id, room, date, 10); // private by default
    await post("/api/request/", "u1000002", { booking: b, next: "/" });
    const rid = await requestId(BOOKER.id, "Priya Shah", room, date);
    await post("/api/decide/", BOOKER.id, { request: rid, decision: "accept", next: "/inbox/" });
    const unreadRes = await (await fetch(new URL("/api/unread", baseUrl), { headers: as("u1000002") })).text();

    const view = `/?space=${room}&library=chifley&kind=study_room&date=${date}&time=10:00`;
    for (const path of ["/inbox/", "/bookings/", view, `${view}&view=grid`]) {
      const html = await page(path, "u1000002");
      expect(html, path).not.toContain(BOOKER.name);
      expect(html, path).not.toContain(BOOKER.id);
    }
    expect(unreadRes).not.toContain("Jordan");
    expect(unreadRes).not.toContain(BOOKER.id);
    expect(JSON.parse(unreadRes)).toEqual({ count: expect.any(Number) });

    await new Promise((r) => setTimeout(r, 300));
    stream.abort();
    await reading;
    const sse = chunks.join("");
    expect(sse).toContain("event: inbox");
    expect(sse).not.toContain("Jordan");
    expect(sse).not.toContain("u100000");
    for (const line of sse.split("\n\n").filter((l) => l.startsWith("event: inbox"))) {
      expect(line).toBe("event: inbox\ndata: {}");
    }
  });

  it("tells joiners and pending requesters about a cancellation without naming the booker", async () => {
    const room = "chifley-study-room-1-02";
    const date = addDays(base, 13);
    const b = await book(BOOKER.id, room, date, 11);
    expect(where(await post("/api/join/", "u1000002", { booking: b, next: "/" }))).toContain("joined=1");
    await post("/api/request/", "u1000003", { booking: b, next: "/" });
    const before = [await unread("u1000002"), await unread("u1000003")];

    const gone = await post("/api/cancel/", BOOKER.id, { id: b, next: "/bookings/" });
    expect(where(gone)).toContain("cancelled=1");

    expect([await unread("u1000002"), await unread("u1000003")]).toEqual([before[0] + 1, before[1] + 1]);
    for (const who of ["u1000002", "u1000003"]) {
      const html = await page("/inbox/", who);
      const card = cardWith(html, "was cancelled by its booker", nameOfRoom(room), dateLabel(date));
      expect(card, `${who} told of cancellation`).toBeTruthy();
      expect(html).not.toContain(BOOKER.name);
      expect(html).not.toContain(BOOKER.id);
    }
    // Someone who was not involved hears nothing.
    expect(await page("/inbox/", "u1000004")).not.toContain(dateLabel(date));
  });

  it("counts unread per person, clears on read, and gives anonymous visitors nothing", async () => {
    const room = "chifley-study-room-1-03";
    const date = addDays(base, 8);
    const b = await book("u1000005", room, date, 15);
    const before = await unread("u1000005");
    expect(where(await post("/api/join/", "u1000004", { booking: b, next: "/" }))).toContain("joined=1");
    expect(await unread("u1000005")).toBe(before + 1);

    const read = await post("/api/read/", "u1000005", { next: "/inbox/" });
    expect(read.status).toBe(303);
    expect(await unread("u1000005")).toBe(0);

    expect(await unread(undefined)).toBe(0);
    for (const path of ["/api/decide/", "/api/request/", "/api/checkin/", "/api/read/"]) {
      const r = await post(path, undefined, { booking: b, request: "1", decision: "accept", next: "/" });
      expect(where(r), path).toContain("/login/");
    }
    expect(await unread("u1000005")).toBe(0);
    expect(await page("/inbox/", "u1000004")).not.toContain("checked in to your booking");
  });
});

describe("check-in over HTTP", () => {
  it("refuses a non-joiner and a check-in more than the window before the start", async () => {
    const room = "chifley-study-room-1-03";
    const date = addDays(base, 8);
    const id = /name="booking" value="(\d+)"/.exec(
      cardWith(await page("/bookings/", "u1000005"), nameOfRoom(room), dateLabel(date), "15:00–16:00") ?? "",
    )?.[1];
    expect(id, "booking from the unread test").toBeTruthy();

    const early = await post("/api/checkin/", "u1000004", { booking: id!, next: "/bookings/" });
    expect(where(early)).toContain("error=");
    expect(where(early)).toContain("15 minutes before");
    const stranger = await post("/api/checkin/", "u1000003", { booking: id!, next: "/bookings/" });
    expect(where(stranger)).toContain("haven’t joined");

    expect(await page("/bookings/", "u1000004")).not.toContain("Checked in");
    expect(await page("/inbox/", "u1000005")).not.toContain("checked in to your booking");
  });

  it("counts a joiner as checked in once the booking is inside the window", async (ctx) => {
    const now = canberraNow();
    const room = "chifley-study-room-1-02";
    const view = `/?space=${room}&library=chifley&kind=study_room&date=${now.date}&time=${String(now.hour).padStart(2, "0")}:00`;

    const r = await post("/api/book/", "u1000005", {
      space: room, date: now.date, hour: String(now.hour), shared: "1", seats: "2", next: "/",
    });
    if (!where(r).includes("booked=1")) {
      // e.g. a previous run's booking is in this database: only skip for that reason.
      ctx.skip(`could not book the current hour (${now.date} ${now.hour}:00): ${where(r)}`);
      return;
    }
    const id = /name="booking" value="(\d+)"/.exec(
      cardWith(
        await page("/bookings/", "u1000005"),
        nameOfRoom(room), dateLabel(now.date), `${String(now.hour).padStart(2, "0")}:00`,
      ) ?? "",
    )?.[1];
    expect(id).toBeTruthy();
    expect(where(await post("/api/join/", "u1000002", { booking: id!, next: "/" }))).toContain("joined=1");

    if (canberraNow().hour !== now.hour) return ctx.skip("the hour rolled over mid-test");
    const done = await post("/api/checkin/", "u1000002", { booking: id!, next: "/bookings/" });
    if (canberraNow().hour !== now.hour && where(done).includes("error=")) return ctx.skip("the hour rolled over mid-test");
    expect(where(done)).toContain("checkedin=1");

    expect(await page(view, "u1000002")).toContain("1 checked in");
    // Twice is refused; the booker was told once, by name of the joiner.
    expect(where(await post("/api/checkin/", "u1000002", { booking: id!, next: "/bookings/" }))).toContain("already checked in");
    expect(await page("/inbox/", "u1000005")).toContain("Priya Shah checked in to your booking");
  });
});

describe("a booker stops sharing", () => {
  const room = "chifley-study-room-1-06";
  const date = addDays(base, 13);
  const stop = (b: string) =>
    post("/api/share/", BOOKER.id, { booking: b, seats: "1", next: "/bookings/" }); // no `shared` field: sharing off

  it("is refused once someone has joined, and nothing changes", async () => {
    const b = await book(BOOKER.id, room, date, 15);
    expect(where(await post("/api/join/", "u1000002", { booking: b, next: "/" }))).toContain("joined=1");
    expect(where(await stop(b))).toContain("Others have joined");
    // Still shared and still joined.
    expect(await page("/bookings/", "u1000002")).toContain(dateLabel(date));
    expect(cardWith(await page("/bookings/", BOOKER.id), nameOfRoom(room), dateLabel(date), "15:00–16:00")).toContain("Shared");
  });

  it("with no joiners turns sharing off and tells pending requesters why", async () => {
    const b = await book(BOOKER.id, room, date, 16);
    expect(where(await post("/api/request/", "u1000003", { booking: b, next: "/" }))).toContain("requested=1");
    // The requester sees it waiting on My bookings.
    expect(await page("/bookings/", "u1000003")).toContain("Waiting for an answer");
    expect(where(await stop(b))).toContain("saved=1");
    expect(cardWith(await page("/bookings/", BOOKER.id), nameOfRoom(room), dateLabel(date), "16:00–17:00")).toContain("Not shared");
    const inbox = await page("/inbox/", "u1000003");
    expect(inbox).toContain("stopped sharing that booking");
    expect(inbox).not.toContain(BOOKER.name);
    expect(await page("/bookings/", "u1000003")).not.toContain("Waiting for an answer");
    // No longer joinable.
    expect(where(await post("/api/join/", "u1000004", { booking: b, next: "/" }))).toContain("error=");
  });
});
