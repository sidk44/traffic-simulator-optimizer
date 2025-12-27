import { SimulatorConfig } from "@/lib/types";
import { getSimulatorState } from "@/server/sim/state";
import { simulatorStatus } from "@/server/sim/simulator";
import { getSSEBroker } from "@/server/sse/broker";

export const runtime = "nodejs";

const numericKeys = [
  "baseArrivalRate",
  "rushHour",
  "incident",
  "alpha",
  "beta",
  "epsilon",
  "threshold",
] as const;

const booleanKeys = [
  "applyOptimizedPlan",
  "sensorNoise",
  "packetLoss",
] as const;

type NumericConfigKey = (typeof numericKeys)[number];

function clamp(key: NumericConfigKey, value: number) {
  switch (key) {
    case "beta":
      return Math.min(1, Math.max(0, value));
    case "epsilon":
      return Math.min(0.5, Math.max(0, value));
    case "threshold":
      return Math.max(1, value);
    case "baseArrivalRate":
      return Math.max(1, value);
    case "rushHour":
    case "incident":
      return Math.max(0.1, value);
    default:
      return value;
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch (error) {
    console.error("Failed to parse config payload", error);
    return new Response(JSON.stringify({ message: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const partial: Partial<SimulatorConfig> = {};
  const assign = <K extends keyof SimulatorConfig>(key: K, value: SimulatorConfig[K]) => {
    partial[key] = value;
  };

  numericKeys.forEach((key) => {
    const raw = body[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      assign(key, clamp(key, raw));
    }
  });

  booleanKeys.forEach((key) => {
    const raw = body[key];
    if (typeof raw === "boolean") {
      assign(key, raw);
    }
  });

  if (Object.keys(partial).length === 0) {
    return new Response(JSON.stringify({ message: "No valid config keys provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const state = getSimulatorState();
  state.updateConfig(partial);

  const status = simulatorStatus();
  
  // Broadcast system event about config change
  const broker = getSSEBroker();
  const changedKeys = Object.keys(partial).join(", ");
  broker.broadcastSystemEvent(`Config updated: ${changedKeys}`);

  return Response.json({ message: "Config updated", status });
}
