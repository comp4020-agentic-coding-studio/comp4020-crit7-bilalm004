import type { APIRoute } from "astro";
import { decideRequest } from "../../lib/db";
import { getUser, safeNext } from "../../lib/users";

// The booker accepts or declines a request on their own booking (owner check is in decideRequest).
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const next = safeNext(String(form.get("next") ?? "/inbox/"));
  const user = getUser(cookies);
  if (!user) return redirect(`/login/?next=${encodeURIComponent(next)}`, 303);
  const result = decideRequest(user.id, Number(form.get("request")), form.get("decision") === "accept");
  const sep = next.includes("?") ? "&" : "?";
  return redirect(
    result.ok ? `${next}${sep}decided=1&answer=${form.get("decision") === "accept" ? "accepted" : "declined"}` : `${next}${sep}error=${encodeURIComponent(result.message)}`,
    303,
  );
};
