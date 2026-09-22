import { create } from "zustand";

export type SubsystemStatus = "loading" | "live" | "stale" | "error" | "offline" | "unavailable";

export interface SubsystemHealth {
  providers: SubsystemStatus;
  queue: SubsystemStatus;
  database: SubsystemStatus;
  scheduler: SubsystemStatus;
  storage: SubsystemStatus;
  drive: SubsystemStatus;
  renderer: SubsystemStatus;
  auth: SubsystemStatus;
  runtime: SubsystemStatus;
}

export interface VideoJob {
  id: string;
  jobId: string;
  topic: string;
  status: "queued" | "processing" | "completed" | "failed" | "purged" | "dead";
  createdAt: string;
  renderDurationSeconds?: number;
  videoUrl?: string | null;
  remoteState?: string;
  artifactSha256?: string;
  telemetry?: any;
}

export interface ProvenanceMetadata {
  source: string;
  measuredAt: string;
  requestId?: string;
}

export interface FactoryState {
  system: {
    containerCpuPct: number;
    containerMemPct: number;
    diskUsagePct: number;
    healthPct: number;
    hardware: any;
    provenance?: ProvenanceMetadata;
  };
  subsystems: SubsystemHealth;
  jobsSummary: {
    total: number;
    completed: number;
    failed: number;
    running: number;
    queued: number;
  };
  jobs: VideoJob[];
  queues: {
    storageQueue: any[];
    storageDead: any[];
    publisherQueue: any[];
    publisherDead: any[];
  };
  activeProviders: any[];
  activeEngines: string[];
  events: any[];
  isLoading: boolean;
  sseConnected: boolean;
  lastUpdated: string | null;
  error: string | null;
  fetchState: () => Promise<void>;
  initSSE: () => void;
  closeSSE: () => void;
}

export const useFactoryStore = create<FactoryState>((set, get) => {
  let sseSource: EventSource | null = null;
  let pollTimer: NodeJS.Timeout | null = null;

  return {
    system: {
      containerCpuPct: 0,
      containerMemPct: 0,
      diskUsagePct: 0,
      healthPct: 100,
      hardware: null,
    },
    subsystems: {
      providers: "loading",
      queue: "loading",
      database: "loading",
      scheduler: "loading",
      storage: "loading",
      drive: "loading",
      renderer: "loading",
      auth: "live",
      runtime: "loading",
    },
    jobsSummary: {
      total: 0,
      completed: 0,
      failed: 0,
      running: 0,
      queued: 0,
    },
    jobs: [],
    queues: {
      storageQueue: [],
      storageDead: [],
      publisherQueue: [],
      publisherDead: [],
    },
    activeProviders: [],
    activeEngines: [],
    events: [],
    isLoading: true,
    sseConnected: false,
    lastUpdated: null,
    error: null,

    fetchState: async () => {
      try {
        const res = await fetch("/api/factory-state");
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load factory state`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Failed to parse factory state");

        const now = new Date().toISOString();
        set({
          system: {
            containerCpuPct: data.system?.cpuUsagePct ?? 0,
            containerMemPct: data.system?.memUsagePct ?? 0,
            diskUsagePct: data.system?.diskUsagePct ?? 0,
            healthPct: data.system?.healthPct ?? 100,
            hardware: data.system?.hardware ?? null,
            provenance: {
              source: "/api/factory-state",
              measuredAt: now,
            },
          },
          subsystems: {
            providers: data.activeProviders?.length > 0 ? "live" : "unavailable",
            queue: "live",
            database: "live",
            scheduler: "live",
            storage: "live",
            drive: "live",
            renderer: "live",
            auth: "live",
            runtime: "live",
          },
          jobsSummary: data.jobsSummary || { total: 0, completed: 0, failed: 0, running: 0, queued: 0 },
          jobs: data.jobs || [],
          queues: data.queues || { storageQueue: [], storageDead: [], publisherQueue: [], publisherDead: [] },
          activeProviders: data.activeProviders || [],
          activeEngines: data.activeEngines || [],
          events: data.events || [],
          isLoading: false,
          lastUpdated: now,
          error: null,
        });
      } catch (err: any) {
        set({
          error: err.message,
          isLoading: false,
          subsystems: {
            providers: "unavailable",
            queue: "unavailable",
            database: "unavailable",
            scheduler: "unavailable",
            storage: "unavailable",
            drive: "unavailable",
            renderer: "unavailable",
            auth: "live",
            runtime: "offline",
          },
        });
      }
    },

    initSSE: () => {
      if (typeof window === "undefined" || get().sseConnected || sseSource !== null) return;

      try {
        sseSource = new EventSource("/api/factory-state/sse");
        set({ sseConnected: true });

        sseSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const now = new Date().toISOString();

            set({
              system: {
                containerCpuPct: data.system?.cpuUsagePct ?? 0,
                containerMemPct: data.system?.memUsagePct ?? 0,
                diskUsagePct: data.system?.diskUsagePct ?? 0,
                healthPct: data.system?.healthPct ?? 100,
                hardware: data.system?.hardware ?? null,
                provenance: {
                  source: "/api/factory-state/sse",
                  measuredAt: now,
                },
              },
              subsystems: {
                providers: data.activeProviders?.length > 0 ? "live" : "unavailable",
                queue: "live",
                database: "live",
                scheduler: "live",
                storage: "live",
                drive: "live",
                renderer: "live",
                auth: "live",
                runtime: "live",
              },
              jobsSummary: data.jobsSummary || { total: 0, completed: 0, failed: 0, running: 0, queued: 0 },
              jobs: data.jobs || [],
              queues: data.queues || { storageQueue: [], storageDead: [], publisherQueue: [], publisherDead: [] },
              activeProviders: data.activeProviders || [],
              activeEngines: data.activeEngines || [],
              events: data.events || [],
              isLoading: false,
              lastUpdated: now,
              error: null,
            });
          } catch (e: any) {
            console.warn("[SSE Parse Warning]:", e.message);
          }
        };

        sseSource.onerror = () => {
          if (sseSource) {
            sseSource.close();
            sseSource = null;
          }
          set({ sseConnected: false });

          // Start fallback polling if SSE disconnects
          if (!pollTimer) {
            get().fetchState();
            pollTimer = setInterval(() => get().fetchState(), 5000);
          }
        };
      } catch (err: any) {
        set({ sseConnected: false });
        get().fetchState();
      }
    },

    closeSSE: () => {
      if (sseSource) {
        sseSource.close();
        sseSource = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      set({ sseConnected: false });
    },
  };
});
