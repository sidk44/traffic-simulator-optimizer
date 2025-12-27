import { getOptimizer } from "@/server/or/optimizer";

export const runtime = "nodejs";

export async function POST() {
  try {
    const summary = getOptimizer().applyPendingPlan();
    if (!summary) {
      return Response.json(
        { ok: false, error: "No pending optimization to apply" },
        { status: 409 },
      );
    }

    return Response.json({ ok: true, plan: summary.plan, meta: summary.plan.meta });
  } catch (error) {
    console.error("Optimizer apply failed:", error);
    return Response.json(
      { ok: false, error: "Unable to apply optimizer plan" },
      { status: 500 },
    );
  }
}
