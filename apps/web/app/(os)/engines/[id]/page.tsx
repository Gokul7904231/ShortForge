"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle,
  Cpu,
  Layers3,
  Play,
  Settings2,
  Shield,
  Sliders,
  Terminal,
} from "lucide-react";
import BrandIcon from "@/components/BrandIcon";
import { useFactoryStore } from "@/lib/factory-store";
import { useOSStore } from "@/lib/os-store";
import { useAuth } from "@/lib/auth/hooks";

type ConfigField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "toggle" | "multi-select";
  section: "content" | "creative" | "media" | "delivery" | "runtime" | "lifecycle";
  defaultValue: any;
  required?: boolean;
  advanced?: boolean;
  readonly?: boolean;
  helpText?: string;
  options?: Array<{ value: string | number | boolean; label: string }>;
  min?: number;
  max?: number;
  step?: number;
};

const SECTION_LABELS: Record<ConfigField["section"], string> = {
  content: "Content",
  creative: "Creative",
  media: "Media",
  delivery: "Delivery",
  runtime: "Runtime",
  lifecycle: "Lifecycle",
};

export default function DynamicEnginePage() {
  const { user } = useAuth();
  const params = useParams();
  const engineId = params.id as string;
  const isAdmin = ["ADMIN", "OWNER", "SUPERADMIN"].includes(
    user?.role?.toUpperCase() || ""
  );
  const { events } = useFactoryStore();
  const selectedProfile = useOSStore((state) => state.selectedProfile);

  const [manifest, setManifest] = useState<any>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!engineId) return;

    fetch("/api/engines/" + engineId)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            data.error || ('Content Engine "' + engineId + '" not found in registries.')
          );
        }
        return data;
      })
      .then((data) => {
        setManifest(data.manifest);
        const next: Record<string, any> = {};
        for (const field of data.manifest?.configuration?.fields ?? []) {
          next[field.key] = field.defaultValue;
        }
        setConfig(next);
      })
      .catch((err) => setError(err.message));
  }, [engineId]);

  const fields: ConfigField[] = manifest?.configuration?.fields ?? [];

  const groupedFields = useMemo(
    () =>
      fields.reduce<Record<string, ConfigField[]>>((acc, field) => {
        (acc[field.section] ||= []).push(field);
        return acc;
      }, {}),
    [fields]
  );

  useEffect(() => {
    if (!activeJobId) return;

    const jobEvents = events
      .filter(
        (event) =>
          event.traceId === activeJobId || event.payload?.jobId === activeJobId
      )
      .sort((a, b) => a.timestamp - b.timestamp);

    const nextLogs = [
      "[0.0s] Initializing " + engineId + " engine runtime...",
      "[0.2s] [SUCCESS] ProductionSpec compile requested. Job ID: " + activeJobId,
    ];

    let finished = false;
    let failed = false;

    jobEvents.forEach((event) => {
      const offset = (
        (event.timestamp -
          (jobEvents[0]?.timestamp ?? event.timestamp)) /
        1000
      ).toFixed(1);

      if (event.type === "workflow.started") {
        nextLogs.push(
          "[" + offset + "s] Workflow pipeline started for topic: \"" +
            event.payload.topic +
            "\""
        );
      } else if (event.type === "step.started") {
        nextLogs.push(
          "[" + offset + "s] Executing stage: " +
            event.payload.stepId +
            "..."
        );
      } else if (event.type === "step.completed") {
        nextLogs.push(
          "[" + offset + "s] Stage completed: " +
            event.payload.stepId +
            " in " +
            event.payload.duration +
            "ms"
        );
      } else if (event.type === "step.failed") {
        nextLogs.push(
          "[" + offset + "s] [ERROR] Stage failed: " +
            event.payload.stepId +
            " - " +
            event.payload.error
        );
        failed = true;
      } else if (event.type === "workflow.completed") {
        nextLogs.push(
          "[" + offset + "s] [SUCCESS] Pipeline execution finished in " +
            event.payload.durationMs +
            "ms"
        );
        finished = true;
      } else if (event.type === "workflow.failed") {
        nextLogs.push(
          "[" + offset + "s] [CRITICAL_ERR] Execution failed: " +
            event.payload.error
        );
        finished = true;
        failed = true;
      }
    });

    setLogs(nextLogs);

    if (finished) {
      setRunning(false);
      if (failed) setError("Pipeline run failed. Check process logs.");
      else setSuccess("Video job completed successfully! ID: " + activeJobId);
    }
  }, [events, activeJobId, engineId]);

  function updateField(field: ConfigField, value: any) {
    if (field.readonly) return;
    setConfig((previous) => ({ ...previous, [field.key]: value }));
  }

  function toggleMulti(field: ConfigField, option: string | number | boolean) {
    const current = Array.isArray(config[field.key]) ? config[field.key] : [];
    updateField(
      field,
      current.includes(option)
        ? current.filter((item: any) => item !== option)
        : [...current, option]
    );
  }

  function renderField(field: ConfigField) {
    const value = config[field.key];

    if (field.type === "textarea") {
      return (
        <textarea
          value={value ?? ""}
          onChange={(event) => updateField(field, event.target.value)}
          className="min-h-24 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
          disabled={field.readonly}
        />
      );
    }

    if (field.type === "text") {
      return (
        <input
          value={value ?? ""}
          onChange={(event) => updateField(field, event.target.value)}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
          disabled={field.readonly}
        />
      );
    }

    if (field.type === "number") {
      return (
        <input
          type="number"
          value={value ?? ""}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(event) => updateField(field, Number(event.target.value))}
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
          disabled={field.readonly}
        />
      );
    }

    if (field.type === "toggle") {
      return (
        <button
          type="button"
          onClick={() => updateField(field, !Boolean(value))}
          className={
            "w-full rounded-lg border px-3 py-2 text-left text-xs " +
            (value
              ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
              : "border-zinc-800 bg-zinc-950 text-zinc-500")
          }
          disabled={field.readonly}
        >
          {value ? "Enabled" : "Disabled"}
        </button>
      );
    }

    if (field.type === "multi-select") {
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const active =
              Array.isArray(value) && value.includes(option.value);
            return (
              <button
                type="button"
                key={String(option.value)}
                onClick={() => toggleMulti(field, option.value)}
                className={
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all " +
                  (active
                    ? "border-blue-500/40 bg-blue-500/20 text-blue-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700")
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <select
        value={value ?? ""}
        onChange={(event) => {
          const selected = (field.options ?? []).find(
            (option) => String(option.value) === event.target.value
          );
          updateField(field, selected?.value ?? event.target.value);
        }}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-blue-500"
        disabled={field.readonly}
      >
        {(field.options ?? []).map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  async function executeJob() {
    if (!config.topic) return;

    setRunning(true);
    setSuccess("");
    setError("");
    setActiveJobId(null);
    setLogs(["[0.0s] Preparing " + engineId + " configuration..."]);

    try {
      const response = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId,
          topic: config.topic,
          style: engineId,
          contentType: engineId === "quiz" ? "QUIZ_SHORTS" : "STORY",
          renderProfile: selectedProfile,
          platforms: config.platforms ?? [],
          userConfig: config,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to queue job");
      }

      setActiveJobId(data.jobId);
      setSuccess(
        "ProductionSpec compiled and job enqueued. ID: " + data.jobId
      );
    } catch (err: any) {
      setError(err.message);
      setLogs((previous) => [
        ...previous,
        "[CRITICAL_ERR] Spawn process crashed: " + err.message,
      ]);
      setRunning(false);
    }
  }

  const isQuizLive = isAdmin || engineId === "quiz";
  const comingSoonEngine = !isQuizLive;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
            <Cpu className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-zinc-50">
                {manifest?.name ?? engineId} Engine
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {comingSoonEngine ? "COMING SOON" : "LIVE NOW"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Version {manifest?.version ?? "1.0"} · Schema{" "}
              {manifest?.configuration?.schemaVersion ?? "1.0"} · Renderer{" "}
              {manifest?.renderProfile ?? "default"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[10px] font-mono text-zinc-500">
          <Settings2 className="h-3.5 w-3.5 text-blue-400" />
          {manifest?.configuration?.source === "declared"
            ? "ENGINE-DECLARED CONFIG"
            : "COMPATIBILITY CONFIG"}
        </div>
      </div>

      {comingSoonEngine && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-semibold text-amber-300">
            This engine is not yet on the live production path. Quiz Shorts is
            the currently exposed production path.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs font-semibold text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-300">
              <Sliders className="h-4 w-4 text-blue-400" />
              Configuration
            </h3>
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
              <button
                type="button"
                className={
                  "rounded px-2 py-1 text-[10px] font-bold " +
                  (!showAdvanced
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500")
                }
                onClick={() => setShowAdvanced(false)}
              >
                BASIC
              </button>
              <button
                type="button"
                className={
                  "rounded px-2 py-1 text-[10px] font-bold " +
                  (showAdvanced
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500")
                }
                onClick={() => setShowAdvanced(true)}
              >
                ADVANCED
              </button>
            </div>
          </div>

          {Object.entries(groupedFields).map(([section, sectionFields]) => {
            const visible = sectionFields.filter(
              (field) => showAdvanced || !field.advanced
            );
            if (visible.length === 0) return null;

            return (
              <div key={section} className="space-y-3">
                <div className="flex items-center gap-2 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  <Layers3 className="h-3.5 w-3.5" />
                  {SECTION_LABELS[section as ConfigField["section"]]}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {visible.map((field) => (
                    <div
                      key={field.key}
                      className={
                        field.type === "textarea" ||
                        field.type === "multi-select" ||
                        field.key === "topic"
                          ? "sm:col-span-2"
                          : ""
                      }
                    >
                      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono">
                        {field.label}
                        {field.required ? " *" : ""}
                      </label>
                      {renderField(field)}
                      {field.helpText && (
                        <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                          {field.helpText}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <button
            onClick={executeJob}
            disabled={running || !config.topic}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 py-2.5 text-xs font-bold text-zinc-950 transition-all hover:bg-blue-600 active:scale-[0.99] disabled:opacity-50"
          >
            {running ? (
              <Play className="h-4 w-4 animate-pulse" />
            ) : (
              <BrandIcon className="h-4 w-4" />
            )}
            {running ? "Compiling / Running..." : "Generate Video"}
          </button>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <div className="flex h-[320px] flex-col rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h3 className="flex shrink-0 items-center gap-2 border-b border-zinc-800 pb-3 text-xs font-bold uppercase tracking-widest text-zinc-300">
              <Terminal className="h-4 w-4 text-blue-400" />
              Live Process Feed
            </h3>
            <div className="terminal-scroll mt-4 flex-1 space-y-1 overflow-y-auto rounded-lg border border-zinc-800/60 bg-zinc-950 p-4 font-mono text-[10px] leading-relaxed text-zinc-400">
              {logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))}
              {running && (
                <div className="mt-2 flex items-center gap-2 animate-pulse text-blue-400">
                  <span className="inline-block h-3 w-1.5 animate-pulse bg-blue-400" />
                  Running engine logic...
                </div>
              )}
              {logs.length === 0 && (
                <div className="text-zinc-600">Awaiting job launch...</div>
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-xs">
            <h3 className="flex items-center gap-2 border-b border-zinc-800 pb-3 text-xs font-bold uppercase tracking-widest text-zinc-300">
              <Shield className="h-4 w-4 text-blue-400" />
              Engine Manifest
            </h3>

            <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-zinc-600">Config Fields</div>
                <div className="mt-1 text-zinc-200">{fields.length}</div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-zinc-600">Config Source</div>
                <div className="mt-1 text-zinc-200">
                  {manifest?.configuration?.source ?? "unknown"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-zinc-600">Research Contract</div>
                <div className="mt-1 text-zinc-200">
                  {manifest?.contracts?.research?.required
                    ? "required"
                    : "optional"}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-zinc-600">Verification</div>
                <div className="mt-1 text-zinc-200">
                  {manifest?.contracts?.verification?.requiredChecks?.length ??
                    0}{" "}
                  checks
                </div>
              </div>
              <div className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-zinc-600">Renderer Profile</div>
                <div className="mt-1 text-zinc-200">
                  {manifest?.contracts?.render?.profile ??
                    manifest?.renderProfile ??
                    "default"}
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-3 font-mono text-[10px] text-zinc-400">
              <div className="flex justify-between gap-4">
                <span className="text-zinc-600">Hook Prompt</span>
                <span>
                  {manifest?.hookPromptSlug ??
                    manifest?.hookPrompt ??
                    "not declared"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-zinc-600">Critic Rules</span>
                <span>
                  {manifest?.contracts?.verification?.criticRules ??
                    manifest?.criticRules ??
                    "not declared"}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-[10px] text-zinc-500">
            <div className="flex items-start gap-2">
              <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
              <div>
                <div className="font-semibold text-zinc-300">
                  Configuration boundary
                </div>
                <p className="mt-1 leading-relaxed">
                  This screen edits creator intent only. The server recompiles
                  it into an immutable ProductionSpec. It cannot grant worker
                  capabilities, bypass .okf policy, override Guardian or Slayer
                  decisions, or bypass F07.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
