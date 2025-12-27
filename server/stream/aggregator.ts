import {
  Alert,
  IntersectionId,
  MetricsSnapshot,
  MetricsStreamPayload,
  MetricsWindow,
  PhaseMetrics,
  PhaseSample,
  SignalPhase,
  SimulatorConfig,
  TimeSeriesPoint,
  TrafficTimeSeries,
} from "@/lib/types";
import { getSSEBroker } from "@/server/sse/broker";

const INTERSECTIONS: IntersectionId[] = ["I1", "I2", "I3", "I4"];
const PHASES: SignalPhase[] = ["NS", "EW"];
const HISTORY_LIMIT = 30; // ~2.5 minutes of 5s windows
const WINDOW_MS = {
  "5s": 5_000,
  "60s": 60_000,
} as const;

type DurationKey = keyof typeof WINDOW_MS;

interface WindowState {
  sumQueue: number;
  sampleCount: number;
  departureCount: number;
  windowStart: number;
  consecutiveHighCongestionCount: number;
}

class StreamAggregator {
  private windows: Record<DurationKey, Record<IntersectionId, Record<SignalPhase, WindowState>>>;
  private latestSnapshot: MetricsSnapshot;
  private history: TrafficTimeSeries = { queue: [], speed: [], throughput: [] };

  constructor() {
    const now = Date.now();
    this.windows = this.buildWindowCollection(now);
    this.latestSnapshot = this.createSnapshotShell();
  }

  ingest(samples: PhaseSample[], timestamp: number, config: SimulatorConfig) {
    let shortClosed = false;
    let longClosed = false;

    samples.forEach((sample) => {
      (Object.keys(WINDOW_MS) as DurationKey[]).forEach((duration) => {
        const state = this.ensureWindow(duration, sample.intersectionId, sample.phase, timestamp);
        const windowMs = WINDOW_MS[duration];

        while (timestamp - state.windowStart >= windowMs) {
          const closed = this.finalizeWindow(duration, sample.intersectionId, sample.phase, state, config);
          if (closed) {
            if (duration === "5s") shortClosed = true;
            if (duration === "60s") longClosed = true;
          }
          state.windowStart += windowMs;
          state.sumQueue = 0;
          state.sampleCount = 0;
          state.departureCount = 0;
        }

        state.sumQueue += sample.queueLength;
        state.sampleCount += 1;
        state.departureCount += sample.departures;
      });
    });

    if (shortClosed) {
      this.publishSnapshot(timestamp);
    } else if (longClosed) {
      this.latestSnapshot.updatedAt = new Date(timestamp).toISOString();
    }
  }

  private ensureWindow(
    duration: DurationKey,
    intersection: IntersectionId,
    phase: SignalPhase,
    timestamp: number,
  ) {
    const windowState = this.windows[duration][intersection][phase];
    if (!windowState) {
      this.windows[duration][intersection][phase] = this.createWindowState(duration, timestamp);
      return this.windows[duration][intersection][phase];
    }
    return windowState;
  }

  private finalizeWindow(
    duration: DurationKey,
    intersection: IntersectionId,
    phase: SignalPhase,
    state: WindowState,
    config: SimulatorConfig,
  ) {
    if (state.sampleCount === 0) {
      return false;
    }

    const durationSeconds = WINDOW_MS[duration] / 1000;
    const avgQueue = state.sumQueue / state.sampleCount;
    const throughput = state.departureCount / Math.max(durationSeconds, 1);
    const delayProxy = avgQueue / Math.max(throughput, 1);
    const congestionScore = this.computeCongestionScore(avgQueue, delayProxy, config);

    const metrics: PhaseMetrics = {
      queueLength: Math.round(avgQueue),
      avgSpeed: Math.max(5, Math.round(40 - delayProxy * 4)),
      arrivals: state.sampleCount,
      departures: state.departureCount,
      throughput: Number(throughput.toFixed(2)),
      delayProxy: Number(delayProxy.toFixed(2)),
      congestionScore,
    };

    this.latestSnapshot[duration][intersection][phase] = metrics;

    if (duration === "5s") {
      this.handleCongestionTracking(intersection, phase, state, congestionScore, config);
    }

    return true;
  }

