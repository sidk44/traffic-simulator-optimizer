import { SimulatorStatus } from "@/lib/types";
import { getSSEBroker } from "@/server/sse/broker";
import { getStreamAggregator } from "@/server/stream/aggregator";
import { getSimulatorState } from "./state";

const TICK_MS = 1000;
let timer: NodeJS.Timeout | null = null;

function emitTick() {
  const state = getSimulatorState();
  const { events, samples } = state.advanceTick();
  const broker = getSSEBroker();
  getStreamAggregator().ingest(samples, Date.now(), state.getConfig());
  events.forEach((event) => broker.broadcast("event", event));
}

export function startSimulator(): SimulatorStatus {
  if (!timer) {
    emitTick();
    timer = setInterval(emitTick, TICK_MS);
  }
  const state = getSimulatorState();
  return {
    running: true,
    regime: state.getRegime(),
    config: state.getConfig(),
  };
}

export function stopSimulator(): SimulatorStatus {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const state = getSimulatorState();
  return {
    running: false,
    regime: state.getRegime(),
    config: state.getConfig(),
  };
}

export function simulatorStatus(): SimulatorStatus {
  const state = getSimulatorState();
  return {
    running: Boolean(timer),
    regime: state.getRegime(),
    config: state.getConfig(),
  };
}
