import { getOptimizer } from "@/server/or/optimizer";

export const runtime = "nodejs";

export async function POST() {
  try {
    const optimizer = getOptimizer();
    const summary = optimizer.runNow();
    
    if (!summary) {
      return Response.json(
        { ok: false, error: "Insufficient telemetry for optimization" },
        { status: 409 }
      );
    }

    return Response.json({ ok: true, plan: summary.plan, meta: summary.plan.meta });
  } catch (error) {
    console.error("Optimizer failed:", error);
    return Response.json(
      { ok: false, error: "Optimizer execution failed" },
      { status: 500 }
    );
  }
}
