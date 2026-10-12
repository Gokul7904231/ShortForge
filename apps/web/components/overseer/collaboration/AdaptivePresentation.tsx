"use client";

import React from "react";
import { AlertCircle, Info, TriangleAlert } from "lucide-react";
import { resolveAdaptivePresentation } from "@/factoryos/core/ui/AdaptivePresentationContracts";

export interface AdaptivePresentationProps {
  readonly payload: unknown;
}

/**
 * Renders only the fixed, schema-approved presentation vocabulary.
 * Invalid or model-produced unknown payloads are rejected; no eval/innerHTML.
 */
export function AdaptivePresentation({ payload }: AdaptivePresentationProps) {
  const result = resolveAdaptivePresentation(payload);

  if (!result.success) {
    return (
      <div role="status" className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
        This presentation was rejected because its data did not match an approved UI contract.
      </div>
    );
  }

  const presentation = result.presentation;

  if (presentation.kind === "summary") {
    return (
      <section className="rounded-xl border border-black/[0.07] p-3 dark:border-white/[0.08]">
        <h3 className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">{presentation.title}</h3>
        <p className="mt-1 text-xs text-[#667085]">{presentation.summary}</p>
      </section>
    );
  }

  if (presentation.kind === "metric-grid") {
    return (
      <section aria-label={presentation.title} className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[#667085]">{presentation.title}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {presentation.items.map((item) => (
            <div key={item.label} className="rounded-xl border border-black/[0.07] p-3 dark:border-white/[0.08]">
              <div className="text-[9px] uppercase tracking-wide text-[#667085]">{item.label}</div>
              <div className="mt-1 break-words text-xl font-bold tabular-nums text-[#111827] dark:text-[#F5F7FA]">{item.value}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const tone = presentation.severity === "error"
    ? "border-rose-500/20 bg-rose-500/5 text-rose-600"
    : presentation.severity === "warning"
      ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      : "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-300";
  const Icon = presentation.severity === "error"
    ? AlertCircle
    : presentation.severity === "warning"
      ? TriangleAlert
      : Info;

  return (
    <section role={presentation.severity === "error" ? "alert" : "status"} className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2 text-xs font-bold"><Icon className="h-4 w-4" />{presentation.title}</div>
      <p className="mt-1 text-xs">{presentation.message}</p>
    </section>
  );
}
