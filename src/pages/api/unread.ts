import type { APIRoute } from "astro";
import { unreadCount } from "../../lib/db";
import { getUser } from "../../lib/users";

// The signed-in person's own unread count. The event stream only pings that
// "an inbox changed"; this is where a client asks for its own number.
export const GET: APIRoute = ({ cookies }) => {
  const user = getUser(cookies);
  return new Response(JSON.stringify({ count: user ? unreadCount(user.id) : 0 }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
