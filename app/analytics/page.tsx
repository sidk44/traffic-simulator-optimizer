"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRealtimeTraffic } from "@/lib/useRealtimeTraffic";

export default function AnalyticsPage() {
  const { timeSeries } = useRealtimeTraffic();

  return (
    <section className="space-y-8">
      <header className="space-y-4">
        <p className="accent-pill">Trend Analysis</p>
        <div>
          <h1 className="text-3xl font-semibold text-white">Analytics</h1>
          <p className="mt-2 max-w-3xl text-slate-300">
            Compare queue, speed, and throughput trajectories to understand how current
            plans perform through the last several refreshes.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card-surface h-80 p-6">
          <p className="text-sm text-slate-400">Queue Length</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries.queue} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#1f2937" />
              <XAxis dataKey="ts" stroke="#94a3b8" tickLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Line type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card-surface h-80 p-6">
          <p className="text-sm text-slate-400">Average Speed</p>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries.speed} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#1f2937" />
              <XAxis dataKey="ts" stroke="#94a3b8" tickLine={false} />
              <YAxis stroke="#94a3b8" tickLine={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              <Line type="monotone" dataKey="value" stroke="#c084fc" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface h-80 p-6">
        <p className="text-sm text-slate-400">Throughput</p>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={timeSeries.throughput} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34d399" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#1f2937" />
            <XAxis dataKey="ts" stroke="#94a3b8" tickLine={false} />
            <YAxis stroke="#94a3b8" tickLine={false} />
            <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
            <Area type="monotone" dataKey="value" stroke="#34d399" fillOpacity={1} fill="url(#throughputGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
