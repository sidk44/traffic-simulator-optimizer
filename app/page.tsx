import Link from "next/link";

const panels = [
  {
    title: "System Overview",
    description: "Latency, queues, and alerts rolling up every 10 seconds.",
    href: "/overview",
  },
  {
    title: "Deep Analytics",
    description: "Compare trend lines, identify congestion, and export insights.",
    href: "/analytics",
  },
  {
    title: "Signal Optimization",
    description: "Tune plan splits, push plans live, and track compliance.",
    href: "/optimization",
  },
  {
    title: "Scenario Simulator",
    description: "Stress-test phases against demand spikes before deploying.",
    href: "/simulator",
  },
];

export default function Home() {
  return (
    <section className="space-y-12">
      <header className="space-y-6">
        <span className="accent-pill">Corridor 7B</span>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Adaptive Traffic Command Center
          </h1>
          <p className="max-w-3xl text-lg text-slate-300">
            Stay ahead of morning peaks, orchestrate multi-intersection signal plans,
            and rehearse mitigation scenarios from one focused console.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-400">
          <div className="rounded-full border border-white/10 px-4 py-1">
            4 intersections
          </div>
          <div className="rounded-full border border-white/10 px-4 py-1">
            Cycle length 60s
          </div>
          <div className="rounded-full border border-white/10 px-4 py-1">
            Adaptive split tuning
          </div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {panels.map((panel) => (
          <Link
            key={panel.href}
            href={panel.href}
            className="card-surface flex flex-col gap-4 p-6 transition hover:border-sky-400/40"
          >
            <div className="text-sm uppercase tracking-widest text-sky-200/80">
              {panel.href.replace("/", "")} flow
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-white">{panel.title}</h2>
              <p className="mt-2 text-slate-300">{panel.description}</p>
            </div>
            <span className="text-sm font-medium text-sky-300">Open</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
