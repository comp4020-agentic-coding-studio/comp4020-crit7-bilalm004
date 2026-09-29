import type { APIRoute } from "astro";
import { joinBooking } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

// Join a shared booking: direct, no approval. Checked in joinBooking.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  const result = joinBooking(user.id, Number(form.get("booking")));
  const sep = next.includes("?") ? "&" : "?";
  return redirect(
    result.ok ? `${next}${sep}joined=1` : `${next}${sep}error=${encodeURIComponent(result.message)}`,
    303,
  );
};
