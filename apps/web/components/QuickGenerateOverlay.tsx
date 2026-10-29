"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Play,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  FileText,
  Video,
  Film,
  Layers,
  HelpCircle,
  Clock,
  HardDrive,
  Trash2,
  Globe,
  Sliders,
  Edit3,
  Check,
  Plus,
  ShieldCheck,
  ChevronDown,
  Share2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useOSStore } from "@/lib/os-store";
import { useAuth } from "@/lib/auth/hooks";
import BrandIcon from "@/components/BrandIcon";
import { mapValidationError } from "@/lib/creator/error-map";
import { describeDelivery } from "@/lib/presentation/JobStatusProjection";
import { QuizOrchestrator } from "@/lib/quiz/QuizOrchestrator";

const SAMPLE_TOPICS = [
  "Artificial Intelligence & Computing Milestones",
  "Quantum Computing Breakthroughs",
  "Fascinating Facts About Cats",
  "History of the Internet",
  "Deep Space Exploration & Black Holes",
];

const GEO_COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "JP", name: "Japan", flag: "🇯🇵" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "FR", name: "France", flag: "🇫🇷" },
  { code: "DE", name: "Germany", flag: "🇩🇪" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
  { code: "AU", name: "Australia", flag: "🇦🇺" },
  { code: "BR", name: "Brazil", flag: "🇧🇷" },
  { code: "IT", name: "Italy", flag: "🇮🇹" },
  { code: "ES", name: "Spain", flag: "🇪🇸" },
];

export type CreateStep = "IDEA" | "REVIEW" | "RENDER" | "READY";

