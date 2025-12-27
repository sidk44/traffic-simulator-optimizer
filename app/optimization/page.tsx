"use client";

import { useRealtimeTraffic } from "@/lib/useRealtimeTraffic";
import { useState } from "react";
import { IntersectionId, SignalPlan } from "@/lib/types";

export default function OptimizationPage() {
  const { signalPlan } = useRealtimeTraffic();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<"optimize" | "reset" | null>(null);
  const [applying, setApplying] = useState(false);
  const [modal, setModal] = useState<{ id: IntersectionId; ns: number } | null>(null);
  const [modalNS, setModalNS] = useState(30);
  const [pendingPlan, setPendingPlan] = useState<SignalPlan | null>(null);

  async function runOptimizer() {
    setLoading("optimize");
    setStatus(null);
    try {
      const res = await fetch("/api/optimize", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Optimizer failed");
      }
      setPendingPlan(data.plan ?? null);
      setStatus("✓ Optimization complete. Review the suggested plan below.");
    } catch (error) {
      setStatus(`✗ ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  async function applyOptimizedPlan() {
    setApplying(true);
    setStatus(null);
    try {
      const res = await fetch("/api/optimize/apply", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Apply failed");
      }
      setPendingPlan(null);
      setStatus("✓ Optimized plan applied and broadcasting via SSE.");
    } catch (error) {
      setStatus(`✗ ${(error as Error).message}`);
    } finally {
      setApplying(false);
    }
  }

  function discardPendingPlan() {
    setPendingPlan(null);
    setStatus("✓ Discarded pending optimization.");
  }

  async function resetBaseline() {
    setLoading("reset");
    setStatus(null);
    try {
      const res = await fetch("/api/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Reset failed");
      }
      setStatus("✓ Plan reset to 30/30 baseline.");
    } catch (error) {
      setStatus(`✗ ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  }

  async function applyStageAdjustment() {
    if (!modal) return;
    setStatus(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intersectionId: modal.id, greenNS: modalNS }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Plan update failed");
      }
      setStatus(`✓ Stage adjustment applied to ${modal.id}.`);
      setModal(null);
    } catch (error) {
      setStatus(`✗ ${(error as Error).message}`);
    }
  }

  return (
    <section className="space-y-8">
      <header className="space-y-4">
        <p className="accent-pill">Plan Authoring</p>
        <div>
          <h1 className="text-3xl font-semibold text-white">Optimization</h1>
          <p className="mt-2 max-w-3xl text-slate-300">
            Review the active cycle splits and prep simulated tweaks before publishing a
            new plan to the field units.
          </p>
        </div>
      </header>

      {status && (
        <div className={`card-surface border-l-4 p-4 text-sm ${
          status.startsWith("✓") 
            ? "border-l-emerald-400 text-emerald-200"
            : "border-l-red-400 text-red-200"
        }`}>
          {status}
        </div>
      )}

      {pendingPlan && pendingPlan.meta && (
        <div className="card-surface space-y-4 border-2 border-sky-400/40 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-sky-400">⏳ Pending Optimization Plan</p>
              <p className="text-xl font-semibold text-white">Strategy: {pendingPlan.meta.strategy}</p>
              <p className="text-xs text-slate-500">Generated {new Date(pendingPlan.meta.generatedAt).toLocaleTimeString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Estimated Improvement</p>
              <p className={`text-2xl font-semibold ${pendingPlan.meta.objective < pendingPlan.meta.baselineObjective ? "text-emerald-300" : "text-amber-300"}`}>
                {(() => {
                  const base = pendingPlan.meta.baselineObjective;
                  const opt = pendingPlan.meta.objective;
                  if (base <= 0) return "N/A";
                  const improvement = ((base - opt) / base) * 100;
                  return `${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)}%`;
                })()}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(pendingPlan.splits).map(([intersectionId, split]) => (
              <div key={intersectionId} className="rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
                <p className="text-sm font-medium text-sky-300">{intersectionId}</p>
                <p className="text-lg font-semibold text-white">NS {split.ns}s · EW {split.ew}s</p>
                <p className="text-xs text-slate-500">
                  {split.ns !== 30 ? (split.ns > 30 ? `↑ NS +${split.ns - 30}s` : `↓ NS ${split.ns - 30}s`) : "No change"}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={applyOptimizedPlan}
              disabled={applying}
              className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {applying ? "Applying..." : "✓ Apply Optimized Plan"}
            </button>
            <button
              onClick={discardPendingPlan}
              disabled={applying}
              className="rounded-lg border border-white/10 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-white/30 hover:text-white"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <button
          onClick={runOptimizer}
          disabled={loading !== null}
          className="card-surface border border-sky-400/30 px-6 py-4 text-left transition hover:bg-sky-400/5 disabled:opacity-50"
        >
          <p className="text-sm text-sky-300">Performance Mode</p>
          <p className="mt-2 font-semibold text-white">Run optimizer</p>
          <p className="mt-1 text-xs text-slate-400">
            {loading === "optimize" ? "Computing..." : "Find optimal splits using AFAPC + MPC-lite"}
          </p>
        </button>

        <button
          onClick={resetBaseline}
          disabled={loading !== null}
          className="card-surface border border-slate-500/30 px-6 py-4 text-left transition hover:bg-slate-500/5 disabled:opacity-50"
        >
          <p className="text-sm text-slate-400">Baseline</p>
          <p className="mt-2 font-semibold text-white">Reset to 30/30</p>
          <p className="mt-1 text-xs text-slate-400">
            {loading === "reset" ? "Resetting..." : "Clear optimizations and return to equal splits"}
          </p>
        </button>
      </div>

      <div className="card-surface p-6">
        <p className="text-sm text-slate-400">Plan parameters</p>
        <dl className="mt-4 grid gap-6 text-white sm:grid-cols-3">
          <div>
            <dt className="text-sm text-slate-400">Cycle</dt>
            <dd className="mt-1 text-3xl font-semibold">{signalPlan.cycle}s</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Min Green</dt>
            <dd className="mt-1 text-3xl font-semibold">{signalPlan.minGreen}s</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-400">Max Green</dt>
            <dd className="mt-1 text-3xl font-semibold">{signalPlan.maxGreen}s</dd>
          </div>
        </dl>
        {signalPlan.meta && (
          <div className="mt-6 border-t border-white/10 pt-6">
            <p className="text-sm text-slate-400">Metadata</p>
            <p className="mt-2 text-xs text-slate-500">{signalPlan.meta.strategy} · {signalPlan.meta.generatedAt}</p>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(signalPlan.splits).map(([intersectionId, split]) => (
          <div key={intersectionId} className="card-surface p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{intersectionId}</p>
                <p className="text-lg text-white">Configured splits</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
                {split.ns + split.ew}s
              </span>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <p className="text-xs text-slate-400">North / South</p>
                <div className="mt-2 h-3 w-full rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-sky-400" style={{ width: `${(split.ns / signalPlan.cycle) * 100}%` }} />
                </div>
                <p className="mt-2 text-sm text-white">{split.ns}s green</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">East / West</p>
                <div className="mt-2 h-3 w-full rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${(split.ew / signalPlan.cycle) * 100}%` }} />
                </div>
                <p className="mt-2 text-sm text-white">{split.ew}s green</p>
              </div>
            </div>
            <button
              onClick={() => {
                setModal({ id: intersectionId as IntersectionId, ns: split.ns });
                setModalNS(split.ns);
              }}
              className="mt-6 w-full rounded-lg border border-white/10 bg-white/10 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/20"
            >
              Stage adjustment
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 z-50">
          <div className="card-surface max-w-md w-full p-6 space-y-4">
            <h2 className="text-xl font-semibold text-white">Adjust {modal.id}</h2>
            <div>
              <label className="text-sm text-slate-400">NS Green: {modalNS}s</label>
              <input
                type="range"
                min="10"
                max="50"
                value={modalNS}
                onChange={(e) => setModalNS(Number(e.target.value))}
                className="mt-2 w-full"
              />
              <p className="mt-2 text-sm text-slate-400">EW Green: {60 - modalNS}s</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setModal(null)}
                className="flex-1 rounded bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Cancel
              </button>
              <button
                onClick={applyStageAdjustment}
                className="flex-1 rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-600"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
