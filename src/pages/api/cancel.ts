import type { APIRoute } from "astro";
import { cancelBooking } from "../../lib/db";
import { emitSlot } from "../../lib/events";
import { getUser, safeNext } from "../../lib/users";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/bookings/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);

  // Only the owner's own booking is deleted: the WHERE clause carries the user id.
  const gone = cancelBooking(user.id, Number(form.get("id")));
  if (gone) emitSlot({ roomId: gone.roomId, startUtc: gone.startUtc });
  const sep = next.includes("?") ? "&" : "?";
  return redirect(`${next}${sep}${gone ? "cancelled=1" : "error=" + encodeURIComponent("That booking wasn’t found.")}`, 303);
};
