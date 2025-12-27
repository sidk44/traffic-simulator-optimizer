"use client";

import { useRealtimeTraffic } from "@/lib/useRealtimeTraffic";
import { useState } from "react";

const scenarios = [
  {
    name: "Event surge",
    description: "Model a 20% bump on arrivals",
    payload: { baseArrivalRate: 14.4 },
  },
  {
    name: "Lane closure",
    description: "Reduce throughput by 35%",
    payload: { incident: 1.35 },
  },
  {
    name: "Rush hour peak",
    description: "Simulate peak demand period",
    payload: { rushHour: 2.0 },
  },
];

export default function SimulatorPage() {
  const { events } = useRealtimeTraffic();
  const [scenarioStatus, setScenarioStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function applyScenario(scenario: typeof scenarios[0]) {
    setLoading(scenario.name);
    setScenarioStatus(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scenario.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? "Config update failed");
      }
      setScenarioStatus(`✓ ${scenario.name} applied—watch the metrics dashboard.`);
    } catch (error) {
      setScenarioStatus(`✗ ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="space-y-8">
      <header className="space-y-4">
        <p className="accent-pill">Scenario Lab</p>
        <div>
          <h1 className="text-3xl font-semibold text-white">Simulator</h1>
          <p className="mt-2 max-w-3xl text-slate-300">
            Craft what-if experiments for special events, incidents, and future growth. Data
            playback will connect to the real-time SSE feed.
          </p>
        </div>
      </header>

      {scenarioStatus && (
        <div
          className={`card-surface border-l-4 p-4 text-sm ${
            scenarioStatus.startsWith("✓")
              ? "border-l-emerald-400 text-emerald-200"
              : "border-l-red-400 text-red-200"
          }`}
        >
          {scenarioStatus}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card-surface p-6">
          <p className="text-sm text-slate-400">Starter scenarios</p>
          <ul className="mt-4 space-y-4 text-sm text-slate-200">
            {scenarios.map((scenario) => (
              <li key={scenario.name} className="rounded-xl border border-white/5 bg-white/5 p-4">
                <p className="font-medium text-white">{scenario.name}</p>
                <p className="mt-1 text-slate-400">{scenario.description}</p>
                <button
                  onClick={() => applyScenario(scenario)}
                  disabled={loading !== null}
                  className="mt-3 rounded-lg border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {loading === scenario.name ? "Loading..." : "Load into sandbox"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="card-surface p-6">
          <p className="text-sm text-slate-400">Recent events</p>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            {events.slice(0, 6).map((event, idx) => (
              <div key={`${event.ts}-${event.intersectionId}-${event.phase}-${event.type}-${idx}`} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-4 py-3">
                <div>
                  <p className="text-white">{event.intersectionId}</p>
                  <p className="text-xs text-slate-400">
                    {event.note ? event.note : `${event.phase} · ${event.type}`}
                  </p>
                </div>
                <div className="text-right">
                  <p>{event.speed} mph</p>
                  <p className="text-xs text-slate-400">{new Date(event.ts).toLocaleTimeString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card-surface p-6">
        <p className="text-sm text-slate-400">Sandbox canvas</p>
        <div className="mt-4 grid gap-4 text-sm text-slate-300 lg:grid-cols-3">
          <div className="rounded-2xl border border-dashed border-white/15 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Demand</p>
            <p className="mt-2 text-white">See &quot;Starter scenarios&quot; above</p>
          </div>
          <div className="rounded-2xl border border-dashed border-white/15 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Phase logic</p>
            <p className="mt-2 text-white">Manual adjustments via /Optimization</p>
          </div>
          <div className="rounded-2xl border border-dashed border-white/15 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outputs</p>
            <p className="mt-2 text-white">Check /Analytics for metrics</p>
          </div>
        </div>
      </div>
    </section>
  );
}
