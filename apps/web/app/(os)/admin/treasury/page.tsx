"use client";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, AlertTriangle, CheckCircle2, Coins, Gauge, ShieldAlert } from "lucide-react";

type Snapshot = {
  generatedAt: string; windowStart: string; windowEnd: string;
  unitMetrics: { settledCostUsd: number; actualTokens: number; reservationUtilization: number; releaseRatio: number; successfulExecutions: number; verifiedExecutions: number; deniedCommands: number; breachedReservations: number; costPer1kTokensUsd?: number; };
  spendDeltaPct: number; activeReservedUsd: number; activeReservedCapacityUnits: number;
  signals: Array<{ code: string; severity: "INFO" | "WARNING" | "CRITICAL"; message: string }>;
  recommendations: Array<{ kind: string; priority: "LOW" | "MEDIUM" | "HIGH"; rationale: string; actionBoundary: string }>;
  providers: Array<{ providerId: string; modelId?: string; invocations: number; settledCostUsd: number; costPer1kTokensUsd?: number; }>;
};

function money(value?: number) { return Number.isFinite(value) ? "$" + Number(value).toFixed(4) : "—"; }
function percent(value: number) { return (value * 100).toFixed(1) + "%"; }

export default function TreasuryEconomicsPage() {
  const query = useQuery<{ snapshot: Snapshot }>({
    queryKey: ["treasury-economic-intelligence", 24],
    queryFn: async () => {
      const r = await fetch("/api/admin/treasury/economics?hours=24");
      if (!r.ok) throw new Error((await r.json()).error || "Treasury intelligence unavailable");
      return r.json();
    },
    refetchInterval: 60000,
  });

  if (query.isLoading) return <div className="p-8 text-sm text-zinc-400">Loading Treasury economics…</div>;
  if (query.error || !query.data?.snapshot) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">{query.error instanceof Error ? query.error.message : "Treasury intelligence unavailable."}</div>;

  const s = query.data.snapshot;
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-zinc-900 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-emerald-400"><BrainCircuit className="h-4 w-4" />Treasury Economic Intelligence</div>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100">Economic command visibility</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">Read-only analysis of measured spend, reservation efficiency, capacity pressure, anomalies, and route economics.</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">Recommendations are advisory. Treasury Kernel remains the admission authority.</div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Settled spend", money(s.unitMetrics.settledCostUsd), "24h measured"],
          ["Cost / 1k tokens", money(s.unitMetrics.costPer1kTokensUsd), s.unitMetrics.actualTokens.toLocaleString() + " tokens"],
          ["Reservation utilization", percent(s.unitMetrics.reservationUtilization), "lower means more unused hold"],
          ["Verified executions", String(s.unitMetrics.verifiedExecutions), s.unitMetrics.successfulExecutions + " successful"],
        ].map(([label, value, hint], i) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500"><span>{label}</span>{i === 0 ? <Coins className="h-4 w-4" /> : i === 2 ? <Gauge className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div>
            <div className="mt-3 text-xl font-semibold text-zinc-100">{value}</div>
            <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70">
          <div className="border-b border-zinc-800 px-5 py-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Observed route economics</div><div className="mt-1 text-[11px] text-zinc-600">Only settled Treasury evidence is shown.</div></div>
          <div className="divide-y divide-zinc-900">
            {s.providers.length === 0 ? <div className="px-5 py-8 text-sm text-zinc-500">No attributable provider/model settlement events.</div> : s.providers.map((p) => <div key={p.providerId + ":" + p.modelId} className="grid grid-cols-[1.4fr_0.7fr_0.8fr_0.8fr] gap-3 px-5 py-4 text-xs"><div><div className="font-medium text-zinc-200">{p.providerId}</div><div className="text-[10px] text-zinc-500">{p.modelId || "unspecified"}</div></div><div className="text-zinc-400">{p.invocations} calls</div><div className="text-zinc-400">{money(p.settledCostUsd)}</div><div className="text-right text-zinc-300">{money(p.costPer1kTokensUsd)}/1k</div></div>)}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/70">
          <div className="border-b border-zinc-800 px-5 py-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Economic signals</div><div className="mt-1 text-[11px] text-zinc-600">Deterministic observations from the Treasury ledger.</div></div>
          <div className="space-y-3 p-5">{s.signals.length === 0 ? <div className="flex items-center gap-2 text-sm text-zinc-500"><CheckCircle2 className="h-4 w-4" />No signals above threshold.</div> : s.signals.map((signal) => <div key={signal.code} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-400">{signal.severity === "CRITICAL" ? <ShieldAlert className="h-4 w-4 text-red-400" /> : <AlertTriangle className="h-4 w-4 text-amber-400" />}{signal.severity}</div><div className="mt-2 text-xs leading-relaxed text-zinc-300">{signal.message}</div></div>)}</div>
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/70">
        <div className="border-b border-zinc-800 px-5 py-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Advisory recommendations</div><div className="mt-1 text-[11px] text-zinc-600">No recommendation here can mutate Treasury state.</div></div>
        <div className="grid gap-3 p-5 md:grid-cols-2">{s.recommendations.length === 0 ? <div className="text-sm text-zinc-500">No recommendations in this window.</div> : s.recommendations.map((r, i) => <div key={r.kind + ":" + i} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300">{r.priority} · {r.kind}</span><span className="text-[10px] text-zinc-600">{r.actionBoundary}</span></div><p className="mt-2 text-xs leading-relaxed text-zinc-300">{r.rationale}</p></div>)}</div>
      </section>

      <div className="flex justify-between text-[10px] text-zinc-600"><span>{new Date(s.windowStart).toLocaleString()} → {new Date(s.windowEnd).toLocaleString()}</span><span>Spend delta: {s.spendDeltaPct.toFixed(1)}%</span></div>
    </div>
  );
}