import type { APIRoute } from "astro";
import { requestSeat } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

// Ask the booker for a seat. Separate from a direct join; the booker decides.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  const result = requestSeat(user.id, Number(form.get("booking")));
  const sep = next.includes("?") ? "&" : "?";
  return redirect(
    result.ok ? `${next}${sep}requested=1` : `${next}${sep}error=${encodeURIComponent(result.message)}`,
    303,
  );
};
