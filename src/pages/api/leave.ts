import type { APIRoute } from "astro";
import { leaveBooking } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/bookings/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  const result = leaveBooking(user.id, Number(form.get("booking")));
  const sep = next.includes("?") ? "&" : "?";
  return redirect(
    result.ok ? `${next}${sep}left=1` : `${next}${sep}error=${encodeURIComponent(result.message)}`,
    303,
  );
};
