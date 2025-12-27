import {
  IntersectionId,
  OptimizationSummary,
  PlanMeta,
  PlanMetaIntersection,
  PhaseMetrics,
  SignalPlan,
  SignalPlanSplit,
  SimulatorConfig,
} from "@/lib/types";
import { getSSEBroker } from "@/server/sse/broker";
import { getStreamAggregator } from "@/server/stream/aggregator";
import { INTERSECTIONS, getSimulatorState } from "@/server/sim/state";

const CYCLE = 60;
const MIN_GREEN = 10;
const MAX_GREEN = 50;
const SPILLBACK_FACTOR = 1.25;
const MAX_ITERATIONS = 10;

interface IntersectionResult {
  split: SignalPlanSplit;
  objective: number;
  baselineObjective: number;
}

class Optimizer {
  private timer: NodeJS.Timeout | null = null;
  private lastSummary: OptimizationSummary | null = null;

  constructor() {
    this.timer = setInterval(() => this.autoRun(), 60_000);
  }

  autoRun() {
    const simulator = getSimulatorState();
    const config = simulator.getConfig();
    if (!config.applyOptimizedPlan) {
      return;
    }
    this.runInternal();
  }

  runNow() {
    return this.runInternal();
  }

  getLastSummary() {
    return this.lastSummary;
  }

  private runInternal() {
    const simulator = getSimulatorState();
    const aggregator = getStreamAggregator();
    const snapshot = aggregator.getSnapshot();
    const starvation = simulator.getStarvationSnapshot();
    const config = simulator.getConfig();
    const metrics60 = snapshot["60s"];
    const fallback = snapshot["10s"];

    const splits: Record<IntersectionId, SignalPlanSplit> = {} as SignalPlan["splits"];
    const details: Record<IntersectionId, PlanMetaIntersection> = {} as Record<IntersectionId, PlanMetaIntersection>;
    let totalObjective = 0;
    let totalBaseline = 0;

    INTERSECTIONS.forEach((intersection) => {
      const statsNS = metrics60[intersection]?.NS ?? fallback[intersection]?.NS;
      const statsEW = metrics60[intersection]?.EW ?? fallback[intersection]?.EW;
      if (!statsNS || !statsEW) {
        splits[intersection] = { ns: 30, ew: 30 };
        details[intersection] = { objective: 0, baselineObjective: 0 };
        return;
      }

      const starvationNS = starvation[intersection]?.NS ?? 0;
      const starvationEW = starvation[intersection]?.EW ?? 0;
      const result = this.optimizeIntersection(statsNS, statsEW, starvationNS, starvationEW, config);
      splits[intersection] = result.split;
      details[intersection] = {
        objective: Number(result.objective.toFixed(3)),
        baselineObjective: Number(result.baselineObjective.toFixed(3)),
      };
      totalObjective += result.objective;
      totalBaseline += result.baselineObjective;
    });

    simulator.setPlanSplits(splits);
    const plan = simulator.getPlan();
    const generatedAt = new Date().toISOString();
    const meta: PlanMeta = {
      generatedAt,
      strategy: (config.applyOptimizedPlan ? "optimized" : "suggested") as PlanMeta["strategy"],
      objective: Number(totalObjective.toFixed(3)),
      baselineObjective: Number(totalBaseline.toFixed(3)),
      intersections: details,
    };
    plan.meta = meta;

    getSSEBroker().broadcast("plan", plan);

    this.lastSummary = {
      timestamp: generatedAt,
      objective: meta.objective,
      baselineObjective: meta.baselineObjective,
      plan,
    };

    return this.lastSummary;
  }

  private optimizeIntersection(
    statsNS: PhaseMetrics,
    statsEW: PhaseMetrics,
    starvationNS: number,
    starvationEW: number,
    config: SimulatorConfig,
  ): IntersectionResult {
    const fairnessNS = 1 + Math.min(starvationNS, 5) * 0.05;
    const fairnessEW = 1 + Math.min(starvationEW, 5) * 0.05;

    let { ns } = this.seedSplit(statsNS.queueLength, statsEW.queueLength);
    ns = this.clampGreen(ns).ns;
    let bestObjective = this.evaluateSplit(ns, statsNS, statsEW, fairnessNS, fairnessEW, config);

    for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
      let improved = false;
      for (const delta of [-1, 1]) {
        const candidate = this.clampGreen(ns + delta);
        if (!candidate.valid) {
          continue;
        }
        const objective = this.evaluateSplit(candidate.ns, statsNS, statsEW, fairnessNS, fairnessEW, config);
        if (objective + 0.01 < bestObjective) {
          bestObjective = objective;
          ns = candidate.ns;
          improved = true;
          break;
        }
      }
      if (!improved) {
        break;
      }
    }

