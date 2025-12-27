import {
  IntersectionId,
  PhaseQueues,
  PhaseSample,
  PropagationBuffers,
  SignalPhase,
  SignalPlan,
  SimulatorConfig,
  StarvationCounters,
  TrafficEvent,
  TrafficRegime,
} from "@/lib/types";

export const INTERSECTIONS: IntersectionId[] = ["I1", "I2", "I3", "I4"];
export const PHASES: SignalPhase[] = ["NS", "EW"];

const BASE_PLAN: SignalPlan = {
  cycle: 60,
  minGreen: 10,
  maxGreen: 50,
  splits: INTERSECTIONS.reduce((acc, id) => {
    acc[id] = { ns: 30, ew: 30 };
    return acc;
  }, {} as SignalPlan["splits"]),
};

const DEFAULT_CONFIG: SimulatorConfig = {
  baseArrivalRate: 12,
  rushHour: 1.6,
  incident: 1.2,
  applyOptimizedPlan: false,
  alpha: 0.35,
  beta: 0.65,
  epsilon: 0.08,
  threshold: 18,
  sensorNoise: false,
  packetLoss: false,
};

const REGIME_TRANSITIONS: Record<
  TrafficRegime,
  Array<{ state: TrafficRegime; weight: number }>
> = {
  FREE_FLOW: [
    { state: "FREE_FLOW", weight: 0.82 },
    { state: "RUSH", weight: 0.12 },
    { state: "INCIDENT", weight: 0.06 },
  ],
  RUSH: [
    { state: "RUSH", weight: 0.74 },
    { state: "FREE_FLOW", weight: 0.14 },
    { state: "INCIDENT", weight: 0.12 },
  ],
  INCIDENT: [
    { state: "INCIDENT", weight: 0.7 },
    { state: "RUSH", weight: 0.2 },
    { state: "FREE_FLOW", weight: 0.1 },
  ],
};

function buildPhaseMatrix<T>(factory: () => T) {
  return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
    intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
      phaseAcc[phase] = factory();
      return phaseAcc;
    }, {} as Record<SignalPhase, T>);
    return intersectionAcc;
  }, {} as Record<IntersectionId, Record<SignalPhase, T>>);
}

function sampleMatrixState(current: TrafficRegime) {
  const transitions = REGIME_TRANSITIONS[current];
  const roll = Math.random();
  let cumulative = 0;
  for (const { state, weight } of transitions) {
    cumulative += weight;
    if (roll <= cumulative) {
      return state;
    }
  }
  return transitions[transitions.length - 1].state;
}

function clampPositive(value: number) {
  return Math.max(0, Math.round(value));
}

class SimulatorState {
  private config: SimulatorConfig = { ...DEFAULT_CONFIG };
  private regime: TrafficRegime = "FREE_FLOW";
  private plan: SignalPlan = { ...BASE_PLAN };
  private queues: PhaseQueues = buildPhaseMatrix(() => 4);
  private buffers: PropagationBuffers = buildPhaseMatrix(() => []);
  private starvation: StarvationCounters = buildPhaseMatrix(() => 0);
  private travelLagBase = 3;

  getConfig() {
    return this.config;
  }

  getRegime() {
    return this.regime;
  }

  getPlan() {
    return {
      ...this.plan,
      splits: INTERSECTIONS.reduce((acc, intersection) => {
        acc[intersection] = { ...this.plan.splits[intersection] };
        return acc;
      }, {} as SignalPlan["splits"]),
    };
  }

  getStarvationSnapshot() {
    return this.clonePhaseMatrix(this.starvation);
  }

  setPlanSplits(splits: SignalPlan["splits"]) {
    this.plan = {
      ...this.plan,
      splits: INTERSECTIONS.reduce((acc, intersection) => {
        acc[intersection] = {
          ...(splits[intersection] ?? this.plan.splits[intersection]),
        };
        return acc;
      }, {} as SignalPlan["splits"]),
    };
  }

  restoreBaselinePlan() {
    this.plan = { ...BASE_PLAN, splits: { ...BASE_PLAN.splits } };
    this.starvation = buildPhaseMatrix(() => 0);
  }

  updateConfig(partial: Partial<SimulatorConfig>) {
    this.config = { ...this.config, ...partial };
  }

  reset() {
    this.queues = buildPhaseMatrix(() => 4);
    this.buffers = buildPhaseMatrix(() => []);
    this.starvation = buildPhaseMatrix(() => 0);
  }

  resetStarvation() {
    this.starvation = buildPhaseMatrix(() => 0);
  }

  advanceTick(): { events: TrafficEvent[]; samples: PhaseSample[] } {
    this.regime = sampleMatrixState(this.regime);
    const events: TrafficEvent[] = [];
    const samples: PhaseSample[] = [];

    INTERSECTIONS.forEach((intersection, idx) => {
      PHASES.forEach((phase) => {
        const arrivals = this.computeArrivals(idx, phase);
        const propagationArrivals = this.flushBuffer(intersection, phase);
        const totalArrivals = arrivals + propagationArrivals;
        this.queues[intersection][phase] += totalArrivals;

        const departures = this.computeDepartures(intersection, phase, totalArrivals);
        this.queues[intersection][phase] = Math.max(0, this.queues[intersection][phase] - departures);
        this.enqueuePropagation(idx, phase, departures);
        this.updateStarvation(intersection, phase, totalArrivals, departures);

        const baseSpeed = this.estimateSpeed(this.queues[intersection][phase], departures);
        const queueLength = this.queues[intersection][phase];
        const event = this.decorateEvent(intersection, phase, queueLength, baseSpeed);

        if (!this.dropPacket()) {
          events.push(event);
        }

        samples.push({
          intersectionId: intersection,
          phase,
          queueLength,
          departures,
        });
      });
    });

    return { events, samples };
  }