  private handleCongestionTracking(
    intersection: IntersectionId,
    phase: SignalPhase,
    state: WindowState,
    score: number,
    config: SimulatorConfig,
  ) {
    if (score > this.alertThreshold(config)) {
      state.consecutiveHighCongestionCount += 1;
      if (state.consecutiveHighCongestionCount >= 3) {
        this.emitCongestionAlert(intersection, phase, score);
        state.consecutiveHighCongestionCount = 0;
      }
    } else {
      state.consecutiveHighCongestionCount = 0;
    }
  }

  private emitCongestionAlert(intersection: IntersectionId, phase: SignalPhase, score: number) {
    const broker = getSSEBroker();
    const alert: Alert = {
      id: crypto.randomUUID(),
      level: score > 85 ? "critical" : "warning",
      message: `Sustained congestion (${Math.round(score)} pts) at ${intersection} ${phase}`,
      ts: new Date().toISOString(),
      intersectionId: intersection,
      phase,
    };
    broker.broadcast("alert", alert);
  }

  private publishSnapshot(timestamp: number) {
    this.latestSnapshot.updatedAt = new Date(timestamp).toISOString();

    const phases = this.flattenWindow(this.latestSnapshot["5s"]);
    const avgQueue = this.averageFrom(phases, (metric) => metric.queueLength);
    const avgThroughput = this.averageFrom(phases, (metric) => metric.throughput ?? metric.departures);
    const avgDelay = this.averageFrom(phases, (metric) => metric.delayProxy ?? 0);

    const label = new Date(timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });
    const queuePoint: TimeSeriesPoint = { ts: label, value: Math.round(avgQueue) };
    const throughputPoint: TimeSeriesPoint = { ts: label, value: Number(avgThroughput.toFixed(2)) };
    const speedPoint: TimeSeriesPoint = { ts: label, value: Math.max(5, Math.round(38 - avgDelay * 5)) };

    this.appendHistory(queuePoint, speedPoint, throughputPoint);

    const payload: MetricsStreamPayload = {
      snapshot: this.cloneSnapshot(),
      queuePoint,
      speedPoint,
      throughputPoint,
    };

