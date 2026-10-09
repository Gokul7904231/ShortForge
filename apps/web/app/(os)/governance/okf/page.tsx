"use client";
import { useEffect, useState } from "react";

type Metrics={schemaVersion:string;generatedAt:string;coverage:{active:number;criticalHigh:number;coveredCriticalHigh:number;coveragePercent:number};severityCounts:Record<string,number>;lifecycleCounts:Record<string,number>;controlStates:{sweep:string;drift:string;exceptions:string;attestation:string};authority:string};

export default function OKFGovernancePage(){
  const [data,setData]=useState<Metrics|null>(null); const [error,setError]=useState<string|null>(null);
  useEffect(()=>{ fetch("/api/governance/okf",{cache:"no-store"}).then(async r=>{const d=await r.json(); if(!r.ok) throw new Error(d.error||"Failed to load governance metrics"); setData(d);}).catch(e=>setError(e instanceof Error?e.message:"Failed to load governance metrics")); },[]);
  if(error) return <main className="mx-auto max-w-5xl px-6 py-10"><h1 className="text-3xl font-semibold text-slate-100">OKF Governance</h1><p className="mt-4 text-sm text-amber-300">{error}</p></main>;
  if(!data) return <main className="mx-auto max-w-5xl px-6 py-10"><h1 className="text-3xl font-semibold text-slate-100">OKF Governance</h1><p className="mt-4 text-sm text-slate-400">Loading control-plane state…</p></main>;
  return <main className="mx-auto max-w-6xl px-6 py-8">
    <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Governance control plane</p><h1 className="mt-2 text-3xl font-semibold text-slate-100">OKF Governance</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Machine-derived governance observability. This page reports state; it does not grant authorization or replace Guardian/F07.</p></div>
    <div className="grid gap-4 md:grid-cols-4">
      {[['Coverage',data.coverage.coveragePercent+'%'],['Active rules',String(data.coverage.active)],['Critical/High',String(data.coverage.criticalHigh)],['Bound',String(data.coverage.coveredCriticalHigh)]].map(([label,value])=><div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p></div>)}
    </div>
    <section className="mt-6 grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><h2 className="text-sm font-semibold text-slate-200">Control states</h2><div className="mt-4 space-y-3">{Object.entries(data.controlStates).map(([k,v])=><div key={k} className="flex items-center justify-between border-b border-slate-900 pb-3"><span className="text-sm text-slate-400">{k}</span><span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300">{v}</span></div>)}</div></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5"><h2 className="text-sm font-semibold text-slate-200">Lifecycle / severity</h2><div className="mt-4 grid grid-cols-2 gap-3">{Object.entries({...data.lifecycleCounts,...data.severityCounts}).map(([k,v])=><div key={k} className="rounded-xl border border-slate-900 bg-slate-900/40 p-3"><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-lg font-semibold text-slate-200">{v}</p></div>)}</div></div>
    </section>
    <p className="mt-6 text-xs text-slate-600">Authority class: {data.authority}. Generated {new Date(data.generatedAt).toLocaleString()}.</p>
  </main>;
}
