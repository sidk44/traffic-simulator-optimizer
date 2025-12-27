"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  IntersectionId,
  MetricsSnapshot,
  MetricsStreamPayload,
  MetricsWindow,
  SignalPhase,
  SignalPlan,
  TrafficEvent,
  TrafficTimeSeries,
} from "@/lib/types";

const INTERSECTIONS: IntersectionId[] = ["I1", "I2", "I3", "I4"];
const PHASES: SignalPhase[] = ["NS", "EW"];

const defaultPlan: SignalPlan = {
  cycle: 60,
  minGreen: 10,
  maxGreen: 50,
  splits: {
    I1: { ns: 30, ew: 30 },
    I2: { ns: 30, ew: 30 },
    I3: { ns: 30, ew: 30 },
    I4: { ns: 30, ew: 30 },
  },
};

const initialAlerts: Alert[] = [
  {
    id: "alert-1",
    level: "warning",
    message: "Queue spillback detected at I2 northbound",
    intersectionId: "I2",
    phase: "NS",
    ts: new Date().toISOString(),
  },
  {
    id: "alert-2",
    level: "info",
    message: "Pedestrian recall active at I4",
    intersectionId: "I4",
    phase: "EW",
    ts: new Date().toISOString(),
  },
];

const initialSeries: TrafficTimeSeries = {
  queue: Array.from({ length: 8 }, (_, idx) => ({
    ts: `${idx * 5}s`,
    value: 8 + Math.sin(idx) * 3,
  })),
  speed: Array.from({ length: 8 }, (_, idx) => ({
    ts: `${idx * 5}s`,
    value: 32 + Math.cos(idx) * 4,
  })),
  throughput: Array.from({ length: 8 }, (_, idx) => ({
    ts: `${idx * 5}s`,
    value: 40 + Math.sin(idx / 2) * 6,
  })),
};

function randomBetween(min: number, max: number) {
  return Math.round(Math.random() * (max - min) + min);
}

function buildMetricsWindow(): MetricsWindow {
  return INTERSECTIONS.reduce((intersectionAcc, intersection) => {
    intersectionAcc[intersection] = PHASES.reduce((phaseAcc, phase) => {
      phaseAcc[phase] = {
        queueLength: randomBetween(3, 20),
        avgSpeed: randomBetween(18, 45),
        arrivals: randomBetween(5, 20),
        departures: randomBetween(5, 20),
      };
      return phaseAcc;
    }, {} as MetricsWindow[IntersectionId]);
    return intersectionAcc;
  }, {} as MetricsWindow);
}

function buildMetricsSnapshot(): MetricsSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    "10s": buildMetricsWindow(),
    "60s": buildMetricsWindow(),
  };
}

function buildMockEvent(): TrafficEvent {
  const intersection = INTERSECTIONS[randomBetween(0, INTERSECTIONS.length - 1)];
  const phase = PHASES[randomBetween(0, PHASES.length - 1)];
  const typePool: TrafficEvent["type"][] = ["arrival", "departure", "queue_update"];

  return {
    ts: new Date().toISOString(),
    intersectionId: intersection,
    phase,
    type: typePool[randomBetween(0, typePool.length - 1)],
    queueLength: randomBetween(2, 25),
    speed: randomBetween(15, 45),
  };
}

export function useRealtimeTraffic() {
  const [events, setEvents] = useState<TrafficEvent[]>(() =>
    Array.from({ length: 6 }, () => buildMockEvent()),
  );
  const [metrics, setMetrics] = useState<MetricsSnapshot>(() => buildMetricsSnapshot());
  const [signalPlan, setSignalPlan] = useState<SignalPlan>(defaultPlan);
  const [alerts, setAlerts] = useState<Alert[]>(initialAlerts);
  const [timeSeries, setTimeSeries] = useState<TrafficTimeSeries>(initialSeries);

  useEffect(() => {
    const source = new EventSource("/api/stream");

    const handleEvent = (evt: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(evt.data) as TrafficEvent;
        if (!payload?.intersectionId) {
          return;
        }
        setEvents((prev) => [...prev, payload].slice(-30));
      } catch (error) {
        console.error("Failed to parse event payload", error);
      }
    };

    const handleMetrics = (evt: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(evt.data) as MetricsStreamPayload;
        if (!payload?.snapshot || !payload.queuePoint || !payload.speedPoint || !payload.throughputPoint) {
          return;
        }
        setMetrics(payload.snapshot);
        setTimeSeries((prev) => ({
          queue: [...prev.queue, payload.queuePoint].slice(-20),
          speed: [...prev.speed, payload.speedPoint].slice(-20),
          throughput: [...prev.throughput, payload.throughputPoint].slice(-20),
        }));
      } catch (error) {
        console.error("Failed to parse metrics payload", error);
      }
    };

    const handlePlan = (evt: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(evt.data) as SignalPlan;
        if (payload?.cycle) {
          setSignalPlan(payload);
        }
      } catch (error) {
        console.error("Failed to parse plan payload", error);
      }
    };

    const handleAlert = (evt: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(evt.data) as Alert;
        if (!payload?.id) {
          return;
        }
        setAlerts((prev) => [payload, ...prev].slice(0, 5));
      } catch (error) {
        console.error("Failed to parse alert payload", error);
      }
    };

    const asListener = (cb: (evt: MessageEvent<string>) => void) =>
      (evt: Event) => cb(evt as MessageEvent<string>);

    const eventListener = asListener(handleEvent);
    const metricsListener = asListener(handleMetrics);
    const planListener = asListener(handlePlan);
    const alertListener = asListener(handleAlert);

    source.addEventListener("event", eventListener);
    source.addEventListener("metrics", metricsListener);
    source.addEventListener("plan", planListener);
    source.addEventListener("alert", alertListener);

    source.onerror = () => {
      console.warn("SSE connection lost. Browser will retry automatically.");
    };

    return () => {
      source.removeEventListener("event", eventListener);
      source.removeEventListener("metrics", metricsListener);
      source.removeEventListener("plan", planListener);
      source.removeEventListener("alert", alertListener);
      source.close();
    };
  }, []);

  type SummaryStats = { avgQueue: number; avgThroughput: number };
  const summary = useMemo<SummaryStats>(() => {
    const phases = Object.values(metrics["10s"]).flatMap((phaseMap) => Object.values(phaseMap));
    if (phases.length === 0) {
      return { avgQueue: 0, avgThroughput: 0 };
    }

    const avgQueue = Math.round(
      phases.reduce((acc, metric) => acc + (metric.queueLength ?? 0), 0) / phases.length,
    );
    const avgThroughput = Number(
      (
        phases.reduce((acc, metric) => acc + (metric.throughput ?? metric.departures ?? 0), 0) /
        phases.length
      ).toFixed(2),
    );

    return { avgQueue, avgThroughput };
  }, [metrics]);

  return {
    events,
    metrics,
    signalPlan,
    alerts,
    timeSeries,
    summary,
  };
}
