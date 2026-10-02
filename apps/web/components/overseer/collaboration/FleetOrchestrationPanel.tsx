"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Activity, Bot, ChevronDown, ChevronUp, Play, Plus, RefreshCw, Workflow } from "lucide-react";
import type { FleetActivityRecord, MissionAutomationRecipe, AutomationRecipeStep, RecipeLaunchRecord } from "@/factoryos/core/orchestration/MissionAutomationContracts";

interface Props { accentColor?: string; }

const emptyStep = (): AutomationRecipeStep => ({ stepId: "step_1", name: "Research", ownerAgent: "research-slayer", capabilityRequired: "CAP_RESEARCH_EXEC", expectedOutputType: "RESEARCH_RESULT", executionType: "REMOTE", dependencyStepIds: [], input: {}, timeoutMs: 300000, maxRetries: 2, requiresReview: false, workerLane: "research" });

export const FleetOrchestrationPanel: React.FC<Props> = ({ accentColor = "#1769E8" }) => {
  const [recipes, setRecipes] = useState<MissionAutomationRecipe[]>([]);
  const [launches, setLaunches] = useState<RecipeLaunchRecord[]>([]);
  const [activity, setActivity] = useState<FleetActivityRecord[]>([]);
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const [recipeDescription, setRecipeDescription] = useState("");
  const [steps, setSteps] = useState<AutomationRecipeStep[]>([emptyStep()]);
  const [launching, setLaunching] = useState<string | null>(null);
  const [launchGoal, setLaunchGoal] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      setLoading(true); setError("");
      const [recipeRes, activityRes] = await Promise.all([fetch("/api/overseer/fleet/recipes", { cache: "no-store" }), fetch("/api/overseer/fleet/activity?limit=40", { cache: "no-store" })]);
      const recipeJson = await recipeRes.json(); const activityJson = await activityRes.json();
      if (!recipeRes.ok || !recipeJson.success) throw new Error(recipeJson.error || "Unable to load recipes.");
      setRecipes(recipeJson.data?.recipes || []); setLaunches(recipeJson.data?.launches || []);
      if (activityJson?.success) setActivity(activityJson.data?.items || []);
    } catch (err: any) { setError(err?.message || "Unable to load fleet orchestration."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); const interval = setInterval(() => void load(), 5000); return () => clearInterval(interval); }, []);

  const published = useMemo(() => recipes.filter((recipe) => recipe.status === "PUBLISHED"), [recipes]);

  const createRecipe = async () => {
    if (!recipeName.trim()) return;
    try {
      const res = await fetch("/api/overseer/fleet/recipes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", name: recipeName, description: recipeDescription, steps }) });
      const json = await res.json(); if (!res.ok || !json.success) throw new Error(json.error || "Unable to create recipe.");
      const created = json.data as MissionAutomationRecipe;
      await fetch(`/api/overseer/fleet/recipes/${created.recipeId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "PUBLISHED", expectedVersion: created.version }) });
      setRecipeName(""); setRecipeDescription(""); setSteps([emptyStep()]); setShowCreate(false); await load();
    } catch (err: any) { setError(err?.message || "Unable to create recipe."); }
  };

  const updateStep = (index: number, patch: Partial<AutomationRecipeStep>) => setSteps((current) => current.map((step, i) => i === index ? { ...step, ...patch } : step));
  const addStep = () => setSteps((current) => [...current, { ...emptyStep(), stepId: `step_${current.length + 1}`, name: "Next step", dependencyStepIds: current.length ? [current[current.length - 1].stepId] : [] }]);

  const launch = async (recipe: MissionAutomationRecipe) => {
    const goal = (launchGoal[recipe.recipeId] || "").trim(); if (!goal) return;
    try {
      setLaunching(recipe.recipeId);
      const res = await fetch(`/api/overseer/fleet/recipes/${recipe.recipeId}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, mode: "START_MISSION", idempotencyKey: `ui:${recipe.recipeId}:${goal.slice(0,80)}` }) });
      const json = await res.json(); if (!res.ok || !json.success) throw new Error(json.error || "Unable to launch recipe.");
      setLaunchGoal((current) => ({ ...current, [recipe.recipeId]: "" })); await load();
    } catch (err: any) { setError(err?.message || "Unable to launch recipe."); } finally { setLaunching(null); }
  };

  return (
    <section className="w-full max-w-4xl mx-auto mt-5 rounded-2xl border border-black/[0.07] dark:border-white/[0.08] bg-white/80 dark:bg-[#07101A]/90 backdrop-blur-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Workflow className="w-4 h-4" style={{ color: accentColor }} /><div><div className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">Fleet Orchestration</div><div className="text-[9px] font-mono text-[#667085]">{published.length} published recipes · {activity.length} recent activities</div></div></div>
        <button type="button" onClick={() => void load()} className="p-1.5 rounded-lg text-[#667085] hover:text-[#1769E8]"><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
      {error && <div className="mx-4 mt-3 rounded-lg border border-[#FF5A67]/20 bg-[#FF5A67]/5 px-3 py-2 text-[10px] text-[#C33A47]">{error}</div>}
      <div className="p-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex items-center justify-between"><div className="text-[9px] font-mono uppercase tracking-wider text-[#667085]">Mission recipes</div><button type="button" onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-1 rounded-lg bg-[#1769E8]/10 px-2.5 py-1.5 text-[9px] font-mono font-bold text-[#1769E8]"><Plus className="w-3 h-3" /> New recipe</button></div>
        {showCreate && <div className="mt-3 rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2"><input value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="Recipe name" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" /><input value={recipeDescription} onChange={(e) => setRecipeDescription(e.target.value)} placeholder="Description" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2.5 py-2 text-[10px] text-[#111827] dark:text-[#F5F7FA]" /></div>
          <div className="mt-3 space-y-2">{steps.map((step, index) => <div key={step.stepId} className="grid grid-cols-1 md:grid-cols-4 gap-2"><input value={step.stepId} onChange={(e) => updateStep(index, { stepId: e.target.value })} placeholder="Step ID" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px]" /><input value={step.name} onChange={(e) => updateStep(index, { name: e.target.value })} placeholder="Step name" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px]" /><input value={step.ownerAgent} onChange={(e) => updateStep(index, { ownerAgent: e.target.value })} placeholder="Owner agent" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px]" /><input value={step.capabilityRequired} onChange={(e) => updateStep(index, { capabilityRequired: e.target.value })} placeholder="Required capability" className="rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2 py-1.5 text-[9px]" /></div>)}</div>
          <div className="mt-2 flex items-center justify-between"><button type="button" onClick={addStep} className="text-[9px] font-mono text-[#667085] hover:text-[#1769E8]">+ Add step</button><button type="button" disabled={!recipeName.trim()} onClick={() => void createRecipe()} className="rounded-lg px-3 py-1.5 text-[9px] font-mono font-bold text-white disabled:opacity-40" style={{ backgroundColor: accentColor }}>Create + publish</button></div>
        </div>}
        <div className="mt-3 space-y-2">{recipes.length === 0 ? <div className="rounded-xl border border-dashed border-black/[0.08] dark:border-white/[0.08] p-5 text-center text-[10px] text-[#667085]">No recipes yet.</div> : recipes.map((recipe) => { const open = expandedRecipe === recipe.recipeId; return <div key={recipe.recipeId} className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] p-3">
          <button type="button" onClick={() => setExpandedRecipe(open ? null : recipe.recipeId)} className="w-full flex items-center justify-between gap-3 text-left"><div><div className="flex items-center gap-2"><span className="text-[11px] font-semibold text-[#111827] dark:text-[#F5F7FA]">{recipe.name}</span><span className="text-[8px] font-mono text-[#667085]">{recipe.status} · v{recipe.version}</span></div><div className="mt-1 text-[9px] text-[#667085]">{recipe.steps.length} steps · owner {recipe.ownerId}</div></div>{open ? <ChevronUp className="w-3.5 h-3.5 text-[#667085]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#667085]" />}</button>
          {open && <div className="mt-3 border-t border-black/[0.05] dark:border-white/[0.07] pt-3"><div className="space-y-1">{recipe.steps.map((step) => <div key={step.stepId} className="flex items-center justify-between gap-3 text-[9px] font-mono"><span>{step.name}</span><span className="text-[#667085]">{step.ownerAgent} · {step.capabilityRequired}</span></div>)}</div>
            {recipe.status === "PUBLISHED" && <div className="mt-3 flex gap-2"><input value={launchGoal[recipe.recipeId] || ""} onChange={(e) => setLaunchGoal((current) => ({ ...current, [recipe.recipeId]: e.target.value }))} placeholder="Mission goal for this recipe…" className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#050A12] px-2.5 py-1.5 text-[9px] text-[#111827] dark:text-[#F5F7FA]" /><button type="button" disabled={launching === recipe.recipeId || !(launchGoal[recipe.recipeId] || "").trim()} onClick={() => void launch(recipe)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-mono font-bold text-white disabled:opacity-40" style={{ backgroundColor: accentColor }}><Play className="w-3 h-3" /> {launching === recipe.recipeId ? "Launching…" : "Launch"}</button></div>}
          </div>}
        )})}</div>
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" style={{ color: accentColor }} /><div className="text-[9px] font-mono uppercase tracking-wider text-[#667085]">Fleet activity</div></div><span className="text-[8px] font-mono text-[#667085]">live projection</span></div>
        <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">{activity.length === 0 ? <div className="text-[10px] text-[#667085] py-4 text-center">Waiting for fleet events…</div> : activity.slice().reverse().map((item) => <div key={item.activityId} className="rounded-lg border border-black/[0.05] dark:border-white/[0.07] bg-black/[0.02] dark:bg-white/[0.02] px-2.5 py-2"><div className="flex items-center justify-between gap-3"><div className="min-w-0 flex items-center gap-1.5"><Bot className="w-3 h-3 text-[#667085]" /><span className="text-[9px] font-mono font-semibold truncate">{item.agentId || item.source}</span><span className="text-[8px] font-mono text-[#A8B2C1]">{item.topic}</span></div><span className="text-[8px] font-mono text-[#667085] shrink-0">{new Date(item.timestamp).toLocaleTimeString()}</span></div><div className="mt-1 text-[10px] text-[#667085] truncate">{item.summary}</div>{item.missionId && <div className="mt-1 text-[8px] font-mono text-[#A8B2C1]">mission:{item.missionId}</div>}</div>)}</div>
        {launches.length > 0 && <div className="mt-3 text-[8px] font-mono text-[#667085]">Latest launch: {launches[0].recipeId} → {launches[0].missionId || "launch failed"} · {launches[0].state}</div>}
      </div>
      <div className="px-4 py-2 border-t border-black/[0.05] dark:border-white/[0.07] text-[8px] font-mono text-[#667085]">Recipes materialize canonical MissionTasks; Launch only creates/starts the mission. Execution remains governed by Mission Work → FGC/AEF → F07.</div>
    </section>
  );
};