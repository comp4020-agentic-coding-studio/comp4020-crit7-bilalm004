import type { AstroCookies } from "astro";

// A fake, demo-only login: five fixed accounts and the password is the same as
// the username. The cookie holds just the user id and is not signed, which is
// fine for a demo and would not be for anything real. The login page says so.
export type DemoUser = { id: string; name: string };

export const DEMO_USERS: readonly DemoUser[] = [
  { id: "u1000001", name: "Alex Chen" },
  { id: "u1000002", name: "Priya Shah" },
  { id: "u1000003", name: "Sam Taylor" },
  { id: "u1000004", name: "Mei Tanaka" },
  { id: "u1000005", name: "Jordan Reyes" },
];

export const COOKIE = "demo_uid";

export function checkLogin(id: string, password: string): DemoUser | null {
  return DEMO_USERS.find((u) => u.id === id && password === u.id) ?? null;
}

export function getUser(cookies: AstroCookies): DemoUser | null {
  const id = cookies.get(COOKIE)?.value;
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}

/** Only ever redirect to a path on this site. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
