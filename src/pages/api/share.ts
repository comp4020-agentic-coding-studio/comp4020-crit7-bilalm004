import type { APIRoute } from "astro";
import { updateSharing } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

// The booker changes sharing on their own booking (owner check is in updateSharing).
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/bookings/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  const result = updateSharing(user.id, Number(form.get("booking")), {
    shared: form.get("shared") === "1",
    seatsUsed: Number(form.get("seats")),
    namePublic: form.get("name_public") === "1",
    requestsOn: form.get("requests") !== "off",
  });
  const sep = next.includes("?") ? "&" : "?";
  return redirect(
    result.ok ? `${next}${sep}saved=1` : `${next}${sep}error=${encodeURIComponent(result.message)}`,
    303,
  );
};
