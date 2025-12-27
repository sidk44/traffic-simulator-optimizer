export type IntersectionId = "I1" | "I2" | "I3" | "I4";
export type SignalPhase = "NS" | "EW";
export type TrafficEventType = "arrival" | "departure" | "queue_update";

export interface TrafficEvent {
  ts: string;
  intersectionId: IntersectionId;
  phase: SignalPhase;
  type: TrafficEventType;
  queueLength: number;
  speed: number;
  note?: string;
}

export interface PhaseMetrics {
  queueLength: number;
  avgSpeed: number;
  arrivals: number;
  departures: number;
  throughput: number;
  delayProxy: number;
  congestionScore: number;
}

export type MetricsWindow = Record<IntersectionId, Record<SignalPhase, PhaseMetrics>>;

export interface MetricsSnapshot {
  updatedAt: string;
  "10s": MetricsWindow;
  "60s": MetricsWindow;
}

export interface SignalPlanSplit {
  ns: number;
  ew: number;
}

export interface SignalPlan {
  cycle: number;
  minGreen: number;
  maxGreen: number;
  splits: Record<IntersectionId, SignalPlanSplit>;
  meta?: PlanMeta;
}

export type AlertLevel = "info" | "warning" | "critical";

export interface Alert {
  id: string;
  level: AlertLevel;
  message: string;
  ts: string;
  intersectionId?: IntersectionId;
  phase?: SignalPhase;
}

export interface TimeSeriesPoint {
  ts: string;
  value: number;
}

export interface TrafficTimeSeries {
  queue: TimeSeriesPoint[];
  speed: TimeSeriesPoint[];
  throughput: TimeSeriesPoint[];
}

export interface MetricsStreamPayload {
  snapshot: MetricsSnapshot;
  queuePoint: TimeSeriesPoint;
  speedPoint: TimeSeriesPoint;
  throughputPoint: TimeSeriesPoint;
}

export type StreamEventType = "event" | "metrics" | "plan" | "alert";

export interface StreamPayloadMap {
  event: TrafficEvent;
  metrics: MetricsStreamPayload;
  plan: SignalPlan;
  alert: Alert;
}

export interface PhaseSample {
  intersectionId: IntersectionId;
  phase: SignalPhase;
  queueLength: number;
  departures: number;
}

export interface PlanMetaIntersection {
  objective: number;
  baselineObjective: number;
}

export interface PlanMeta {
  generatedAt: string;
  strategy: "baseline" | "optimized" | "suggested";
  objective: number;
  baselineObjective: number;
  intersections: Record<IntersectionId, PlanMetaIntersection>;
}

export interface OptimizationSummary {
  timestamp: string;
  objective: number;
  baselineObjective: number;
  plan: SignalPlan;
}

export type TrafficRegime = "FREE_FLOW" | "RUSH" | "INCIDENT";

export interface SimulatorConfig {
  baseArrivalRate: number;
  rushHour: number;
  incident: number;
  applyOptimizedPlan: boolean;
  alpha: number;
  beta: number;
  epsilon: number;
  threshold: number;
  sensorNoise: boolean;
  packetLoss: boolean;
}

export type PhaseQueues = Record<IntersectionId, Record<SignalPhase, number>>;

export type PropagationBuffers = Record<
  IntersectionId,
  Record<SignalPhase, Array<{ delay: number; volume: number }>>
>;

export type StarvationCounters = Record<IntersectionId, Record<SignalPhase, number>>;

export interface SimulatorStatus {
  running: boolean;
  regime: TrafficRegime;
  config: SimulatorConfig;
}
