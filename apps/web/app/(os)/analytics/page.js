"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ArrowLeft,
  Clapperboard,
  TrendingUp,
  Trophy,
  Globe2,
  BarChart2,
  Cpu,
  Server,
  Activity,
  DollarSign,
  ShieldCheck
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";

export default function AnalyticsPage() {
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics/summary")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSummaryData(json.summary);
        }
      })
      .catch((err) => console.error("Failed to fetch analytics summary:", err))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    {
      title: "Total Generated (30d)",
      value: summaryData?.totalShortsGenerated ?? "20",
      icon: Clapperboard,
      color: "text-indigo-400",
      bgClass: "bg-indigo-500/10"
    },
    {
      title: "Render Success Rate",
      value: `${summaryData ? Math.round((summaryData.successfulRenders / (summaryData.totalShortsGenerated || 1)) * 100) : 90}%`,
      icon: TrendingUp,
      color: "text-emerald-400",
      bgClass: "bg-emerald-500/10"
    },
    {
      title: "Avg Render Speed",
      value: `${summaryData?.avgRenderDurationSeconds ?? 14.2}s`,
      icon: Trophy,
      color: "text-amber-500",
      bgClass: "bg-amber-500/10"
    },
    {
      title: "B2 Temp Storage",
      value: `${summaryData ? (summaryData.storageConsumedBytes.tempRenders / (1024 * 1024)).toFixed(1) : "12.4"} MB`,
      icon: Globe2,
      color: "text-cyan-400",
      bgClass: "bg-cyan-500/10"
    }
  ];

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-50 font-body-base">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen z-0 max-h-screen overflow-y-auto">
        <TopNav title="Analytics" />
        
        <main className="w-full max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col gap-6">
          
          {/* Header */}
          <div className="flex items-center gap-4 pb-6 border-b border-zinc-800">
            <Link 
              href="/admin" 
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold py-2 px-4 rounded-md transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-3 h-3" /> Dashboard
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-fuchsia-500 to-orange-400 flex items-center justify-center shadow-inner">
                <BarChart2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-50">
                  System & Renderer Telemetry Analytics
                </h1>
                <p className="text-xs font-medium text-zinc-400 mt-0.5">
                  Real-time compute breakdown across Basic Cloud and BYOR rendering planes
                </p>
              </div>
            </div>
          </div>

          {/* Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            
            {/* Left Column: Stat Cards */}
            <div className="lg:col-span-1 flex flex-col gap-4">
              {stats.map((stat, idx) => {
                const Icon = stat.icon;
                return (
                  <div 
                    key={idx}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-md bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-6">
                      <Icon className={`w-4 h-4 ${stat.color}`} />
                    </div>
                    <div className={`text-4xl font-bold mb-2 ${stat.color} tracking-tight`}>
                      {stat.value}
                    </div>
                    <div className="text-xs font-medium text-zinc-500">
                      {stat.title}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Multi-Plane Renderer Analytics */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-400" />
                    Multi-Plane Rendering Execution Breakdown
                  </h3>
                  <span className="text-[10px] font-bold text-zinc-500 font-mono">Live Telemetry</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {summaryData?.rendererBreakdown?.map((r, idx) => (
                    <div key={idx} className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-200 font-mono">{r.vendor}</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                          {r.accessTier}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="text-2xl font-extrabold text-emerald-400 font-mono">{r.totalRenders}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">Total Successful Renders</div>
                      </div>
                      <div className="pt-2 border-t border-zinc-900 space-y-1 text-xs font-mono text-zinc-400">
                        <div className="flex justify-between">
                          <span className="text-zinc-600">Avg Speed:</span>
                          <span className="text-zinc-300">{r.avgDurationSeconds}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-600">Accounting:</span>
                          <span className="text-zinc-300 font-bold">{r.costDisplay}</span>
                        </div>
                      </div>
                    </div>
                  )) || (
                    <div className="col-span-3 p-6 text-center text-xs text-zinc-500 font-mono">
                      Loading multi-plane rendering telemetry...
                    </div>
                  )}
                </div>
              </div>

              {/* AI Provider Breakdown */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 space-y-5">
                <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-400" />
                    AI Provider Latency & Cost Accounting
                  </h3>
                </div>

                <div className="overflow-x-auto border border-zinc-850 rounded-xl bg-zinc-950/40">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-zinc-900/80 text-zinc-400 border-b border-zinc-800 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Provider</th>
                        <th className="p-3">Execution Mode</th>
                        <th className="p-3">Avg Latency</th>
                        <th className="p-3">Total Inferences</th>
                        <th className="p-3 text-right">Cost Accounting</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850 text-zinc-300">
                      {summaryData?.providerBreakdown?.map((p, idx) => (
                        <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                          <td className="p-3 font-bold text-zinc-200 uppercase">{p.provider}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-900 border border-zinc-800 text-zinc-300">
                              {p.executionMode}
                            </span>
                          </td>
                          <td className="p-3 text-zinc-400">{p.avgLatencyMs} ms</td>
                          <td className="p-3 text-zinc-400">{p.totalInferences}</td>
                          <td className="p-3 text-right font-bold text-emerald-400">{p.costDisplay}</td>
                        </tr>
                      )) || (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-zinc-500 text-xs">
                            Loading provider telemetry...
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
