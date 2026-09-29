import type { APIRoute } from "astro";
import { checkLogin, COOKIE, safeNext } from "../../lib/users";

// Demo sign-in: a plain form POST, so it works with no JavaScript.
export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  const form = await request.formData();
  const id = String(form.get("id") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));

  const user = checkLogin(id, password);
  if (!user) {
    return redirect(`/login/?error=1&next=${encodeURIComponent(next)}`, 303);
  }
  cookies.set(COOKIE, user.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7,
  });
  return redirect(next, 303);
};