    getSSEBroker().broadcast("metrics", payload);
  }

  private appendHistory(queue: TimeSeriesPoint, speed: TimeSeriesPoint, throughput: TimeSeriesPoint) {
    this.history.queue.push(queue);
    this.history.speed.push(speed);
    this.history.throughput.push(throughput);
    if (this.history.queue.length > HISTORY_LIMIT) this.history.queue.shift();
    if (this.history.speed.length > HISTORY_LIMIT) this.history.speed.shift();
    if (this.history.throughput.length > HISTORY_LIMIT) this.history.throughput.shift();
  }

  private computeCongestionScore(avgQueue: number, delayProxy: number, config: SimulatorConfig) {
    const normalizedQueue = Math.min(1, avgQueue / Math.max(config.threshold, 1));
    const normalizedDelay = Math.min(1, delayProxy / 5);
    return Math.round(normalizedQueue * 70 + normalizedDelay * 30);
  }

  private alertThreshold(config: SimulatorConfig) {
    return Math.min(95, Math.max(40, config.threshold * 3.5));
  }

  private buildWindowCollection(timestamp: number) {
    const collection = {} as Record<DurationKey, Record<IntersectionId, Record<SignalPhase, WindowState>>>;
    (Object.keys(WINDOW_MS) as DurationKey[]).forEach((duration) => {
      collection[duration] = this.buildWindowMatrix(duration, timestamp);
    });
    return collection;
  }

  private buildWindowMatrix(duration: DurationKey, timestamp: number) {
    return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
      intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
        phaseAcc[phase] = this.createWindowState(duration, timestamp);
        return phaseAcc;
      }, {} as Record<SignalPhase, WindowState>);
      return intersectionAcc;
    }, {} as Record<IntersectionId, Record<SignalPhase, WindowState>>);
  }

  private createWindowState(duration: DurationKey, timestamp: number): WindowState {
    const windowMs = WINDOW_MS[duration];
    const windowStart = Math.floor(timestamp / windowMs) * windowMs;
    return {
      sumQueue: 0,
      sampleCount: 0,
      departureCount: 0,
      windowStart,
      consecutiveHighCongestionCount: 0,
    };
  }

  private createSnapshotShell(): MetricsSnapshot {
    const factory = () => this.buildMetricsWindow(() => this.emptyMetrics());
    return {
      updatedAt: new Date().toISOString(),
      "5s": factory(),
      "60s": factory(),
    };
  }

  private buildMetricsWindow(factory: () => PhaseMetrics): MetricsWindow {
    return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
      intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
        phaseAcc[phase] = factory();
        return phaseAcc;
      }, {} as Record<SignalPhase, PhaseMetrics>);
      return intersectionAcc;
    }, {} as MetricsWindow);
  }

  private emptyMetrics(): PhaseMetrics {
    return {
      queueLength: 0,
      avgSpeed: 0,
      arrivals: 0,
      departures: 0,
      throughput: 0,
      delayProxy: 0,
      congestionScore: 0,
    };
  }

  private flattenWindow(window: MetricsWindow) {
    return INTERSECTIONS.flatMap((intersection) => PHASES.map((phase) => window[intersection][phase]));
  }

  private averageFrom(phases: PhaseMetrics[], selector: (metric: PhaseMetrics) => number) {
    if (phases.length === 0) {
      return 0;
    }
    const total = phases.reduce((acc, metric) => acc + selector(metric), 0);
    return total / phases.length;
  }

  private cloneSnapshot(): MetricsSnapshot {
    return {
      updatedAt: this.latestSnapshot.updatedAt,
      "5s": this.cloneWindow(this.latestSnapshot["5s"]),
      "60s": this.cloneWindow(this.latestSnapshot["60s"]),
    };
  }

  private cloneWindow(window: MetricsWindow): MetricsWindow {
    return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
      intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
        phaseAcc[phase] = { ...window[intersection][phase] };
        return phaseAcc;
      }, {} as Record<SignalPhase, PhaseMetrics>);
      return intersectionAcc;
    }, {} as MetricsWindow);
  }

  getSnapshot() {
    return this.cloneSnapshot();
  }

  getHistory(): TrafficTimeSeries {
    return {
      queue: [...this.history.queue],
      speed: [...this.history.speed],
      throughput: [...this.history.throughput],
    };
  }

  reset() {
    const now = Date.now();
    this.windows = this.buildWindowCollection(now);
    this.latestSnapshot = this.createSnapshotShell();
    this.history = { queue: [], speed: [], throughput: [] };

    return this.buildPayload(now);
  }

  private buildPayload(timestamp: number): MetricsStreamPayload {
    this.latestSnapshot.updatedAt = new Date(timestamp).toISOString();
    const phases = this.flattenWindow(this.latestSnapshot["5s"]);
    const avgQueue = this.averageFrom(phases, (m) => m.queueLength);
    const avgThroughput = this.averageFrom(phases, (m) => m.throughput ?? m.departures);
    const avgDelay = this.averageFrom(phases, (m) => m.delayProxy ?? 0);
    const label = new Date(timestamp).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });

    return {
      snapshot: this.cloneSnapshot(),
      queuePoint: { ts: label, value: Math.round(avgQueue) },
      throughputPoint: { ts: label, value: Number(avgThroughput.toFixed(2)) },
      speedPoint: { ts: label, value: Math.max(5, Math.round(38 - avgDelay * 5)) },
    };
  }
}

const globalAggregator = globalThis as typeof globalThis & {
  __trafficStreamAggregator?: StreamAggregator;
};

if (!globalAggregator.__trafficStreamAggregator) {
  globalAggregator.__trafficStreamAggregator = new StreamAggregator();
}

export function getStreamAggregator() {
  return globalAggregator.__trafficStreamAggregator!;
}
