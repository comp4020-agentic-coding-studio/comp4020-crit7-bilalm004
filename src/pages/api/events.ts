import type { APIRoute } from "astro";
import { bus, type SlotEvent } from "../../lib/events";

// The minimal server-sent-events (SSE) pattern: a long-lived streaming
// response the browser consumes with `new EventSource("/api/events")`.
// SSE is one-directional (server → browser) and plain HTTP, which makes it
// the simplest live channel that works everywhere — reach for WebSockets
// only when the client needs to push over the same connection.
export const GET: APIRoute = () => {
  let onSlot: (e: SlotEvent) => void;
  let onInbox: () => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onSlot = (e) => {
        controller.enqueue(`event: slot\ndata: ${JSON.stringify(e)}\n\n`);
      };
      bus.on("slot", onSlot);
      // A bare ping, never a user id: clients ask /api/unread for their own count.
      onInbox = () => controller.enqueue("event: inbox\ndata: {}\n\n");
      bus.on("inbox", onInbox);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("slot", onSlot);
      bus.off("inbox", onInbox);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
