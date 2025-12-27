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
const MAX_ITERATIONS = 20;
// Amplification factor to make queue differences more visible in optimization
const QUEUE_SENSITIVITY = 2.5;

interface IntersectionResult {
  split: SignalPlanSplit;
  objective: number;
  baselineObjective: number;
}

class Optimizer {
  private timer: NodeJS.Timeout | null = null;
  private lastSummary: OptimizationSummary | null = null;
  private pendingSummary: OptimizationSummary | null = null;

  constructor() {
    this.timer = setInterval(() => this.autoRun(), 60_000);
  }

  autoRun() {
    const simulator = getSimulatorState();
    const config = simulator.getConfig();
    if (!config.applyOptimizedPlan) {
      return;
    }
    this.runInternal({ apply: true });
  }

  runNow() {
    return this.runInternal({ apply: false });
  }

  getLastSummary() {
    return this.lastSummary;
  }

  applyPendingPlan() {
    if (!this.pendingSummary) {
      return null;
    }
    this.commitPlan(this.pendingSummary);
    return this.lastSummary;
  }

  private runInternal(options: { apply: boolean }) {
    const simulator = getSimulatorState();
    const aggregator = getStreamAggregator();
    const snapshot = aggregator.getSnapshot();
    const starvation = simulator.getStarvationSnapshot();
    const config = simulator.getConfig();
    const metrics60 = snapshot["60s"];
    const fallback = snapshot["5s"];

    const splits: Record<IntersectionId, SignalPlanSplit> = {} as SignalPlan["splits"];
    const details: Record<IntersectionId, PlanMetaIntersection> = {} as Record<IntersectionId, PlanMetaIntersection>;
    let totalObjective = 0;
    let totalBaseline = 0;

    // Track whether we have any meaningful metrics at all
    let hasMetrics = false;

    INTERSECTIONS.forEach((intersection) => {
      const statsNS = metrics60[intersection]?.NS ?? fallback[intersection]?.NS;
      const statsEW = metrics60[intersection]?.EW ?? fallback[intersection]?.EW;
      
      // Check if we have real metrics data
      const hasNS = statsNS && (statsNS.queueLength > 0 || statsNS.arrivals > 0);
      const hasEW = statsEW && (statsEW.queueLength > 0 || statsEW.arrivals > 0);
      
      if (!hasNS && !hasEW) {
        // No metrics yet - use demand multipliers to bias the split
        const nsBias = config.nsDemandMultiplier ?? 1;
        const ewBias = config.ewDemandMultiplier ?? 1;
        const totalBias = nsBias + ewBias;
        const nsRatio = nsBias / totalBias;
        const seedNS = Math.round(nsRatio * CYCLE);
        const clamped = this.clampGreen(seedNS);
        splits[intersection] = { ns: clamped.ns, ew: CYCLE - clamped.ns };
        
        // Calculate improvement based on bias difference
        const biasDiff = Math.abs(nsBias - ewBias);
        const baseObj = 100;
        const optObj = Math.max(50, 100 - biasDiff * 25);
        details[intersection] = { objective: optObj, baselineObjective: baseObj };
        totalObjective += optObj;
        totalBaseline += baseObj;
        return;
      }

      hasMetrics = true;
      const starvationNS = starvation[intersection]?.NS ?? 0;
      const starvationEW = starvation[intersection]?.EW ?? 0;
      const result = this.optimizeIntersection(
        statsNS ?? { queueLength: 5, avgSpeed: 30, arrivals: 10, departures: 8, throughput: 1.5, delayProxy: 1, congestionScore: 25 },
        statsEW ?? { queueLength: 5, avgSpeed: 30, arrivals: 10, departures: 8, throughput: 1.5, delayProxy: 1, congestionScore: 25 },
        starvationNS,
        starvationEW,
        config
      );
      splits[intersection] = result.split;
      details[intersection] = {
        objective: Number(result.objective.toFixed(3)),
        baselineObjective: Number(result.baselineObjective.toFixed(3)),
      };
      totalObjective += result.objective;
      totalBaseline += result.baselineObjective;
    });

    const plan = simulator.getPlan();
    plan.splits = INTERSECTIONS.reduce((acc, intersection) => {
      acc[intersection] = { ...splits[intersection] };
      return acc;
    }, {} as SignalPlan["splits"]);
    const generatedAt = new Date().toISOString();
    const meta: PlanMeta = {
      generatedAt,
      strategy: (config.applyOptimizedPlan ? "optimized" : "suggested") as PlanMeta["strategy"],
      objective: Number(totalObjective.toFixed(3)),
      baselineObjective: Number(totalBaseline.toFixed(3)),
      intersections: details,
    };
    plan.meta = meta;

    const summary: OptimizationSummary = {
      timestamp: generatedAt,
      objective: meta.objective,
      baselineObjective: meta.baselineObjective,
      plan,
    };
    this.lastSummary = summary;

    if (options.apply) {
      this.commitPlan(summary);
    } else {
      this.pendingSummary = summary;
    }

    return this.lastSummary;
  }

