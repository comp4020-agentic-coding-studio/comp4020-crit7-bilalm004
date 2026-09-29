import type { APIRoute } from "astro";
import { createBooking } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

// Book one hour. A plain form POST (works with no JavaScript); all the rules
// are checked in createBooking, never only in the UI.
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);

  // Sharing is opt-in and private by default: the name is shown only if ticked.
  const share = form.get("shared")
    ? { seatsUsed: Number(form.get("seats")), namePublic: form.get("name_public") === "1" }
    : undefined;
  const result = createBooking(
    user.id,
    String(form.get("space") ?? ""),
    String(form.get("date") ?? ""),
    Number(form.get("hour")),
    share,
  );
  const sep = next.includes("?") ? "&" : "?";
  if (!result.ok) return redirect(`${next}${sep}error=${encodeURIComponent(result.message)}`, 303);
  return redirect(`${next}${sep}booked=1`, 303);
};
