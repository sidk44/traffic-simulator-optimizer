import { getSSEBroker } from "@/server/sse/broker";
import { getStreamAggregator } from "@/server/stream/aggregator";
import {
  DEFAULT_CONFIG,
  getSimulatorState,
  INTERSECTIONS,
} from "@/server/sim/state";
import { IntersectionId, TrafficEvent } from "@/lib/types";

export const runtime = "nodejs";

export async function POST() {
  try {
    const simulator = getSimulatorState();
    const aggregator = getStreamAggregator();
    const broker = getSSEBroker();

    // Reset simulator to baseline
    simulator.restoreBaselinePlan();
    simulator.resetStarvation();
    simulator.updateConfig({ ...DEFAULT_CONFIG });

    // Build default baseline plan with metadata
    const plan = simulator.getPlan();
    plan.meta = {
      generatedAt: new Date().toISOString(),
      strategy: "baseline",
      objective: 0,
      baselineObjective: 0,
      intersections: INTERSECTIONS.reduce(
        (acc, id) => {
          acc[id] = { objective: 0, baselineObjective: 0 };
          return acc;
        },
        {} as Record<IntersectionId, { objective: number; baselineObjective: number }>
      ),
    };

    // Reset aggregator metrics
    const payload = aggregator.reset();

    // Broadcast updates
    broker.broadcast("plan", plan);
    broker.broadcast("metrics", payload);

    // Emit system event
    const event: TrafficEvent = {
      ts: new Date().toISOString(),
      intersectionId: "I1",
      phase: "NS",
      type: "queue_update",
      queueLength: 0,
      speed: 0,
      note: "Plan reset to 30/30 baseline and metrics cleared",
    };
    broker.broadcast("event", event);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Reset failed:", error);
    return Response.json(
      { ok: false, error: "Reset operation failed" },
      { status: 500 }
    );
  }
}
