"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import type {
  OverseerPresenceEnvelope,
  VoiceState,
} from "@/factoryos/core/overseer/presence";
import { OVERSEER_EXPRESSION_PRESETS } from "@/factoryos/core/overseer/presence/OverseerExpressionPresets";
import dynamic from "next/dynamic";
import { OverseerHero } from "./OverseerHero";
import { OverseerConversation } from "./OverseerConversation";
import { OverseerModeBar } from "./OverseerModeBar";
import { OverseerCommandComposer } from "./OverseerCommandComposer";
import type {
  DisclosurePanel,
  OperationalStateData,
} from "./OverseerProgressiveDisclosure";
import type { FactoryMetrics } from "./OverseerMetricsHUD";
import type { ChatMessage, OverseerMode } from "./OverseerChat";
import { Activity, Layers, ShieldCheck, Bot } from "lucide-react";
import { useAuth } from "@/lib/auth/hooks";

const OverseerProgressiveDisclosure = dynamic(
  () => import("./OverseerProgressiveDisclosure").then((mod) => mod.OverseerProgressiveDisclosure),
  { ssr: false }
);

export interface OverseerCommandSurfaceProps {
  initialPresence?: OverseerPresenceEnvelope;
  className?: string;
  isDashboardEmbedded?: boolean;
}

