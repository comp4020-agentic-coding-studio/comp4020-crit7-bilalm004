import type { APIRoute } from "astro";
import { markAllRead } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/inbox/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  markAllRead(user.id);
  return redirect(next, 303);
};
