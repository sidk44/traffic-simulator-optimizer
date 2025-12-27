import { StreamEventType } from "@/lib/types";
import { getSSEBroker } from "@/server/sse/broker";

export const runtime = "nodejs";

const INITIAL_EVENTS: StreamEventType[] = ["event", "metrics", "plan", "alert"];

export function GET() {
  const broker = getSSEBroker();
  const { id, stream } = broker.connect();

  INITIAL_EVENTS.forEach((eventType) => {
    const cached = broker.getCached(eventType);
    broker.sendToClient(id, eventType, cached ?? {});
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
