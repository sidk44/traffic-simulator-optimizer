import { startSimulator } from "@/server/sim/simulator";

export const runtime = "nodejs";

export async function POST() {
  const status = startSimulator();
  return Response.json({ message: "Simulator started", status });
}
