import { IntersectionId, PlanMetaIntersection, TrafficEvent } from "@/lib/types";
import { getSSEBroker } from "@/server/sse/broker";
import { getSimulatorState } from "@/server/sim/state";

export const runtime = "nodejs";

interface ManualPlanBody {
  intersectionId: IntersectionId;
  greenNS: number;
}

const CYCLE = 60;
const MIN_GREEN = 10;
const MAX_GREEN = 50;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ManualPlanBody>;

    const intersection = body.intersectionId;
    if (!intersection) {
      return Response.json(
        { ok: false, error: "intersectionId is required" },
        { status: 400 }
      );
    }

    let ns = Number(body.greenNS);
    if (!Number.isFinite(ns)) {
      return Response.json(
        { ok: false, error: "greenNS must be a valid number" },
        { status: 400 }
      );
    }

    // Clamp NS to valid range
    ns = Math.max(MIN_GREEN, Math.min(MAX_GREEN, ns));
    let ew = CYCLE - ns;

    // Ensure EW is also in valid range
    if (ew < MIN_GREEN) {
      ew = MIN_GREEN;
      ns = CYCLE - ew;
    } else if (ew > MAX_GREEN) {
      ew = MAX_GREEN;
      ns = CYCLE - ew;
    }

    const simulator = getSimulatorState();
    const currentPlan = simulator.getPlan();

    // Update only the specified intersection with a full splits record
    const updatedSplits = {
      I1: currentPlan.splits.I1,
      I2: currentPlan.splits.I2,
      I3: currentPlan.splits.I3,
      I4: currentPlan.splits.I4,
    } as Record<IntersectionId, { ns: number; ew: number }>;
    updatedSplits[intersection] = { ns, ew };

    simulator.setPlanSplits(updatedSplits);

    const updatedPlan = simulator.getPlan();
    const prevMeta = currentPlan.meta?.intersections ?? ({} as Record<IntersectionId, PlanMetaIntersection>);
    const intersections: Record<IntersectionId, PlanMetaIntersection> = {
      I1: prevMeta.I1 ?? { objective: 0, baselineObjective: 0 },
      I2: prevMeta.I2 ?? { objective: 0, baselineObjective: 0 },
      I3: prevMeta.I3 ?? { objective: 0, baselineObjective: 0 },
      I4: prevMeta.I4 ?? { objective: 0, baselineObjective: 0 },
    };
    intersections[intersection] = { objective: 0, baselineObjective: 0 };
    updatedPlan.meta = {
      generatedAt: new Date().toISOString(),
      strategy: "suggested",
      objective: 0,
      baselineObjective: 0,
      intersections,
    };

    const broker = getSSEBroker();
    broker.broadcast("plan", updatedPlan);

    // Emit system event
    const event: TrafficEvent = {
      ts: new Date().toISOString(),
      intersectionId: intersection,
      phase: "NS",
      type: "queue_update",
      queueLength: 0,
      speed: 0,
      note: `Manual stage adjustment: ${intersection} NS=${ns}s, EW=${ew}s`,
    };
    broker.broadcast("event", event);

    return Response.json({ ok: true, plan: updatedPlan });
  } catch (error) {
    console.error("Manual plan update failed:", error);
    return Response.json(
      { ok: false, error: "Manual plan update failed" },
      { status: 500 }
    );
  }
}
