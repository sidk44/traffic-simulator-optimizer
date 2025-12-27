"use client";

import { useRealtimeTraffic } from "@/lib/useRealtimeTraffic";
import { useState } from "react";

type SummaryKey = "avgQueue" | "avgThroughput";

const highlights: Array<{
  label: string;
  unit: string;
  key: SummaryKey;
  precision?: number;
}> = [
  { label: "Avg Queue", unit: "veh", key: "avgQueue" },
  { label: "Avg Throughput", unit: "veh/s", key: "avgThroughput", precision: 2 },
];

export default function OverviewPage() {
  const { summary, metrics, alerts, events } = useRealtimeTraffic();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<"start" | "stop" | "reset" | "optimize" | null>(null);

  async function callEndpoint(path: string, label: typeof loading) {
    setLoading(label);
    setStatus(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? `Failed to ${label}`);
      }
      const successLabel =
        label === "reset"
          ? "Reset"
          : label === "optimize"
            ? "Optimization staged—review in Optimization tab"
            : label === "start"
              ? "Simulator started"
              : "Simulator stopped";
      setStatus(`✓ ${successLabel}`);
    } catch (error) {
      setStatus(`✗ ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="space-y-8">
      <header className="space-y-4">
        <p className="accent-pill">Live Telemetry</p>
        <div>
          <h1 className="text-3xl font-semibold text-white">Corridor Overview</h1>
          <p className="mt-2 max-w-2xl text-slate-300">
            Quick snapshot of the 5s and 60s metrics, the most recent events, and any
            alerts requiring attention.
          </p>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card-surface p-6">
          <p className="text-sm text-slate-400">Controls</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => callEndpoint("/api/start", "start")}
              disabled={loading !== null}
              className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-left text-white transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              <p className="text-sm text-emerald-200">Start</p>
              <p className="text-xs text-slate-300">Begin simulator stream</p>
            </button>
            <button
              onClick={() => callEndpoint("/api/stop", "stop")}
              disabled={loading !== null}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-left text-white transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              <p className="text-sm text-rose-200">Stop</p>
              <p className="text-xs text-slate-300">Pause simulator loop</p>
            </button>
            <button
              onClick={() => callEndpoint("/api/reset", "reset")}
              disabled={loading !== null}
              className="rounded-lg border border-slate-400/40 bg-slate-500/10 px-4 py-3 text-left text-white transition hover:bg-slate-500/20 disabled:opacity-50"
            >
              <p className="text-sm text-slate-200">Reset baseline</p>
              <p className="text-xs text-slate-300">30/30 splits + clear metrics</p>
            </button>
            <button
              onClick={() => callEndpoint("/api/optimize", "optimize")}
              disabled={loading !== null}
              className="rounded-lg border border-sky-400/40 bg-sky-500/10 px-4 py-3 text-left text-white transition hover:bg-sky-500/20 disabled:opacity-50"
            >
              <p className="text-sm text-sky-200">Run optimizer</p>
              <p className="text-xs text-slate-300">Push updated plan</p>
            </button>
          </div>
          {status && (
            <p className={`mt-4 text-sm ${status.startsWith("✓") ? "text-emerald-200" : "text-rose-200"}`}>
              {loading ? `${status}...` : status}
            </p>
          )}
        </div>

        {highlights.map((item) => {
          const value = summary[item.key] ?? 0;
          const display =
            item.precision !== undefined ? value.toFixed(item.precision) : Math.round(value);
          return (
            <div key={item.key} className="card-surface p-6">
              <p className="text-sm text-slate-400">{item.label}</p>
              <div className="mt-4 text-4xl font-semibold text-white">
                {display}
                <span className="ml-2 text-base text-slate-400">{item.unit}</span>
              </div>
            </div>
          );
        })}

        <div className="card-surface p-6">
          <p className="text-sm text-slate-400">Active Alerts</p>
          <ul className="mt-4 space-y-4 text-sm text-slate-200">
            {alerts.length === 0 && <li>No alerts at the moment.</li>}
            {alerts.map((alert) => (
              <li key={alert.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-sky-200/80">
                  <span>{alert.level}</span>
                  <span>{new Date(alert.ts).toLocaleTimeString()}</span>
                </div>
                <p className="mt-2 text-base text-white">{alert.message}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <p className="text-sm text-slate-400">Phase Congestion</p>
            <p className="text-lg text-white">5 second aggregates</p>
          </div>
          <span className="text-xs text-slate-400">Updated {new Date(metrics.updatedAt).toLocaleTimeString()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3">Intersection</th>
                <th className="px-6 py-3">Phase</th>
                <th className="px-6 py-3">Queue</th>
                <th className="px-6 py-3">Throughput</th>
                <th className="px-6 py-3">Delay Proxy</th>
                <th className="px-6 py-3">Congestion</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics['5s']).map(([intersection, phases]) =>
                Object.entries(phases).map(([phase, values]) => {
                  const throughputValue = values.throughput ?? values.departures;
                  const delayValue = values.delayProxy ?? 0;
                  const congestion = values.congestionScore ?? 0;
                  const severityClass =
                    congestion > 80
                      ? "text-rose-300"
                      : congestion > 60
                        ? "text-amber-300"
                        : "text-emerald-300";

                  return (
                    <tr key={`${intersection}-${phase}`} className="border-b border-white/5 text-slate-200">
                      <td className="px-6 py-3 font-medium text-white">{intersection}</td>
                      <td className="px-6 py-3">{phase}</td>
                      <td className="px-6 py-3">{values.queueLength} veh</td>
                      <td className="px-6 py-3">{throughputValue.toFixed(2)} veh/s</td>
                      <td className="px-6 py-3">{delayValue.toFixed(2)}</td>
                      <td className="px-6 py-3">
                        <span className={severityClass}>{Math.round(congestion)} pts</span>
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-surface p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Latest telemetry (30-event buffer)</p>
          <span className="text-xs text-slate-500">{events.length} captured</span>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-200">
          {events.slice(-5).reverse().map((event, idx) => (
            <li key={`${event.ts}-${event.intersectionId}-${event.phase}-${event.type}-${idx}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-4 py-2">
              <div>
                <p className="font-medium text-white">{event.intersectionId}</p>
                <p className="text-xs text-slate-400">
                  {event.note ? event.note : `${event.phase} · ${event.type}`}
                </p>
              </div>
              <div className="text-right">
                <p>{event.queueLength} veh</p>
                <p className="text-xs text-slate-400">{new Date(event.ts).toLocaleTimeString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