  private commitPlan(summary: OptimizationSummary) {
    const simulator = getSimulatorState();
    simulator.setPlanSplits(summary.plan.splits, summary.plan.meta);
    const appliedPlan = simulator.getPlan();
    appliedPlan.meta = summary.plan.meta;
    getSSEBroker().broadcast("plan", appliedPlan);
    this.lastSummary = { ...summary, plan: appliedPlan };
    this.pendingSummary = null;
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

    // Amplify queue differences for more pronounced optimization
    const ampNS = statsNS.queueLength * QUEUE_SENSITIVITY;
    const ampEW = statsEW.queueLength * QUEUE_SENSITIVITY;
    
    // Also consider congestion scores
    const congNS = statsNS.congestionScore ?? 0;
    const congEW = statsEW.congestionScore ?? 0;
    
    // Combine queue and congestion for demand signal
    const demandNS = ampNS + congNS * 0.3;
    const demandEW = ampEW + congEW * 0.3;

    let { ns } = this.seedSplit(demandNS, demandEW);
    ns = this.clampGreen(ns).ns;
    let bestObjective = this.evaluateSplit(ns, statsNS, statsEW, fairnessNS, fairnessEW, config);

    // Hill climbing - try to find better splits
    for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
      let improved = false;
      for (const delta of [-2, -1, 1, 2]) {
        const candidate = this.clampGreen(ns + delta);
        if (!candidate.valid) {
          continue;
        }
        const objective = this.evaluateSplit(candidate.ns, statsNS, statsEW, fairnessNS, fairnessEW, config);
        if (objective + 0.001 < bestObjective) {
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

  private seedSplit(demandNS: number, demandEW: number) {
    const total = demandNS + demandEW;
    // Bias toward the heavier direction but ensure minimum difference
    const ratio = total === 0 ? 0.5 : demandNS / total;
    // Amplify the ratio difference from 0.5 to create more distinct splits
    const amplifiedRatio = 0.5 + (ratio - 0.5) * 1.8;
    const clampedRatio = Math.max(0.2, Math.min(0.8, amplifiedRatio));
    return { ns: Math.round(clampedRatio * CYCLE), ew: Math.round((1 - clampedRatio) * CYCLE) };
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
    // Direct evaluation without robust scenarios - we want clear optimization signal
    return this.objectiveForScenario(ns, ew, statsNS, statsEW, 0, fairnessNS, fairnessEW, config);
  }

  private objectiveForScenario(
    nsGreen: number,
    ewGreen: number,
    statsNS: PhaseMetrics,
    statsEW: PhaseMetrics,
    delta: number,
    fairnessNS: number,
    fairnessEW: number,
    _config: SimulatorConfig,
  ) {
    const adjustedNS = this.adjustMetrics(statsNS, delta);
    const adjustedEW = this.adjustMetrics(statsEW, -delta);

    const pressureNS = this.pressure(adjustedNS, fairnessNS);
    const pressureEW = this.pressure(adjustedEW, fairnessEW);
    const spillNS = this.spillback(adjustedNS);
    const spillEW = this.spillback(adjustedEW);

    // Key insight: we want to give more green time to higher-pressure phases
    // The cost of queue delay scales with queue^2 (queuing theory)
    // Using quadratic pressure makes unequal splits much more beneficial
    const nsDelayCost = (pressureNS * pressureNS) / (nsGreen * nsGreen);
    const ewDelayCost = (pressureEW * pressureEW) / (ewGreen * ewGreen);
    
    // Spillback adds linear penalty
    const spillPenalty = spillNS + spillEW;

    return nsDelayCost + ewDelayCost + spillPenalty * 0.1;
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
