import { stopSimulator } from "@/server/sim/simulator";

export const runtime = "nodejs";

export async function POST() {
  const status = stopSimulator();
  return Response.json({ message: "Simulator stopped", status });
}
