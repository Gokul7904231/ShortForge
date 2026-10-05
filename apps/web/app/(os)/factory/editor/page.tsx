"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ShortForgeEditorStudio from "@/components/editor/ShortForgeEditorStudio";
import type {
  EditorCommandEnvelope,
  EditorDocument,
  EditorActor,
} from "@/factoryos/core/editor/EditorContracts";
import type { CompositionIR } from "@/factoryos/core/timeline/CompositionIR";

function sessionKey(compositionId: string) {
  return `shortforge.editor.session.${compositionId}`;
}

function getSessionId(compositionId: string): string {
  if (typeof window === "undefined") return "";
  const key = sessionKey(compositionId);
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `editor-${Date.now()}`;
  window.sessionStorage.setItem(key, next);
  return next;
}