export const OverseerCommandSurface: React.FC<OverseerCommandSurfaceProps> = memo(({
  initialPresence,
  className = "",
  isDashboardEmbedded = false,
}) => {
  const [presence, setPresence] = useState<OverseerPresenceEnvelope>(
    initialPresence || {
      type: "overseer.presence",
      sequence: 1,
      intent: "OBSERVING",
      affect: {
        valence: 0.3,
        arousal: 0.1,
        confidence: 0.9,
        uncertainty: 0.1,
        curiosity: 0.1,
        urgency: 0.0,
        satisfaction: 0.6,
        concern: 0.0,
        frustration: 0.0,
      },
      faceParameters: OVERSEER_EXPRESSION_PRESETS.IDLE,
      voiceState: "IDLE",
      effectLevel: 2,
      thoughtSummary: "All systems are operational across 4 production floors.",
      timestamp: new Date().toISOString(),
    }
  );

  const [currentMode, setCurrentMode] = useState<OverseerMode>("CHAT");
  const [isConnected, setIsConnected] = useState(false);
  const [activePanel, setActivePanel] = useState<DisclosurePanel | null>(null);
  const [stateData, setStateData] = useState<OperationalStateData | undefined>(undefined);
  const [sessionUser, setSessionUser] = useState<any>(null);

  const { user } = useAuth();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated && data?.user) {
          setSessionUser(data.user);
        }
      })
      .catch(() => {});
  }, [user]);

  const activeUser = user || sessionUser;
  const activeUserName = activeUser?.name || (activeUser?.email ? activeUser.email.split("@")[0] : "");

  // New vs returning — sole, server-grounded distinction (no localStorage).
  // New = account created very recently and this is effectively the first login.
  const isNewUser = useMemo(() => {
    if (!activeUser?.createdAt) return false;
    const created = new Date(activeUser.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    const rawLast: string | undefined = (activeUser as any).lastLogin || (activeUser as any).lastLoginAt;
    const last = rawLast ? new Date(rawLast).getTime() : 0;
    const ageMs = Date.now() - created;
    const NEW_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h
    const FIRST_LOGIN_SLOP_MS = 5 * 60 * 1000; // 5 min
    const isFirstLogin = !rawLast || Number.isNaN(last) || Math.abs(last - created) < FIRST_LOGIN_SLOP_MS;
    if (ageMs < 10 * 60 * 1000) return true; // just signed up — always new
    if (ageMs < NEW_WINDOW_MS && isFirstLogin) return true;
    return false;
  }, [activeUser]);

  const [metrics, setMetrics] = useState<FactoryMetrics>({
    factoryHealthPercent: 100,
    factoryStatus: "ONLINE",
    activeMissionsCount: 1,
    activeCasesCount: 0,
    criticalCasesCount: 0,
    healthyWorkersCount: 4,
    totalWorkersCount: 4,
    onlineFloorsCount: 4,
    totalFloorsCount: 4,
    activeRepairsCount: 0,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const lastSequenceRef = useRef<number>(presence.sequence || 0);

  // Fetch Authoritative Operational State
  const fetchOperationalState = useCallback(async () => {
    try {
      const res = await fetch("/api/overseer/presence/state");
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setStateData(json.data);
          if (json.data.metrics) {
            setMetrics(json.data.metrics);
          }
        }
      }
    } catch (err) {
      console.warn("[OverseerCommandSurface] Failed to fetch state:", err);
    }
  }, []);

  useEffect(() => {
    fetchOperationalState();
    const interval = setInterval(fetchOperationalState, 8000);
    return () => clearInterval(interval);
  }, [fetchOperationalState]);

  // SSE Stream Connection with Singleton Guard
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      const url = `/api/overseer/presence/events?lastEventId=${lastSequenceRef.current}`;
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.addEventListener("overseer.presence", (event) => {
        try {
          const envelope: OverseerPresenceEnvelope = JSON.parse(event.data);
          if (envelope.sequence && envelope.sequence > lastSequenceRef.current) {
            lastSequenceRef.current = envelope.sequence;
            setPresence(envelope);
          }
        } catch (e) {
          console.error("[OverseerCommandSurface] Error parsing presence SSE envelope:", e);
        }
      });

      eventSource.addEventListener("factory.state", (event) => {
        try {
          const stateUpdate = JSON.parse(event.data);
          if (stateUpdate.metrics) {
            setMetrics(stateUpdate.metrics);
          }
        } catch (e) {
          console.error("[OverseerCommandSurface] Error parsing factory state SSE:", e);
        }
      });

      eventSource.onerror = () => {
        setIsConnected(false);
        if (eventSource) {
          eventSource.close();
        }
        reconnectTimeout = setTimeout(connectSSE, 4000);
      };
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  // Command Dispatch with strict Text vs. Voice distinction
  const handleSendCommand = async (
    command: string,
    isVoice: boolean = false,
    context: string = "factory",
    modeOverride?: OverseerMode
  ) => {
    if (!command.trim() || isLoading) return;

    const activeMode = modeOverride || currentMode;
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sender: "user",
      text: command,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    if (isVoice) {
      setPresence((prev) => ({ ...prev, voiceState: "LISTENING", intent: "LISTENING" }));
    } else {
      setPresence((prev) => ({ ...prev, voiceState: "IDLE", intent: "THINKING" }));
    }

    try {
      const res = await fetch("/api/overseer/presence/interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: command,
          isVoice,
          context,
          mode: activeMode,
          previousMessages: messages.slice(-4),
        }),
      });

      const json = await res.json();

      if (json.success) {
        const {
          answer,
          evidence,
          actionsTaken,
          recommendations,
          structuredArtifact,
          panelDisclosure,
          presence: updatedPresence,
        } = json.data;

        if (updatedPresence) {
          const safePresence = isVoice 
            ? updatedPresence 
            : { ...updatedPresence, voiceState: "IDLE" };
          setPresence(safePresence);
          lastSequenceRef.current = safePresence.sequence;
        }

        const overseerMsg: ChatMessage = {
          id: `overseer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          sender: "overseer",
          text: answer,
          evidence,
          actionsTaken,
          recommendations,
          structuredArtifact,
          panelDisclosure,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        setMessages((prev) => [...prev, overseerMsg]);

        if (panelDisclosure) {
          setActivePanel(panelDisclosure);
        }

        if (actionsTaken && actionsTaken.length > 0) {
          fetchOperationalState();
        }

        // Voice audio playback for voice inputs
        if (isVoice && typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const cleanText = answer
            .replace(/[*_#`]/g, "")
            .replace(/https?:\/\/\S+/g, "link")
            .trim();

          if (cleanText) {
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.pitch = 1.05;
            utterance.rate = 1.02;
            utterance.volume = 0.95;

            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find((v) =>
              /samantha|victoria|zira|karen|moira|google us english|natural|female/i.test(v.name)
            ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];

            if (preferredVoice) utterance.voice = preferredVoice;

            utterance.onstart = () => setPresence((prev) => ({ ...prev, voiceState: "SPEAKING" }));
            utterance.onend = () => setPresence((prev) => ({ ...prev, voiceState: "IDLE" }));
            utterance.onerror = () => setPresence((prev) => ({ ...prev, voiceState: "IDLE" }));
            window.speechSynthesis.speak(utterance);
          }
        }
      } else {
        throw new Error(json.error || "Failed to query Overseer");
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sender: "overseer",
        text: `Overseer Alert: ${err.message || "Failed to reach Overseer control plane."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const accentColor = "#1769E8";

  return (
    <div
      id="overseer-stage"
      className={`w-full flex flex-col items-center ${
        isDashboardEmbedded
          ? "py-2 space-y-4"
          : "min-h-[calc(100vh-6.5rem)] py-4 justify-between"
      } max-w-4xl mx-auto select-none ${className}`}
    >
      {/* 1. TOP/CENTER: GRAND LIVING OVERSEER HERO & CONVERSATION */}
      <div className="w-full flex-1 flex flex-col justify-center items-center my-auto">
        <OverseerHero
          faceParameters={presence.faceParameters}
          intent={presence.intent}
          thoughtSummary={presence.thoughtSummary}
          userName={activeUserName}
          isNewUser={isNewUser}
          voiceState={presence.voiceState}
          activeJobsCount={stateData?.missions?.length || 0}
          hasErrors={(metrics?.criticalCasesCount || 0) > 0}
          activeMission={
            stateData?.missions?.[0]
              ? {
                  id: stateData.missions[0].missionId,
                  topic: stateData.missions[0].goal || "Automated Short Render",
                  stage: stateData.missions[0].status || "Rendering",
                  progressPct: stateData.missions[0].progress?.percentComplete ?? 0,
                }
              : null
          }
          metrics={metrics}
          onQuickCommand={(cmd) => handleSendCommand(cmd, false)}
          accentColor={accentColor}
          className="w-full"
        />

        {/* 2. INLINE FRONTIER CONVERSATION STREAM */}
        <section className="w-full max-w-2xl mx-auto mt-3">
          <OverseerConversation
            messages={messages}
            isLoading={isLoading}
            onOpenPanel={(panel) => setActivePanel(panel)}
            onQuickPrompt={(prompt, mode) => {
              if (mode) setCurrentMode(mode);
              handleSendCommand(prompt, false, undefined, mode);
            }}
            accentColor={accentColor}
          />
        </section>
      </div>

      {/* 3. BOTTOM OF VIEWER SEEING PAGE: CHATBOX / COMPOSER */}
      <div className="w-full max-w-2xl mx-auto space-y-3 pt-3 flex flex-col items-center">
        <OverseerCommandComposer
          onSendCommand={handleSendCommand}
          isLoading={isLoading}
          voiceState={presence.voiceState}
          currentMode={currentMode}
          onModeChange={(m) => setCurrentMode(m)}
          accentColor={accentColor}
          className="w-full"
        />
      </div>

      {/* Progressive Disclosure Slide-out HUD Drawer */}
      <OverseerProgressiveDisclosure
        activePanel={activePanel}
        onClose={() => setActivePanel(null)}
        stateData={stateData}
        onRefresh={fetchOperationalState}
        accentColor={accentColor}
      />
    </div>
  );
});

OverseerCommandSurface.displayName = "OverseerCommandSurface";