  private computeArrivals(intersectionIndex: number, phase: SignalPhase) {
    const { baseArrivalRate, rushHour, incident } = this.config;
    const regimeFactor =
      this.regime === "RUSH" ? rushHour : this.regime === "INCIDENT" ? incident : 1;
    const corridorBias = 1 + intersectionIndex * 0.04;
    const phaseBias = phase === "EW" ? 1.05 : 0.95;
    const stochastic = 1 + (Math.random() * 0.3 - 0.15);
    return clampPositive(baseArrivalRate * regimeFactor * corridorBias * phaseBias * stochastic);
  }

  private computeDepartures(intersection: IntersectionId, phase: SignalPhase, arrivals: number) {
    const split = this.plan.splits[intersection][phase === "NS" ? "ns" : "ew"];
    const planRatio = split / this.plan.cycle;
    const optimizedBoost = this.config.applyOptimizedPlan ? 1.18 : 1;
    const baseService = this.config.baseArrivalRate * 1.2 * planRatio * optimizedBoost;
    const queuePressure = Math.max(0, this.queues[intersection][phase] - this.config.threshold);
    const starvationBoost = 1 + this.starvation[intersection][phase] * 0.05;
    const service = baseService + queuePressure * this.config.alpha;
    const regulated = service * starvationBoost;
    const degraded = this.regime === "INCIDENT" ? regulated * 0.7 : regulated;
    const finalService = Math.max(degraded, arrivals * 0.4);
    return clampPositive(Math.min(this.queues[intersection][phase], finalService));
  }

  private enqueuePropagation(intersectionIndex: number, phase: SignalPhase, departures: number) {
    const downstream = INTERSECTIONS[intersectionIndex + 1];
    if (!downstream) {
      return;
    }

    const ratio = Math.min(1, Math.max(0, this.config.beta));
    const forwarded = clampPositive(departures * ratio);
    if (forwarded === 0) {
      return;
    }

    const travelLag = Math.max(1, Math.round(this.travelLagBase + intersectionIndex * 0.5));
    this.buffers[downstream][phase].push({ delay: travelLag, volume: forwarded });
  }

  private flushBuffer(intersection: IntersectionId, phase: SignalPhase) {
    const buffer = this.buffers[intersection][phase];
    if (buffer.length === 0) {
      return 0;
    }

    let arrivals = 0;
    for (let i = buffer.length - 1; i >= 0; i -= 1) {
      buffer[i].delay -= 1;
      if (buffer[i].delay <= 0) {
        arrivals += buffer[i].volume;
        buffer.splice(i, 1);
      }
    }
    return arrivals;
  }

  private updateStarvation(
    intersection: IntersectionId,
    phase: SignalPhase,
    arrivals: number,
    departures: number,
  ) {
    const queue = this.queues[intersection][phase];
    const starving = queue > this.config.threshold && departures < arrivals * 0.5;
    this.starvation[intersection][phase] = starving
      ? this.starvation[intersection][phase] + 1
      : 0;
  }

  private estimateSpeed(queueLength: number, departures: number) {
    const base = this.regime === "FREE_FLOW" ? 35 : this.regime === "RUSH" ? 26 : 18;
    const queuePenalty = queueLength * 0.4;
    const dischargeBonus = Math.min(6, departures * 0.3);
    return Math.max(5, Math.round(base - queuePenalty + dischargeBonus));
  }

  private decorateEvent(
    intersection: IntersectionId,
    phase: SignalPhase,
    queueLength: number,
    speed: number,
  ): TrafficEvent {
    return {
      ts: new Date().toISOString(),
      intersectionId: intersection,
      phase,
      type: "queue_update",
      queueLength: this.withSensorNoise(queueLength),
      speed: this.withSensorNoise(speed, true),
    };
  }

  private withSensorNoise(value: number, clamp = false) {
    if (!this.config.sensorNoise) {
      return Math.round(value);
    }
    const jitter = value * this.config.epsilon * (Math.random() * 2 - 1);
    const noisy = value + jitter;
    return clamp ? Math.max(0, Math.round(noisy)) : Math.round(Math.max(0, noisy));
  }

  private dropPacket() {
    if (!this.config.packetLoss) {
      return false;
    }
    return Math.random() < 0.08;
  }

  private clonePhaseMatrix<T>(
    source: Record<IntersectionId, Record<SignalPhase, T>>,
  ): Record<IntersectionId, Record<SignalPhase, T>> {
    return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
      intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
        phaseAcc[phase] = source[intersection][phase];
        return phaseAcc;
      }, {} as Record<SignalPhase, T>);
      return intersectionAcc;
    }, {} as Record<IntersectionId, Record<SignalPhase, T>>);
  }
}

const globalState = globalThis as typeof globalThis & {
  __trafficSimState?: SimulatorState;
};

if (!globalState.__trafficSimState) {
  globalState.__trafficSimState = new SimulatorState();
}

export function getSimulatorState() {
  return globalState.__trafficSimState!;
}