    const baselineObjective = this.evaluateSplit(30, statsNS, statsEW, fairnessNS, fairnessEW, config);

    return {
      split: { ns, ew: CYCLE - ns },
      objective: bestObjective,
      baselineObjective,
    };
  }

  private seedSplit(qNS: number, qEW: number) {
    const total = qNS + qEW;
    const ratio = total === 0 ? 0.5 : qNS / total;
    return { ns: Math.round(ratio * CYCLE), ew: Math.round((1 - ratio) * CYCLE) };
  }

  private clampGreen(ns: number) {
    let clamped = Math.max(MIN_GREEN, Math.min(MAX_GREEN, ns));
    let ew = CYCLE - clamped;
    if (ew < MIN_GREEN) {
      ew = MIN_GREEN;
      clamped = CYCLE - ew;
    }
    if (ew > MAX_GREEN) {
      ew = MAX_GREEN;
      clamped = CYCLE - ew;
    }
    const valid = clamped >= MIN_GREEN && clamped <= MAX_GREEN && ew >= MIN_GREEN && ew <= MAX_GREEN;
    return { ns: clamped, ew, valid };
  }

  private evaluateSplit(
    ns: number,
    statsNS: PhaseMetrics,
    statsEW: PhaseMetrics,
    fairnessNS: number,
    fairnessEW: number,
    config: SimulatorConfig,
  ) {
    const ew = CYCLE - ns;
    if (ns < MIN_GREEN || ns > MAX_GREEN || ew < MIN_GREEN || ew > MAX_GREEN) {
      return Number.POSITIVE_INFINITY;
    }
    const epsilon = Math.min(0.3, Math.max(0.02, config.epsilon));
    const scenarios = [-epsilon, 0, epsilon];
    let worst = 0;
    scenarios.forEach((delta) => {
      const objective = this.objectiveForScenario(ns, ew, statsNS, statsEW, delta, fairnessNS, fairnessEW, config);
      worst = Math.max(worst, objective);
    });
    return worst;
  }

  private objectiveForScenario(
    nsGreen: number,
    ewGreen: number,
    statsNS: PhaseMetrics,
    statsEW: PhaseMetrics,
    delta: number,
    fairnessNS: number,
    fairnessEW: number,
    config: SimulatorConfig,
  ) {
    const adjustedNS = this.adjustMetrics(statsNS, delta);
    const adjustedEW = this.adjustMetrics(statsEW, -delta);

    const pressureNS = this.pressure(adjustedNS, fairnessNS);
    const pressureEW = this.pressure(adjustedEW, fairnessEW);
    const spillNS = this.spillback(adjustedNS);
    const spillEW = this.spillback(adjustedEW);

    return (
      pressureNS / nsGreen +
      pressureEW / ewGreen +
      config.alpha * Math.abs(nsGreen - ewGreen) +
      config.beta * (spillNS + spillEW)
    );
  }

  private adjustMetrics(stats: PhaseMetrics, delta: number) {
    const queue = Math.max(0, stats.queueLength * (1 + delta));
    const throughputBase = stats.throughput ?? stats.departures ?? 1;
    const throughput = Math.max(0.5, throughputBase * (1 - delta / 2));
    const congestion = stats.congestionScore ?? 0;
    return { queue, throughput, congestion };
  }

  private pressure(metrics: { queue: number; congestion: number }, fairness: number) {
    const congestionFactor = 1 + (metrics.congestion ?? 0) / 100;
    return (metrics.queue * congestionFactor) / fairness;
  }

  private spillback(metrics: { queue: number; throughput: number }) {
    return Math.max(0, metrics.queue - SPILLBACK_FACTOR * metrics.throughput);
  }
}

const optimizer = new Optimizer();

export function runOptimizationNow() {
  return optimizer.runNow();
}

export function getOptimizationSummary() {
  return optimizer.getLastSummary();
}

export function getOptimizer() {
  return optimizer;
}