const STEP_NUM: Record<CreateStep, number> = { IDEA: 1, REVIEW: 2, RENDER: 3, READY: 4 };
const NUM_STEP: Record<number, CreateStep> = { 1: "IDEA", 2: "REVIEW", 3: "RENDER", 4: "READY" };
const STORAGE_KEY_BASE = "factoryos:create:draft";
const STORAGE_KEY_LEGACY = STORAGE_KEY_BASE;
function storageKeyFor(uid?: string | null): string {
  return uid ? `${STORAGE_KEY_BASE}:${uid}` : STORAGE_KEY_LEGACY;
}
function clearLegacyAndScopedStorage(uid?: string | null): void {
  try {
    localStorage.removeItem(STORAGE_KEY_LEGACY);
    if (uid) localStorage.removeItem(storageKeyFor(uid));
    // Defense-in-depth: purge any stale per-user draft keys from previous sessions
    // (localStorage is browser-scoped; a new login on same device must not inherit prior user's draft)
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${STORAGE_KEY_BASE}:`)) {
        if (!uid || k !== storageKeyFor(uid)) toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}

function humanStageLabel(status?: string, detailedStatus?: string): string {
  const s = (detailedStatus || status || "").toLowerCase();
  if (s.includes("completed") || s.includes("ready")) return "Ready";
  if (s.includes("upload")) return "Uploading";
  if (s.includes("validat")) return "Validating";
  if (s.includes("running") || s.includes("render")) return "Rendering";
  if (s.includes("claimed") || s.includes("generat")) return "Generating assets";
  if (s.includes("queued") || s.includes("prepar")) return "Preparing your video";
  if (s.includes("retry")) return "Retrying";
  if (s.includes("failed")) return "Failed — retryable";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Queued";
}

export default function QuickGenerateOverlay() {
  const { user, loading: authLoading } = useAuth() as any;
  const isAdmin = ["ADMIN", "OWNER", "SUPERADMIN"].includes(user?.role?.toUpperCase() || "");
  const isOpen = useOSStore((state) => state.quickGenerateOpen);
  const setOpen = useOSStore((state) => state.setQuickGenerateOpen);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stepper State — persisted to URL ?step= and localStorage
  const [step, setStep] = useState<CreateStep>("IDEA");

  // Dynamic Engine List from canonical API
  const [availableEngines, setAvailableEngines] = useState<any[]>([]);
  const [selectedEngineId, setSelectedEngineId] = useState<string>("quiz");

  // Quiz Engine Specific Modes: "geo" (Default) vs "custom"
  const [quizMode, setQuizMode] = useState<"geo" | "custom">("geo");
  const [selectedCountry, setSelectedCountry] = useState<string>("IN");
  // BYOK transient — never persisted to localStorage
  const [useByok, setUseByok] = useState(false);
  const [byokKey, setByokKey] = useState("");

  // API Config Status for Basic User BYOK verification
  const [apiConfigStatus, setApiConfigStatus] = useState<{
    loading: boolean;
    hasConfiguredKey: boolean;
    activeProviderName: string | null;
  }>({
    loading: true,
    hasConfiguredKey: false,
    activeProviderName: null,
  });

  const checkApiConfig = useCallback(async () => {
    try {
      setApiConfigStatus((prev) => ({ ...prev, loading: true }));
      const res = await fetch("/api/settings/api");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.providers)) {
          const connected = data.providers.find(
            (p: any) => p.primary?.status === "connected" && p.primary?.hasKey
          );
          if (connected) {
            setApiConfigStatus({
              loading: false,
              hasConfiguredKey: true,
              activeProviderName: connected.name?.replace(" (Primary)", "") || connected.id,
            });
            return;
          }
        }
      }
      setApiConfigStatus({
        loading: false,
        hasConfiguredKey: false,
        activeProviderName: null,
      });
    } catch {
      setApiConfigStatus({
        loading: false,
        hasConfiguredKey: false,
        activeProviderName: null,
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen && !isAdmin) {
      checkApiConfig();
    }
  }, [isOpen, isAdmin, checkApiConfig]);

  // Custom Quiz Sub-mode: "single" vs "multiple"
  const [customMode, setCustomMode] = useState<"single" | "multiple">("single");
  const [topicBrief, setTopicBrief] = useState("Artificial Intelligence & Computing Milestones");
  const [multiTopics, setMultiTopics] = useState<string[]>([
    "Space Exploration",
    "Black Holes",
    "Mars",
  ]);
  const [newTopicInput, setNewTopicInput] = useState("");
  const [totalQuestions, setTotalQuestions] = useState<number>(6);

  // Progressive Disclosure: Advanced Job-Level Overrides
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [durationSeconds, setDurationSeconds] = useState(45);
  const [voice, setVoice] = useState("neutral");
  const [ratio, setRatio] = useState("9:16");

  // Draft State
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, ReturnType<typeof mapValidationError> | null>>({});

  // Question Inline Editing State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [reverifyingIndex, setReverifyingIndex] = useState<number | null>(null);

  // Quota State
  const [quota, setQuota] = useState<{
    completed: number;
    limit: number;
    remaining: number;
    isUnlimited: boolean;
    isExceeded: boolean;
  } | null>(null);

  const isBasicUser = user?.role !== "ADMIN" && user?.role !== "OWNER";
  const isQuotaExceeded = isBasicUser && quota !== null && (quota.isExceeded || quota.remaining <= 0);

  // Video Rendering & Polling State
  const [rendering, setRendering] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  // Fetch available active engines — quiz-only live
  useEffect(() => {
    async function loadEngines() {
      try {
        const res = await fetch("/api/engines/available");
        const data = await res.json();
        if (data.success && Array.isArray(data.engines)) {
          setAvailableEngines(data.engines);
          // Only Quiz is live — force quiz even if API default is another engine
          const liveEng = data.engines.find((e: any) => e.engineId === "quiz");
          const defaultEng = liveEng || data.engines.find((e: any) => e.isDefault) || data.engines[0];
          if (defaultEng) setSelectedEngineId(defaultEng.engineId === "quiz" ? defaultEng.engineId : "quiz");
        }
      } catch (err) {
        console.warn("[QuickGenerate] Failed to load available engines:", err);
      }
    }
    if (isOpen) {
      loadEngines();
      fetchQuota();
    }
  }, [isOpen]);

  const fetchQuota = async () => {
    try {
      const res = await fetch("/api/user/quota");
      const json = await res.json();
      if (json.success && json.quota) {
        setQuota(json.quota);
      }
    } catch {}
  };

  // Strict account isolation: reset in-memory draft when uid switches on same device
  const userIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUid = (user as any)?.uid ?? null;
    if (authLoading) return;
    if (userIdRef.current !== null && userIdRef.current !== currentUid) {
      pollingRef.current = false;
      setPolling(false);
      setDraft(null);
      setJobId(null);
      setJobStatus(null);
      setRendering(false);
      setError("");
      setFieldErrors({});
      setEditingIndex(null);
      setStep("IDEA");
      clearLegacyAndScopedStorage(currentUid);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("step");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    userIdRef.current = currentUid;
  }, [authLoading, (user as any)?.uid, pathname, router, searchParams]);

  // Restore draft/step from URL + localStorage on mount / open — strictly per-user
  useEffect(() => {
    if (!isOpen) return;
    if (authLoading) return;
    const uid = (user as any)?.uid ?? null;
    try {
      // Never inherit another account's draft on same browser
      if (!uid) {
        try {
          localStorage.removeItem(STORAGE_KEY_LEGACY);
        } catch {}
        // Force clean stepper when identity is unknown — do not trust URL step
        if (searchParams.get("step")) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("step");
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        }
        setStep("IDEA");
        return;
      }
      // Purge legacy global key and any scoped keys for other users
      try {
        localStorage.removeItem(STORAGE_KEY_LEGACY);
        const toRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(`${STORAGE_KEY_BASE}:`) && k !== storageKeyFor(uid)) toRemove.push(k);
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      } catch {}
      const raw = localStorage.getItem(storageKeyFor(uid));
      if (raw) {
        const saved = JSON.parse(raw);
        // Defense-in-depth: discard if payload was tagged for a different user
        if (saved.userId && saved.userId !== uid) {
          try {
            localStorage.removeItem(storageKeyFor(uid));
          } catch {}
          setStep("IDEA");
          const params = new URLSearchParams(searchParams.toString());
          params.delete("step");
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          return;
        }
        if (saved.draft) setDraft(saved.draft);
        if (saved.topicBrief) setTopicBrief(saved.topicBrief);
        if (saved.jobId) setJobId(saved.jobId);
        if (saved.jobStatus) setJobStatus(saved.jobStatus);
        if (saved.selectedEngineId) setSelectedEngineId(saved.selectedEngineId);
        if (saved.quizMode) setQuizMode(saved.quizMode);
        if (saved.selectedCountry) setSelectedCountry(saved.selectedCountry);
        if (saved.customMode) setCustomMode(saved.customMode);
        if (saved.multiTopics) setMultiTopics(saved.multiTopics);
        const urlStep = searchParams.get("step");
        if (urlStep) {
          const n = parseInt(urlStep, 10);
          // Only honor URL step 3/4 if we actually have an owned draft/job for this user
          const hasOwnedContext = Boolean(saved.draft || saved.jobId);
          if (!hasOwnedContext && n >= 3) {
            setStep("IDEA");
            const params = new URLSearchParams(searchParams.toString());
            params.delete("step");
            const qs2 = params.toString();
            router.replace(qs2 ? `${pathname}?${qs2}` : pathname, { scroll: false });
          } else if (n >= 1 && n <= 4 && NUM_STEP[n]) {
            setStep(NUM_STEP[n]);
          }
        } else if (saved.step && NUM_STEP[saved.step]) {
          // No URL step — restore from persisted step only if we have owned context
          if (saved.draft || saved.jobId) setStep(NUM_STEP[saved.step]);
        }
      } else {
        // No persisted draft for this account — force IDEA and clean stale URL step 3/4
        const urlStep = searchParams.get("step");
        if (urlStep) {
          const n = parseInt(urlStep, 10);
          if (n >= 3) {
            setStep("IDEA");
            const params = new URLSearchParams(searchParams.toString());
            params.delete("step");
            const qs = params.toString();
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          } else if (n >= 1 && n <= 2 && NUM_STEP[n]) {
            setStep(NUM_STEP[n]);
          }
        } else {
          setStep("IDEA");
        }
      }
    } catch {}
  }, [isOpen, authLoading, (user as any)?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist draft/step to URL + localStorage whenever they change while open — per-user only
  useEffect(() => {
    if (!isOpen) return;
    if (authLoading || !(user as any)?.uid) return;
    const uid = (user as any).uid as string;
    try {
      localStorage.setItem(
        storageKeyFor(uid),
        JSON.stringify({
          userId: uid,
          step: STEP_NUM[step],
          draft,
          topicBrief,
          jobId,
          jobStatus,
          selectedEngineId,
          quizMode,
          selectedCountry,
          customMode,
          multiTopics,
        })
      );
      // Ensure legacy global key never persists
      localStorage.removeItem(STORAGE_KEY_LEGACY);
    } catch {}
    const current = searchParams.get("step");
    const desired = String(STEP_NUM[step]);
    if (current !== desired) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", desired);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [
    step,
    draft,
    topicBrief,
    jobId,
    jobStatus,
    selectedEngineId,
    quizMode,
    selectedCountry,
    customMode,
    multiTopics,
    isOpen,
    authLoading,
    (user as any)?.uid,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearDraft = useCallback(() => {
    setDraft(null);
    setJobId(null);
    setJobStatus(null);
    setError("");
    setFieldErrors({});
    setEditingIndex(null);
    setStep("IDEA");
    try {
      clearLegacyAndScopedStorage((user as any)?.uid ?? null);
      const uid = (user as any)?.uid;
      if (uid) localStorage.removeItem(storageKeyFor(uid));
    } catch {}
    const params = new URLSearchParams(searchParams.toString());
    params.delete("step");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams, (user as any)?.uid]);

  // Compute live equal allocation preview
  const liveAllocation = React.useMemo(() => {
    if (selectedEngineId === "quiz" && quizMode === "custom" && customMode === "multiple") {
      try {
        return QuizOrchestrator.calculateEqualAllocation(multiTopics, totalQuestions);
      } catch {
        return [];
      }
    }
    return [];
  }, [selectedEngineId, quizMode, customMode, multiTopics, totalQuestions]);

  // Step 1 -> Step 2: Generate Draft
  async function handleGenerateDraft() {
    setLoadingDraft(true);
    setError("");
    setFieldErrors({});

    try {
      let payload: any = {
        engineId: selectedEngineId,
        difficulty,
        durationSeconds,
      };

      if (selectedEngineId === "quiz") {
        if (quizMode === "geo") {
          const cObj = GEO_COUNTRIES.find((c) => c.code === selectedCountry) || GEO_COUNTRIES[0];
          payload.quizMode = "geo";
          payload.countryCode = cObj.code;
          payload.countryName = cObj.name;
          if (useByok) {
            payload.useByok = true;
            payload.byokMode = "byok";
            if (byokKey.trim().length > 10) payload.byokKey = byokKey.trim();
          }
        } else {
          payload.quizMode = "custom";
          if (customMode === "multiple") {
            if (multiTopics.length > totalQuestions) {
              throw new Error(`Topic count (${multiTopics.length}) cannot exceed total questions (${totalQuestions}).`);
            }
            payload.customQuiz = {
              mode: "multiple",
              topics: multiTopics,
              totalQuestions,
            };
          } else {
            if (!topicBrief.trim()) throw new Error("Please enter a video topic or concept brief.");
            payload.customQuiz = {
              mode: "single",
              topics: [topicBrief.trim()],
              totalQuestions: 6,
            };
          }
        }
      } else {
        if (!topicBrief.trim()) throw new Error("Please enter a video topic or concept brief.");
        payload.topic = topicBrief.trim();
      }

      const res = await fetch("/api/quiz/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        const mapped = mapValidationError(
          data.code || data.error || "Failed to generate draft.",
          data.details || data.error
        );
        setError(`${mapped.title}: ${mapped.why}`);
        // P0-8: surface actionable field error inline (hook/question) instead of only banner
        if (mapped.code === "HOOK_MISSING" || mapped.code === "HOOK_SCORE_LOW") {
          setFieldErrors({ hook: mapped });
        } else if (mapped.code === "QUESTION_DUPLICATE" || mapped.code === "QUESTION_INVALID") {
          setFieldErrors({ questions: mapped as any });
        }
        return;
      }

      setDraft(data);
      setFieldErrors({});
      setStep("REVIEW");
    } catch (e: any) {
      const mapped = mapValidationError(e.message || "Draft generation failed.");
      setError(`${mapped.title}: ${mapped.why}`);
      if (mapped.code === "HOOK_MISSING" || mapped.code === "HOOK_SCORE_LOW") setFieldErrors({ hook: mapped });
    } finally {
      setLoadingDraft(false);
    }
  }

  // Question Inline Edit Handlers
  function startEditing(index: number) {
    const q = draft.questions[index];
    setEditingIndex(index);
    setEditForm({
      question: q.question,
      options: [...(q.options || [])],
      answer: q.answer,
      explanation: q.explanation || "",
    });
  }

  function saveEditing(index: number) {
    if (!draft || !draft.questions) return;
    const updated = [...draft.questions];
    const original = updated[index];

    const editedQ = QuizOrchestrator.markQuestionEdited({
      ...original,
      question: editForm.question,
      options: editForm.options,
      answer: editForm.answer,
      explanation: editForm.explanation,
    });

    updated[index] = editedQ;
    setDraft({ ...draft, questions: updated });
    setEditingIndex(null);
  }

  async function handleReverifyQuestion(index: number) {
    if (!draft || !draft.questions[index]) return;
    const q = draft.questions[index];
    setReverifyingIndex(index);

    try {
      const res = await fetch("/api/quiz/verify-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          topic: q.topicName || draft.topic || topicBrief,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updated = [...draft.questions];
        updated[index] = {
          ...q,
          verificationStatus: data.status,
          evidence: data.evidence,
          nliResult: data.nliResult,
          score: data.score,
        };
        setDraft({ ...draft, questions: updated });
      }
    } catch (err) {
      console.error("[Reverify Error]:", err);
    } finally {
      setReverifyingIndex(null);
    }
  }

  // Step 2 -> Step 3: Start Render
  async function handleStartRender() {
    if (!draft) return;

    setRendering(true);
    setError("");
    setStep("RENDER");
    setJobStatus({ status: "queued", stage: "Preparing video synthesis..." });

    try {
      const quizContext = {
        quizMode: draft.quizMode || (selectedEngineId === "quiz" ? (quizMode === "geo" ? "geo" : customMode === "multiple" ? "custom_multiple" : "custom_single") : undefined),
        countryCode: draft.countryCode || (quizMode === "geo" ? selectedCountry : undefined),
        topics: draft.topics,
        totalQuestions: draft.questions?.length,
        allocationStrategy: "EQUAL",
        source: draft.meta?.source || undefined,
        geoSetId: draft.meta?.setId,
        geoSetLabel: draft.meta?.setLabel,
      };

      const payload = {
        topic: draft.topic || topicBrief || "ShortForge Short",
        style: selectedEngineId || "quiz",
        engineId: selectedEngineId || "quiz",
        engineMode: quizMode,
        difficulty,
        tone: "Challenging",
        voice,
        ratio,
        contentType: "QUIZ_SHORTS",
        hook: draft.hook,
        questions: draft.questions,
        title: draft.title,
        description: draft.description,
        hashtags: draft.hashtags,
        renderProfile: draft.renderProfile || "FAST_QUIZ",
        durationSeconds: draft.durationSeconds || durationSeconds,
        quizContext,
        delivery: {
          target: "GOOGLE_DRIVE",
          authMode: "OAUTH_USER",
          artifactVersion: "v1",
          allowFallback: false,
        },
      };

      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        const mapped = mapValidationError(
          json.code || json.error || "Video generation request failed.",
          json.details || json.error
        );
        setError(`${mapped.title}: ${mapped.why}`);
        setStep("REVIEW");
        setJobStatus({ status: "failed", error: mapped.title });
        throw new Error(mapped.title);
      }

      const activeJobId = json.jobId || json.id || json.videoId;
      setJobId(activeJobId);
      setJobStatus({ status: "queued", jobId: activeJobId, stage: humanStageLabel("queued") });
      startPolling(activeJobId);
    } catch (e: any) {
      if (!error) setError(e.message || "Failed to start render.");
      setJobStatus((prev: any) => prev ?? { status: "failed", error: e.message });
    } finally {
      setRendering(false);
    }
  }

  // Polling Job Status (Bounded with 5-minute timeout and error handling)
  const pollingRef = useRef<boolean>(false);
  const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes max

  function startPolling(id: string) {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setPolling(true);

    const startTime = Date.now();
    let consecutiveErrors = 0;

    const check = async () => {
      if (!pollingRef.current) return;

      // 1. Enforce max polling duration timeout
      if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
        pollingRef.current = false;
        setPolling(false);
        setError("Render polling timed out after 5 minutes. You can check the Media Library or retry.");
        setJobStatus((prev: any) => ({ ...(prev || {}), status: "failed", error: "Polling timed out" }));
        return;
      }

      try {
        const res = await fetch(`/api/job-status/${id}`);
        if (!res.ok) {
          consecutiveErrors++;
          if (res.status === 404) {
            pollingRef.current = false;
            setPolling(false);
            setError("Render job not found (404). Please try generating again.");
            setJobStatus({ status: "failed", error: "Job not found" });
            return;
          }
          if (res.status >= 500 && consecutiveErrors >= 5) {
            pollingRef.current = false;
            setPolling(false);
            setError("Server error during render status checking. Please check your Media Library.");
            setJobStatus({ status: "failed", error: "Server error" });
            return;
          }
        } else {
          consecutiveErrors = 0;
          const data = await res.json();
          setJobStatus(data);
          if (data.status === "completed") {
            pollingRef.current = false;
            setPolling(false);
            setStep("READY");
            fetchQuota();
            return;
          }
          if (data.status === "failed") {
            pollingRef.current = false;
            setPolling(false);
            setError(data.error || "Render execution failed.");
            return;
          }
        }
      } catch (e: any) {
        consecutiveErrors++;
        if (consecutiveErrors >= 6) {
          pollingRef.current = false;
          setPolling(false);
          setError("Network connection issue while checking render status. Please retry.");
          setJobStatus((prev: any) => ({ ...(prev || {}), status: "failed", error: "Network error" }));
          return;
        }
      }

      if (pollingRef.current) {
        const backoffDelay = Math.min(6000, 2500 + consecutiveErrors * 500);
        setTimeout(check, backoffDelay);
      }
    };
    check();
  }

  const [cancelling, setCancelling] = useState(false);

  const handleCancelRender = async () => {
    if (!jobId || cancelling) return;
    setCancelling(true);
    try {
      pollingRef.current = false;
      setPolling(false);

      // Call DELETE to cancel job and release quota reservation atomically
      await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
      }).catch(() => {});

      // Refresh quota state immediately
      await fetchQuota();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("quota:updated"));
      }

      setRendering(false);
      setJobStatus(null);
      setStep("REVIEW");
    } catch (err) {
      console.error("[QuickGenerate] Failed to cancel render:", err);
    } finally {
      setCancelling(false);
    }
  };

  const handleClose = () => {
    pollingRef.current = false;
    setOpen(false);
  };

  // Escape closes the dialog. Focus trapping is not implemented yet.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pollingRef.current = false;
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setOpen]);

  const delivery = describeDelivery({
    status: jobStatus?.status,
    deliveryMethod: jobStatus?.deliveryMethod,
    verified: jobStatus?.deliveryVerified,
    driveFileId: jobStatus?.driveFileId,
    driveUrl: jobStatus?.driveUrl,
  });

  const deliveryTone =
    delivery.state === "DRIVE_DELIVERED"
      ? "border-[#19C37D]/30 bg-[#19C37D]/10 text-[#0F7A50] dark:text-[#19C37D]"
      : delivery.state === "DELIVERY_FAILED"
      ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
      : delivery.state === "DRIVE_PENDING"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-[#667085] dark:text-[#A8B2C1]";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-generate-title"
        className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#070D18] border border-black/[0.08] dark:border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Top Header & Quota Bar */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-black/[0.02] dark:bg-[#0E1728]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#1677FF]/10 text-[#1677FF] flex items-center justify-center font-bold">
              <BrandIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 id="quick-generate-title" className="text-sm font-bold text-[#111827] dark:text-[#F5F7FA]">Create Video</h3>
              <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1]">Fast autonomous creation pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {quota && isBasicUser && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-[#121E32] text-[#667085] font-mono">
                {quota.remaining} / {quota.limit} videos left (Lifetime Basic)
              </span>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close create video dialog"
              className="p-1.5 rounded-xl hover:bg-black/[0.05] dark:hover:bg-white/[0.05] text-[#667085] hover:text-[#111827] dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Step Stepper Header */}
        <div className="px-6 py-3 border-b border-black/[0.04] dark:border-white/[0.04] bg-black/[0.01] dark:bg-[#070D18] flex items-center justify-between text-xs">
          {(["IDEA", "REVIEW", "RENDER", "READY"] as CreateStep[]).map((s, idx) => {
            const num = idx + 1;
            const active = step === s;
            const done = STEP_NUM[step] > num;
            return (
              <div
                key={s}
                className={`flex items-center gap-2 font-semibold transition-colors ${
                  active
                    ? "text-[#1677FF]"
                    : done
                    ? "text-[#19C37D]"
                    : "text-[#667085] dark:text-[#667085]"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${
                    active
                      ? "bg-[#1677FF] text-white"
                      : done
                      ? "bg-[#19C37D]/20 text-[#19C37D]"
                      : "bg-black/[0.05] dark:bg-white/[0.05] text-[#667085]"
                  }`}
                >
                  {done ? "✓" : num}
                </span>
                <span className="hidden sm:inline">{s}</span>
                {idx < 3 && <ChevronRight className="w-3.5 h-3.5 text-[#667085]/40 ml-2 hidden sm:inline" />}
              </div>
            );
          })}
        </div>

        {/* Modal Body Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: IDEA — Engine Selector & Content Inputs */}
          {step === "IDEA" && (
            <div className="space-y-6">
              {/* Engine Selector Dropdown */}
              {(() => {
                const engineList =
                  availableEngines.length > 0
                    ? availableEngines
                    : [
                        { engineId: "quiz", name: "Quiz Engine", description: "Viral trivia challenges, Geo Quizzes, and multi-topic knowledge tests.", category: "QUIZ" },
                        { engineId: "facts", name: "Facts Engine", description: "Curiosity-driven fast educational shorts and shocking facts.", category: "EDUCATION" },
                        { engineId: "history", name: "History Engine", description: "Cinematic narratives of pivotal historical events and figures.", category: "STORY" },
                        { engineId: "motivation", name: "Motivation Engine", description: "High-energy inspiring speeches, quotes, and mindsets.", category: "MOTIVATION" },
                        { engineId: "coding", name: "Coding Engine", description: "Developer tips, programming trivia, and software engineering insights.", category: "EDUCATION" },
                        { engineId: "news", name: "News Engine", description: "Breaking stories and news digest shorts.", category: "OTHER" },
                        { engineId: "psychology", name: "Psychology Engine", description: "Cognitive biases, mind tricks, and behavioral psychology breakdowns.", category: "EXPLAINER" },
                        { engineId: "reddit", name: "Reddit Engine", description: "Community anecdotes, top stories, and social commentary shorts.", category: "OTHER" },
                        { engineId: "story", name: "Story Engine", description: "Engaging narrative storytelling with suspenseful retention hooks.", category: "STORY" },
                      ];
                const activeEngine = engineList.find((e: any) => e.engineId === selectedEngineId) || engineList[0];

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">
                        1. Select Content Engine
                      </label>
                      {activeEngine && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1677FF]/10 text-[#1677FF] font-mono uppercase font-bold">
                          {activeEngine.category || "OTHER"}
                        </span>
                      )}
                    </div>

                    <div className="relative group/select">
                      <select
                        value={selectedEngineId}
                        onChange={(e) => {
                          const next = e.target.value;
                          // Only Quiz is live for non-admins — block switching to coming-soon engines
                          if (!isAdmin && next !== "quiz") return;
                          setSelectedEngineId(next);
                        }}
                        className="w-full rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-[#0E1728] px-4 py-3 text-xs font-bold text-[#111827] dark:text-[#F5F7FA] focus:border-[#1677FF] focus:outline-none cursor-pointer appearance-none pr-10 transition-all hover:border-black/[0.2] dark:hover:border-white/[0.2]"
                      >
                        {engineList.map((eng: any) => {
                          const live = isAdmin || eng.engineId === "quiz";
                          return (
                            <option
                              key={eng.engineId}
                              value={eng.engineId}
                              disabled={!live}
                              title={!live ? "Coming soon — Quiz Shorts is live now" : undefined}
                              className={`py-1 ${live ? "bg-white dark:bg-[#070D18] text-[#111827] dark:text-[#F5F7FA]" : "bg-[#f5f5f7] text-[#86868b]"}`}
                            >
                              {eng.name} ({eng.category || "OTHER"}){!live ? " — Coming soon" : " · Live"}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#667085]">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Live / coming-soon legend for regular users */}
                    {!isAdmin && (
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#34c759] animate-pulse" />
                          <span className="text-[#34c759]">QUIZ — LIVE NOW</span>
                        </span>
                        <span className="text-[#e8e8ed]">·</span>
                        <span className="text-[10px] font-semibold text-[#86868b]" title="Coming soon — Quiz Shorts is live now">
                          Other engines — Coming soon
                        </span>
                        <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[10px] font-bold tracking-wider">MORE FORMATS COMING SOON</span>
                      </div>
                    )}

                    {activeEngine?.description && (
                      <p className="text-[11px] text-[#667085] dark:text-[#A8B2C1] px-1">
                        {activeEngine.description}
                        {!isAdmin && activeEngine.engineId !== "quiz" && (
                          <span className="ml-1 text-amber-600 font-semibold"> — Coming soon.</span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* QUIZ ENGINE CONFIGURATION (GEO DEFAULT + CUSTOM SINGLE/MULTI) */}
              {selectedEngineId === "quiz" && (
                <div className="p-5 rounded-2xl bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.08] dark:border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">
                      2. Quiz Mode
                    </label>
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-black/[0.04] dark:bg-[#070D18]">
                      <button
                        type="button"
                        onClick={() => setQuizMode("geo")}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          quizMode === "geo"
                            ? "bg-[#1677FF] text-white shadow-xs"
                            : "text-[#667085] hover:text-[#111827] dark:hover:text-white"
                        }`}
                      >
                        <Globe className="w-3.5 h-3.5" /> Geo Quiz (Default)
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuizMode("custom")}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                          quizMode === "custom"
                            ? "bg-[#1677FF] text-white shadow-xs"
                            : "text-[#667085] hover:text-[#111827] dark:hover:text-white"
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Custom Quiz
                      </button>
                    </div>
                  </div>

                  {/* Mode: Geo Quiz */}
                  {quizMode === "geo" && (
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">
                        Select Target Country:
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {GEO_COUNTRIES.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => setSelectedCountry(c.code)}
                            className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                              selectedCountry === c.code
                                ? "bg-[#1677FF]/10 border-[#1677FF] text-[#1677FF] font-bold"
                                : "bg-white dark:bg-[#070D18] border-black/[0.06] dark:border-white/[0.06] text-[#667085] hover:border-black/[0.2]"
                            }`}
                          >
                            <span className="text-base">{c.flag}</span>
                            <span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                      {/* Mode Selector for Basic Users: Demo (Curated Sets) vs BYOK (Custom LLM API) */}
                      {!isAdmin && (
                        <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06]">
                            {/* Demo Switch */}
                            <button
                              type="button"
                              onClick={() => setUseByok(false)}
                              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                !useByok
                                  ? "bg-white dark:bg-[#0E1626] text-[#111827] dark:text-[#F5F7FA] shadow-sm border border-black/[0.06] dark:border-white/[0.08]"
                                  : "text-[#667085] hover:text-[#111827] dark:hover:text-[#F5F7FA]"
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              <span>Demo (Curated 1→5)</span>
                            </button>

                            {/* BYOK Switch */}
                            <button
                              type="button"
                              onClick={() => setUseByok(true)}
                              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                useByok
                                  ? "bg-white dark:bg-[#0E1626] text-[#1677FF] dark:text-[#388BFF] shadow-sm border border-[#1677FF]/30 dark:border-[#1677FF]/40"
                                  : "text-[#667085] hover:text-[#111827] dark:hover:text-[#F5F7FA]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={useByok}
                                onChange={(e) => setUseByok(e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded border-black/20 text-[#1677FF] focus:ring-[#1677FF]/30 h-3.5 w-3.5"
                              />
                              <span>BYOK (Use My API)</span>
                            </button>
                          </div>

                          {/* BYOK Details & Senior LLM API Toolkit */}
                          {useByok && (
                            <div className="space-y-2.5 rounded-xl p-3 bg-[#1677FF]/5 dark:bg-[#1677FF]/10 border border-[#1677FF]/20">
                              {apiConfigStatus.hasConfiguredKey ? (
                                <div className="flex items-start gap-2.5">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                        API Key Configured: {apiConfigStatus.activeProviderName}
                                      </span>
                                      <Link
                                        href="/settings/api"
                                        target="_blank"
                                        className="text-[11px] text-[#1677FF] hover:underline flex items-center gap-0.5"
                                      >
                                        Manage <ExternalLink className="w-2.5 h-2.5" />
                                      </Link>
                                    </div>
                                    <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                      Senior LLM pipeline will use your configured API to generate fresh custom trivia questions, script, and narration.
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                        No API Key Configured in API Settings
                                      </p>
                                      <p className="text-[11px] text-[#667085] dark:text-[#94A3B8]">
                                        To generate custom AI questions, configure your Gemini / OpenAI key in the API Config page or paste a transient key below.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 pt-1">
                                    <Link
                                      href="/settings/api"
                                      target="_blank"
                                      className="px-2.5 py-1.5 rounded-lg bg-[#1677FF] text-white text-[11px] font-semibold hover:bg-[#1677FF]/90 transition-colors flex items-center gap-1.5 shrink-0"
                                    >
                                      <span>Configure API in Settings</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={checkApiConfig}
                                      className="px-2 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-[11px] text-[#667085] hover:text-[#111827] dark:hover:text-white transition-colors flex items-center gap-1"
                                      title="Refresh Status"
                                    >
                                      <RefreshCw className={`w-3 h-3 ${apiConfigStatus.loading ? "animate-spin" : ""}`} />
                                      <span>Refresh</span>
                                    </button>
                                  </div>

                                  {/* Optional Transient Key Input */}
                                  <div className="pt-1.5 space-y-1">
                                    <input
                                      type="password"
                                      value={byokKey}
                                      onChange={(e) => setByokKey(e.target.value)}
                                      placeholder="Or paste transient API key here..."
                                      autoComplete="off"
                                      className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#070D18] px-3 py-2 text-xs text-[#111827] dark:text-[#F5F7FA] focus:border-[#1677FF] focus:outline-none"
                                    />
                                    <p className="text-[10px] text-[#667085]">
                                      Transient keys are used only for this draft request and never persisted.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {!useByok && (
                            <p className="text-[11px] text-[#667085] italic">
                              5 curated sets per country — edit any question in the next step. BASIC rotates Set 1→5 with your 5-video quota.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode: Custom Quiz */}
                  {quizMode === "custom" && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 text-xs font-semibold">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="customSubMode"
                            checked={customMode === "single"}
                            onChange={() => setCustomMode("single")}
                            className="text-[#1677FF]"
                          />
                          <span>Single Topic</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="customSubMode"
                            checked={customMode === "multiple"}
                            onChange={() => setCustomMode("multiple")}
                            className="text-[#1677FF]"
                          />
                          <span>Multiple Topics (Equal Allocation)</span>
                        </label>
                      </div>

                      {customMode === "single" ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={topicBrief}
                            onChange={(e) => setTopicBrief(e.target.value)}
                            placeholder="Enter quiz topic (e.g. Fascinating Facts About Cats)"
                            className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#070D18] px-4 py-2.5 text-xs text-[#111827] dark:text-[#F5F7FA] focus:border-[#1677FF] focus:outline-none"
                          />
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            <span className="text-[11px] text-[#667085] self-center mr-1">Popular:</span>
                            {SAMPLE_TOPICS.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setTopicBrief(t)}
                                className="px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-[11px] text-[#667085] hover:text-[#1677FF] hover:bg-[#1677FF]/10 transition-colors"
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newTopicInput}
                              onChange={(e) => setNewTopicInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newTopicInput.trim()) {
                                  e.preventDefault();
                                  setMultiTopics([...multiTopics, newTopicInput.trim()]);
                                  setNewTopicInput("");
                                }
                              }}
                              placeholder="Type a topic and press Add (e.g. Quantum Physics)"
                              className="flex-1 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#070D18] px-4 py-2.5 text-xs text-[#111827] dark:text-[#F5F7FA] focus:border-[#1677FF] focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (newTopicInput.trim()) {
                                  setMultiTopics([...multiTopics, newTopicInput.trim()]);
                                  setNewTopicInput("");
                                }
                              }}
                              className="px-4 py-2.5 rounded-xl bg-[#1677FF] text-white text-xs font-bold cursor-pointer"
                            >
                              Add Topic
                            </button>
                          </div>

                          {/* Topic Tags */}
                          <div className="flex flex-wrap gap-2">
                            {multiTopics.map((t, idx) => (
                              <div
                                key={idx}
                                className="px-3 py-1.5 rounded-xl bg-[#1677FF]/10 border border-[#1677FF]/30 text-xs font-medium text-[#1677FF] flex items-center gap-1.5"
                              >
                                <span>{t}</span>
                                <button
                                  type="button"
                                  onClick={() => setMultiTopics(multiTopics.filter((_, i) => i !== idx))}
                                  className="p-0.5 rounded-full hover:bg-[#1677FF]/20 text-[#1677FF]"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Allocation preview */}
                          {liveAllocation.length > 0 && (
                            <div className="p-3 rounded-xl bg-black/[0.03] dark:bg-[#070D18] border border-black/[0.06] dark:border-white/[0.06] text-xs space-y-1">
                              <span className="font-bold text-[#667085] uppercase tracking-wider text-[10px]">
                                Equal Allocation Preview ({totalQuestions} Total Questions):
                              </span>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {liveAllocation.map((a) => (
                                  <span
                                    key={a.topicId}
                                    className="px-2 py-0.5 rounded-md bg-black/[0.05] dark:bg-white/[0.05] font-mono text-[11px]"
                                  >
                                    {a.name}: <strong>{a.questionBudget} Qs</strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* NON-QUIZ ENGINES (FACTS, HISTORY, STORY, ETC) */}
              {selectedEngineId !== "quiz" && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">
                    2. Topic or Narrative Concept Brief
                  </label>
                  <input
                    type="text"
                    value={topicBrief}
                    onChange={(e) => setTopicBrief(e.target.value)}
                    placeholder="Enter topic or story premise..."
                    className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-[#0E1728] px-4 py-2.5 text-xs text-[#111827] dark:text-[#F5F7FA] focus:border-[#1677FF] focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[11px] text-[#667085] self-center mr-1">Popular:</span>
                    {SAMPLE_TOPICS.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTopicBrief(t)}
                        className="px-2.5 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.04] text-[11px] text-[#667085] hover:text-[#1677FF] hover:bg-[#1677FF]/10 transition-colors"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PROGRESSIVE DISCLOSURE: ADVANCED JOB-LEVEL OVERRIDES */}
              <div className="border border-black/[0.06] dark:border-white/[0.06] rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-4 py-3 bg-black/[0.01] dark:bg-[#0E1728] text-xs font-bold text-[#667085] dark:text-[#A8B2C1] flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-[#1677FF]" /> Advanced Job Options
                  </span>
                  <span>{showAdvanced ? "▲ Hide" : "▼ Show"}</span>
                </button>

                {showAdvanced && (
                  <div className="p-4 bg-white dark:bg-[#070D18] border-t border-black/[0.06] dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-[#667085]">Difficulty</label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-[#0E1728] px-3 py-2 text-xs text-[#111827] dark:text-[#F5F7FA]"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium (Default)</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-[#667085]">Voice Style</label>
                      <select
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-[#0E1728] px-3 py-2 text-xs text-[#111827] dark:text-[#F5F7FA]"
                      >
                        <option value="neutral">Neutral & Engaging</option>
                        <option value="dramatic">Dramatic & Suspenseful</option>
                        <option value="energetic">High-Energy & Fast</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase text-[#667085]">Target Duration</label>
                      <select
                        value={durationSeconds}
                        onChange={(e) => setDurationSeconds(Number(e.target.value))}
                        className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-[#0E1728] px-3 py-2 text-xs text-[#111827] dark:text-[#F5F7FA]"
                      >
                        <option value={30}>30 Seconds</option>
                        <option value={45}>45 Seconds (Standard)</option>
                        <option value={60}>60 Seconds (Full Short)</option>
                      </select>
                    </div>
                    <div className="sm:col-span-3 text-[11px] text-[#667085] italic">
                      Note: These job-level overrides apply to this render only and do not modify engine defaults.
                    </div>
                  </div>
                )}
              </div>

              {/* Generate CTA */}
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={loadingDraft || isQuotaExceeded}
                className={`w-full py-3.5 rounded-2xl text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                  isQuotaExceeded
                    ? "bg-zinc-500 opacity-60 cursor-not-allowed"
                    : "bg-[#1677FF] hover:bg-[#0F63D8] active:scale-[0.99]"
                }`}
              >
                {loadingDraft ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Script & Questions via External RAG...</span>
                  </>
                ) : (
                  <>
                    <BrandIcon className="w-4 h-4" variant="white" />
                    <span>Generate Draft &rarr;</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* STEP 2: REVIEW — Inline Question Editing & Reverification */}
          {step === "REVIEW" && draft && (
            <div className="space-y-6">
              {/* Hook Card — P0-8 inline actionable error */}
              <div className="bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#19C37D] font-mono flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Opening Hook Line
                  </span>
                  <span className="text-[10px] text-[#667085]">Topic: {draft.topic}</span>
                </div>
                <textarea
                  value={draft.hook || ""}
                  onChange={(e) => { setDraft((prev: any) => ({ ...prev, hook: e.target.value })); if (fieldErrors.hook) setFieldErrors((p) => ({ ...p, hook: null })); }}
                  rows={2}
                  placeholder="Opening hook — first line of the short"
                  className={`w-full rounded-xl border bg-white dark:bg-[#070D18] px-3 py-2 text-xs font-semibold italic text-[#111827] dark:text-[#F5F7FA] focus:outline-none resize-none ${fieldErrors.hook ? "border-amber-500 focus:border-amber-500" : "border-black/[0.08] dark:border-white/[0.08] focus:border-[#1677FF]"}`}
                />
                {fieldErrors.hook && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed">
                    <p className="font-bold text-amber-700 dark:text-amber-300">{fieldErrors.hook.title}</p>
                    <p className="text-amber-700/80 dark:text-amber-300/80">{fieldErrors.hook.why}</p>
                    <button type="button" onClick={() => document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Opening hook — first line of the short"]')?.focus()} className="mt-1 text-[11px] font-bold text-amber-700 underline underline-offset-2">{fieldErrors.hook.actionLabel} →</button>
                  </div>
                )}
              </div>

              {/* Questions Grid with Per-Question Edit and Reverification */}
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#667085] dark:text-[#A8B2C1]">
                    Generated Questions ({draft.questions?.length ?? 0})
                  </h4>
                  <div className="flex items-center gap-2">
                    {draft.meta?.source === "hardcoded" && draft.meta?.setLabel && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-[#1677FF]/10 border border-[#1677FF]/20 text-[#1677FF] font-mono font-bold">
                        Set {draft.meta.setLabel} · {draft.countryCode} · Curated
                      </span>
                    )}
                    {draft.meta?.source === "byok" && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-mono font-bold">AI-generated · BYOK</span>
                    )}
                    {draft.meta?.source === "llm" && (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-black/[0.04] border border-black/[0.06] text-[#667085] font-mono">AI-generated</span>
                    )}
                    <span className="text-[11px] text-[#667085] font-mono">
                      Engine: {draft.engineId || selectedEngineId}
                    </span>
                  </div>
                </div>
                {draft.meta?.source === "hardcoded" && (
                  <p className="text-[11px] text-[#667085] italic">Curated set {draft.meta.setLabel} for {draft.countryCode} — edit any question below. Next render rotates to the next set.</p>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {draft.questions?.map((q: any, idx: number) => {
                    const isEditing = editingIndex === idx;
                    const isReverifying = reverifyingIndex === idx;

                    return (
                      <div
                        key={idx}
                        className="bg-black/[0.02] dark:bg-[#0E1728] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl p-4 space-y-3 flex flex-col justify-between"
                      >
                        {isEditing ? (
                          /* INLINE EDIT FORM */
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#1677FF] font-mono">
                                Editing Q{idx + 1} (Rev {q.revision || 1})
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingIndex(null)}
                                className="text-[11px] text-[#667085] hover:text-red-500"
                              >
                                Cancel
                              </button>
                            </div>

                            <input
                              type="text"
                              value={editForm.question}
                              onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                              placeholder="Question text..."
                              className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#070D18] px-3 py-2 text-xs font-bold text-[#111827] dark:text-[#F5F7FA]"
                            />

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-[#667085] uppercase">Options & Correct Answer</label>
                              {editForm.options?.map((opt: string, optIdx: number) => (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={`correct_${idx}`}
                                    checked={editForm.answer === opt}
                                    onChange={() => setEditForm({ ...editForm, answer: opt })}
                                  />
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const nextOpts = [...editForm.options];
                                      nextOpts[optIdx] = e.target.value;
                                      setEditForm({ ...editForm, options: nextOpts });
                                    }}
                                    className="flex-1 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#070D18] px-2 py-1 text-xs"
                                  />
                                </div>
                              ))}
                            </div>

                            <button
                              type="button"
                              onClick={() => saveEditing(idx)}
                              className="w-full py-2 rounded-xl bg-[#19C37D] text-white text-xs font-bold cursor-pointer"
                            >
                              Save Changes
                            </button>
                          </div>
                        ) : (
                          /* STANDARD DISPLAY CARD */
                          <>
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[#1677FF] font-mono">Q{idx + 1}</span>
                                  {q.topicName && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#1677FF]/10 text-[#1677FF] font-mono">
                                      {q.topicName}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                                      q.verificationStatus === "SUPPORTED"
                                        ? "bg-[#19C37D]/20 text-[#19C37D]"
                                        : q.verificationStatus === "PENDING"
                                        ? "bg-amber-500/20 text-amber-500"
                                        : "bg-black/[0.05] text-[#667085]"
                                    }`}
                                  >
                                    {q.verificationStatus || "UNVERIFIED"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => startEditing(idx)}
                                    className="text-[11px] font-bold text-[#1677FF] hover:underline flex items-center gap-1 cursor-pointer"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                </div>
                              </div>

                              <p className="text-xs font-bold text-[#111827] dark:text-[#F5F7FA]">{q.question}</p>

                              <div className="grid grid-cols-2 gap-1.5">
                                {q.options?.map((opt: string, optIdx: number) => {
                                  const isCorrect = opt === q.answer || optIdx === q.answerIndex;
                                  return (
                                    <div
                                      key={optIdx}
                                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium border ${
                                        isCorrect
                                          ? "bg-[#19C37D]/10 border-[#19C37D]/30 text-[#19C37D] font-bold"
                                          : "bg-black/[0.02] dark:bg-[#070D18] border-black/[0.04] dark:border-white/[0.04] text-[#667085] dark:text-[#A8B2C1]"
                                      }`}
                                    >
                                      {opt} {isCorrect && "✓"}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Action Bar for Re-verification */}
                            <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between text-[11px]">
                              <span className="text-[#667085] font-mono text-[10px]">Rev: {q.revision || 1}</span>
                              <button
                                type="button"
                                onClick={() => handleReverifyQuestion(idx)}
                                disabled={isReverifying}
                                className="text-[11px] font-bold text-[#1677FF] hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                {isReverifying ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" /> Verifying...
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck className="w-3.5 h-3.5" /> Reverify Claim
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quota Exhaustion Warning Card */}
              {isQuotaExceeded && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 my-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold">Lifetime Generation Quota Exhausted</h4>
                      <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                        You have used all {quota?.limit ?? 5} complimentary videos included in your Basic lifetime plan (Used: {quota ? quota.limit - quota.remaining : 5}/{quota?.limit ?? 5}).
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href="/media/library"
                      onClick={handleClose}
                      className="px-3 py-1.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.1] text-xs font-semibold transition-colors"
                    >
                      Media Library
                    </Link>
                    <Link
                      href="/pricing"
                      onClick={handleClose}
                      className="px-3.5 py-1.5 rounded-xl bg-[#1677FF] hover:bg-[#0F63D8] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
                    >
                      Upgrade to Pro &rarr;
                    </Link>
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setStep("IDEA")}
                  className="px-4 py-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] text-xs font-bold text-[#667085] hover:text-[#111827] dark:hover:text-white cursor-pointer"
                >
                  &larr; Back to Idea
                </button>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={clearDraft}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 cursor-pointer"
                  >
                    Clear Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleStartRender}
                    disabled={rendering || isQuotaExceeded}
                    className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs ${
                      isQuotaExceeded
                        ? "bg-black/[0.1] dark:bg-white/[0.1] text-[#667085] cursor-not-allowed"
                        : "bg-[#1677FF] hover:bg-[#0F63D8] text-white cursor-pointer"
                    }`}
                  >
                    {isQuotaExceeded ? (
                      <>Quota Exceeded ({quota ? quota.limit - quota.remaining : 5}/{quota?.limit ?? 5})</>
                    ) : (
                      <><Play className="w-3.5 h-3.5 fill-current" /> Render Video &rarr;</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: RENDER & STEP 4: READY */}
          {(step === "RENDER" || step === "READY") && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              {step === "RENDER" ? (
                (() => {
                  const pctRaw = jobStatus?.progress ?? jobStatus?.progress_percentage ?? null;
                  const pct = typeof pctRaw === "number" && Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, Math.round(pctRaw))) : null;
                  const isFailed = (jobStatus?.status || "").toLowerCase().includes("failed") || (jobStatus?.detailedStatus || "").toLowerCase().includes("failed");
                  return (
                    <>
                      <div className={`w-16 h-16 rounded-3xl flex items-center justify-center ${isFailed ? "bg-red-500/10 text-red-500" : "bg-[#1677FF]/10 text-[#1677FF] animate-pulse"}`}>
                        {isFailed ? <AlertTriangle className="w-8 h-8" /> : <RefreshCw className="w-8 h-8 animate-spin" />}
                      </div>
                      <div className="w-full max-w-sm space-y-3">
                        <h3 className="text-base font-bold text-[#111827] dark:text-[#F5F7FA]">
                          {humanStageLabel(jobStatus?.status, jobStatus?.stage)}
                        </h3>
                        <p className="text-xs text-[#667085] dark:text-[#A8B2C1]">
                          {isFailed ? error || "Render failed — you can retry." : "Generating video assets, audio synthesis, and FFmpeg render..."}
                        </p>
                        {/* Real progress only — indeterminate when null, never fake 45s */}
                        <div className="h-2 rounded-full bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden">
                          {pct !== null ? (
                            <div className="h-full bg-[#1677FF] transition-all duration-500" style={{ width: `${pct}%` }} />
                          ) : (
                            <div className="h-full w-1/3 bg-[#1677FF]/60 animate-[shimmer_1.2s_ease-in-out_infinite]" style={{ animationName: "pulse" }} />
                          )}
                        </div>
                        {pct !== null && <p className="text-[11px] font-mono text-[#667085]">{pct}% — real queue progress</p>}
                        {isFailed && (
                          <button type="button" onClick={handleStartRender} className="mt-2 px-5 py-2.5 rounded-xl bg-[#1677FF] text-white text-xs font-bold cursor-pointer">Retry render</button>
                        )}
                      </div>

                      {/* Bottom Right Cancel Button */}
                      <div className="w-full flex justify-end pt-4">
                        <button
                          type="button"
                          onClick={handleCancelRender}
                          disabled={cancelling}
                          className="px-4 py-2 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          {cancelling ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
                  <div className="w-16 h-16 rounded-3xl bg-[#19C37D]/20 text-[#19C37D] flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#111827] dark:text-[#F5F7FA]">Video Ready!</h3>
                    <p className="text-xs text-[#667085] dark:text-[#A8B2C1] mt-1">
                      Your video is rendered. Delivery is reported separately below.
                    </p>
                  </div>

                  {/* P0-3: READY — Download + Publish + Drive triple-AND gate */}
                  <div className="grid w-full max-w-lg grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                    {jobStatus?.videoUrl ? (
                      <a href={jobStatus.videoUrl} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-[#1677FF] text-white text-xs font-bold flex items-center justify-center gap-2">
                        <Download className="w-3.5 h-3.5" /> Download MP4
                      </a>
                    ) : jobId ? (
                      <a href={`/api/download/${jobId}`} className="px-4 py-2.5 rounded-xl bg-[#1677FF] text-white text-xs font-bold flex items-center justify-center gap-2">
                        <Download className="w-3.5 h-3.5" /> Download MP4
                      </a>
                    ) : null}
                    {jobId && (
                      <Link href={`/media/library?highlight=${jobId}`} onClick={handleClose} className="px-4 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-xs font-bold flex items-center justify-center gap-2 text-[#111827] dark:text-[#F5F7FA]">
                        <Film className="w-3.5 h-3.5" /> Open in Library
                      </Link>
                    )}
                    {jobId && (
                      <Link href={`/publishing/youtube?jobId=${jobId}`} onClick={handleClose} className="px-4 py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] text-xs font-bold flex items-center justify-center gap-2 text-[#111827] dark:text-[#F5F7FA]">
                        <Share2 className="w-3.5 h-3.5" /> Publish
                      </Link>
                    )}
                  </div>
                  <div className="pt-2 w-full">
                    <div className={`rounded-xl border px-3 py-2 ${deliveryTone}`}>
                      <p className="text-xs font-bold flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5" /> {delivery.label}
                      </p>
                      <p className="text-[11px] mt-0.5">{delivery.detail}</p>
                      {delivery.linkUrl && (
                        <a href={delivery.linkUrl} target="_blank" rel="noreferrer" className="inline-flex mt-1.5 text-[11px] font-bold underline">
                          Open in Google Drive
                        </a>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={clearDraft} className="mt-2 px-5 py-2.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] text-xs font-bold text-[#667085] cursor-pointer">Create Another</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
