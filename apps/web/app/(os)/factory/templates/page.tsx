"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  FileCode, Search, Play, Copy, Eye, Plus, Trash2, 
  ArrowUpRight, Share2, X, Download, Upload, Cpu, CheckCircle2,
  AlertTriangle, ShieldAlert, Sparkles, Layers, Video, Clock
} from "lucide-react";
import NewTemplateForm from "@/components/NewTemplateForm";
import WebsiteModal from "@/components/WebsiteModal";
import { useAuth } from "@/lib/auth/hooks";
import { isAdminUser } from "@/lib/auth/roles";

interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  formatFamily?: string;
  description: string;
  tags: string[];
  stepCount: number;
  renderProfile?: string;
  version: string;
  prompt: string;
  variables: string;
  isOfficial?: boolean;
  isCommunity?: boolean;
  capabilityStatus?: "READY" | "DEGRADED" | "BETA" | "BLOCKED";
  statusReason?: string;
  storyStructure?: Array<{
    stepName: string;
    purpose: string;
    shotRecipeId: string;
    recommendedDurationSeconds: number;
  }>;
  outputPolicy?: {
    width: number;
    height: number;
    fps: number;
    targetDurationRange: [number, number];
  };
}

export default function TemplatesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = isAdminUser(user?.role);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"official" | "my" | "community">("official");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Inspect / Details Modal state
  const [inspectTemplate, setInspectTemplate] = useState<WorkflowTemplate | null>(null);

  // Run Modal state
  const [runningTemplate, setRunningTemplate] = useState<WorkflowTemplate | null>(null);
  const [runTopic, setRunTopic] = useState("");
  const [runSuccess, setRunSuccess] = useState("");
  const [runError, setRunError] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  // Fetch templates from API
  const { data: templatesData, isLoading } = useQuery<{ success: boolean; templates: WorkflowTemplate[] }>({
    queryKey: ["workflow-templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    }
  });

  // Fetch Local Renderer Engine Health (Admin only)
  const { data: rendererHealthData } = useQuery<{ success: boolean; health: any }>({
    queryKey: ["admin-renderer-health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/renderer");
      if (!res.ok) return { success: false, health: { installed: false, allHealthy: false } };
      return res.json();
    },
    enabled: !!isAdmin,
    refetchInterval: 30000
  });

  const templates = templatesData?.templates ?? [];
  const rendererHealth = rendererHealthData?.health;

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/templates?id=${id}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete template");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow-templates"] });
    }
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const confirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleExport = (tpl: WorkflowTemplate) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tpl, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${tpl.id}_template.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleExecuteRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runningTemplate || !runTopic.trim()) return;
    setIsExecuting(true);
    setRunSuccess("");
    setRunError("");

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: runTopic.trim(),
          style: runningTemplate.id,
          templateId: runningTemplate.id,
          contentType: runningTemplate.category === "QUIZ" ? "QUIZ_SHORTS" : "STORY",
          renderProfile: "FAST_SHORTS"
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enqueue generation job");
      setRunSuccess(`Job successfully enqueued! ID: ${data.jobId}`);
      setRunTopic("");
    } catch (err: any) {
      setRunError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Distinct categories
  const categories = ["ALL", ...Array.from(new Set(templates.map(t => t.category).filter(Boolean)))];

  const filtered = templates.filter((t) => {
    const matchesSearch = 
      t.name.toLowerCase().includes(search.toLowerCase()) || 
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      (t.formatFamily && t.formatFamily.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory = selectedCategory === "ALL" || t.category === selectedCategory;

    if (activeTab === "official") return matchesSearch && matchesCategory && t.isOfficial;
    if (activeTab === "community") return matchesSearch && matchesCategory && t.isCommunity;
    return matchesSearch && matchesCategory && !t.isOfficial && !t.isCommunity;
  });

  const renderStatusBadge = (status?: string) => {
    switch (status) {
      case "READY":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-2.5 h-2.5" /> READY
          </span>
        );
      case "DEGRADED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-2.5 h-2.5" /> DEGRADED
          </span>
        );
      case "BLOCKED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/30">
            <ShieldAlert className="w-2.5 h-2.5" /> BLOCKED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-2.5 h-2.5" /> BETA
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Engine Status Banner — Only for ADMIN / OWNER operators */}
      {isAdmin && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg border ${rendererHealth?.allHealthy ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400'}`}>
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-100">Local Render Engine</span>
                {rendererHealth?.allHealthy ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300">
                    v{rendererHealth.version || "0.1.0"} OPERATIONAL
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300">
                    CONNECTING
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Deterministic frame clock (t = frame/fps) • 9:16 vertical composition • Audio-first timeline sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-zinc-400">
            <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded">
              FFmpeg: {rendererHealth?.ffmpegVersion ? "OK" : "Detecting"}
            </span>
            <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded">
              Python: {rendererHealth?.pythonVersion || "3.13"}
            </span>
            <span className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded">
              Pillow: {rendererHealth?.pillowVersion || "11.3"}
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-900">
        <div>
          <h2 className="text-xl font-bold text-zinc-50 tracking-tight">
            {isAdmin ? "FactoryOS Creative Templates" : "ShortForge Video Templates"}
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            {isAdmin 
              ? "Production-qualified story structures composed of reusable shot recipes, 9:16 safe areas, and provider adapters."
              : "Choose a story template, enter your topic, and generate high-engagement vertical video shorts."}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewTemplateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors shrink-0 shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-3.5 h-3.5" /> Custom Template Builder
          </button>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-zinc-900 gap-4 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("official")}
          className={`pb-2 px-1 border-b-2 transition-all ${activeTab === "official" ? "border-indigo-500 text-indigo-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
        >
          Official Marketplace ({templates.filter(t => t.isOfficial).length})
        </button>
        <button
          onClick={() => setActiveTab("my")}
          className={`pb-2 px-1 border-b-2 transition-all ${activeTab === "my" ? "border-indigo-500 text-indigo-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
        >
          My Custom Templates ({templates.filter(t => !t.isOfficial && !t.isCommunity).length})
        </button>
        <button
          onClick={() => setActiveTab("community")}
          className={`pb-2 px-1 border-b-2 transition-all ${activeTab === "community" ? "border-indigo-500 text-indigo-400" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}
        >
          Community Shared ({templates.filter(t => t.isCommunity).length})
        </button>
      </div>

      {/* Search and Category Filter Pills */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search templates by name, category, or format family…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
          />
        </div>

        {/* Categories scrollable pill row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full font-medium transition-all shrink-0 ${
                selectedCategory === cat 
                  ? "bg-zinc-100 text-zinc-950 font-bold" 
                  : "bg-zinc-900/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        /* Grid List */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((tpl) => (
            <div 
              key={tpl.id} 
              className="group rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900/40 transition-all shadow-sm"
            >
              <div className="space-y-3.5">
                {/* Header Row */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-zinc-100 group-hover:text-white transition-colors">
                        {tpl.name}
                      </h3>
                      {renderStatusBadge(tpl.capabilityStatus)}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500 mt-1">
                      <span className="text-indigo-400 font-medium">{tpl.category}</span>
                      <span>•</span>
                      <span>{tpl.formatFamily || "Vertical Short"}</span>
                      <span>•</span>
                      <span>v{tpl.version}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => setInspectTemplate(tpl)}
                      className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Inspect Story Structure & Shot Recipes"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleExport(tpl)}
                      className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Export Definition"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    {!tpl.isOfficial && !tpl.isCommunity && (
                      <button 
                        onClick={() => setDeleteConfirmId(tpl.id)}
                        className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                  {tpl.description}
                </p>

                {/* Specs Badge Bar */}
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-zinc-400 pt-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    <Video className="w-2.5 h-2.5 text-zinc-500" /> 9:16 (1080x1920)
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    <Clock className="w-2.5 h-2.5 text-zinc-500" />
                    {tpl.outputPolicy ? `${tpl.outputPolicy.targetDurationRange[0]}-${tpl.outputPolicy.targetDurationRange[1]}s` : "30-50s"}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                    <Layers className="w-2.5 h-2.5 text-zinc-500" /> {tpl.stepCount} Beats
                  </span>
                </div>

                {/* Shot Recipe Pills */}
                {tpl.storyStructure && tpl.storyStructure.length > 0 && (
                  <div className="pt-2 border-t border-zinc-900">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block mb-1.5">Shot Recipe Flow:</span>
                    <div className="flex flex-wrap gap-1">
                      {tpl.storyStructure.map((step, idx) => (
                        <span 
                          key={idx} 
                          className="px-1.5 py-0.5 bg-zinc-900/90 text-zinc-300 border border-zinc-800 rounded text-[9px] font-mono"
                        >
                          {step.shotRecipeId}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <div className="pt-4 mt-4 border-t border-zinc-900 flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[140px]">
                  ID: {tpl.id}
                </span>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/create?template=${encodeURIComponent(tpl.id)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition-colors"
                  >
                    Use Template <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => setRunningTemplate(tpl)}
                    className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 border border-indigo-500/30 transition-colors"
                    title="Quick Run"
                  >
                    <Play className="w-3.5 h-3.5 fill-indigo-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-zinc-850 rounded-xl">
          <FileCode className="w-8 h-8 text-zinc-700 mb-2" />
          <p className="text-zinc-500 text-xs">No matching templates found for selected filter.</p>
        </div>
      )}

      {/* Inspect / Story Structure Modal */}
      {inspectTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-xs">
          <div 
            onClick={() => setInspectTemplate(null)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in cursor-pointer" 
          />
          <div className="relative z-10 w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col animate-modal-scale-in max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-850 bg-zinc-900/50">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">{inspectTemplate.name}</h3>
                  <span className="text-[10px] font-mono text-zinc-400">ID: {inspectTemplate.id} • Category: {inspectTemplate.category}</span>
                </div>
              </div>
              <button 
                onClick={() => setInspectTemplate(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-850 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <h4 className="text-[10px] font-mono uppercase font-bold text-zinc-400 tracking-wider mb-1">Description</h4>
                <p className="text-xs text-zinc-300 leading-relaxed">{inspectTemplate.description}</p>
              </div>

              {inspectTemplate.storyStructure && (
                <div>
                  <h4 className="text-[10px] font-mono uppercase font-bold text-zinc-400 tracking-wider mb-2">
                    Story Structure & Shot Recipe Pipeline ({inspectTemplate.storyStructure.length} Beats)
                  </h4>
                  <div className="space-y-2 border border-zinc-800 rounded-xl p-3 bg-zinc-900/30">
                    {inspectTemplate.storyStructure.map((step, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-4 p-2 rounded-lg bg-zinc-900/60 border border-zinc-850/60">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-indigo-400">Beat {idx + 1}: {step.stepName}</span>
                            <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[9px] font-mono text-zinc-300">{step.shotRecipeId}</span>
                          </div>
                          <p className="text-[10px] text-zinc-400">{step.purpose}</p>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500 shrink-0">~{step.recommendedDurationSeconds}s</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {inspectTemplate.prompt && (
                <div>
                  <h4 className="text-[10px] font-mono uppercase font-bold text-zinc-400 tracking-wider mb-1">AI Prompt Seed</h4>
                  <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-[11px] font-mono text-zinc-300 leading-relaxed">
                    {inspectTemplate.prompt}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-850 bg-zinc-900/40 flex items-center justify-end gap-2">
              <button
                onClick={() => setInspectTemplate(null)}
                className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-xs font-semibold text-zinc-400 transition-colors"
              >
                Close
              </button>
              <Link
                href={`/create?template=${encodeURIComponent(inspectTemplate.id)}`}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                Use in Production
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Quick Run Modal */}
      {runningTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-xs">
          <div 
            onClick={() => { setRunningTemplate(null); setRunSuccess(""); setRunError(""); }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in cursor-pointer" 
          />
          <div className="relative z-10 w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col animate-modal-scale-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-850 bg-zinc-950/40">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-zinc-200">Run Template: {runningTemplate.name}</h3>
              </div>
              <button 
                onClick={() => { setRunningTemplate(null); setRunSuccess(""); setRunError(""); }}
                className="p-1 rounded hover:bg-zinc-850 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteRun} className="p-5 space-y-4">
              {runSuccess && <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 text-emerald-400 rounded-lg">{runSuccess}</div>}
              {runError && <div className="p-3 bg-red-950/30 border border-red-900/50 text-red-400 rounded-lg">{runError}</div>}
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Target Topic</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 3 Mind-Blowing Facts About Black Holes"
                  value={runTopic}
                  onChange={(e) => setRunTopic(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="pt-4 border-t border-zinc-850 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setRunningTemplate(null); setRunSuccess(""); setRunError(""); }}
                  className="px-4 py-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-xs text-zinc-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isExecuting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isExecuting ? "Executing..." : "Run Job"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNewTemplateModal && (
        <NewTemplateForm isModal={true} onDismiss={() => setShowNewTemplateModal(false)} />
      )}

      <WebsiteModal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Custom Template?"
        description="Are you sure you want to delete this custom template? This action cannot be undone."
        icon="warning"
        variant="danger"
        confirmText="Delete Template"
        cancelText="Cancel"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
