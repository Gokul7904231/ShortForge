/**
 * RouteRegistry — Single Source of Truth for all Navigation & Route Access Policies
 *
 * Establishes a strict product boundary between:
 * 1. SHORTFORGE: User-facing AI video creation product (Creator Surface)
 * 2. FACTORYOS: Internal production, orchestration, and operations control plane
 *
 * All sidebar links, breadcrumbs, CommandPalette entries, and route guards
 * must reference this registry. Never duplicate route definitions.
 */

import { UserRole } from "../auth/types";
import { isAdminUser } from "../auth/roles";

export type RouteSurface = "creator" | "factory";

export interface RouteEntry {
  id: string;
  label: string;
  href: string;
  section: string;
  surface: RouteSurface;
  description: string;
  icon: string; // lucide icon name
  keywords?: string[]; // For search/CommandPalette
  minRole?: UserRole; // Minimum role required to view this route in navigation
  maxRole?: UserRole; // Maximum role allowed to view this route (e.g. USER only)
}

export interface RouteSection {
  id: string;
  title: string;
  surface: RouteSurface;
  icon: string; // lucide icon name
  basePath: string;
  routes: RouteEntry[];
  minRole?: UserRole; // Minimum role required to view this section
  maxRole?: UserRole; // Maximum role allowed to view this section
}

export const ROUTE_SECTIONS: RouteSection[] = [
  // ==========================================================================
  // SHORTFORGE CREATOR SECTIONS (Creator Surface — Available to all users)
  // ==========================================================================
  {
    id: "engines",
    title: "Content Engines",
    surface: "creator",
    icon: "Cpu",
    basePath: "/engines",
    routes: [
      { id: "engines-index",      label: "All Engines",   href: "/engines",                section: "Engines", surface: "creator", icon: "Cpu",        description: "Browse all registered content engines",    keywords: ["engines", "quiz", "story"] },
      { id: "engines-quiz",       label: "Quiz",          href: "/engines/quiz",           section: "Engines", surface: "creator", icon: "HelpCircle", description: "AI-powered quiz video engine",             keywords: ["quiz", "questions"] },
      { id: "engines-gk",         label: "GK",            href: "/engines/gk",             section: "Engines", surface: "creator", icon: "BookOpen",   description: "General Knowledge content engine",         keywords: ["gk", "general knowledge"] },
      { id: "engines-history",    label: "History",       href: "/engines/history",        section: "Engines", surface: "creator", icon: "History",    description: "Historical facts and stories engine",      keywords: ["history", "timeline"] },
      { id: "engines-coding",     label: "Coding",        href: "/engines/coding",         section: "Engines", surface: "creator", icon: "Code",       description: "Coding tips and tutorials engine",         keywords: ["code", "programming"] },
      { id: "engines-motivation", label: "Motivation",    href: "/engines/motivation",     section: "Engines", surface: "creator", icon: "Flame",      description: "Motivational content engine",              keywords: ["motivation", "inspiration"] },
      { id: "engines-psychology", label: "Psychology",    href: "/engines/psychology",     section: "Engines", surface: "creator", icon: "Brain",      description: "Psychology and mind facts engine",         keywords: ["psychology", "mind"] },
      { id: "engines-news",       label: "News",          href: "/engines/news",           section: "Engines", surface: "creator", icon: "Activity",   description: "Current affairs and news engine",          keywords: ["news", "events"] },
      { id: "engines-reddit",     label: "Reddit",        href: "/engines/reddit",         section: "Engines", surface: "creator", icon: "MessageSquare", description: "Reddit stories content engine",         keywords: ["reddit", "stories"] },
      { id: "engines-story",      label: "Story",         href: "/engines/story",          section: "Engines", surface: "creator", icon: "BookOpenText", description: "Narrative storytelling engine",          keywords: ["story", "narrative"] },
      { id: "engines-guess-flag", label: "Guess Flag",    href: "/engines/guess-flag",     section: "Engines", surface: "creator", icon: "Flag",       description: "Flag guessing quiz engine",                keywords: ["flags", "countries"] },
      { id: "engines-guess-logo", label: "Guess Logo",    href: "/engines/guess-logo",     section: "Engines", surface: "creator", icon: "Image",      description: "Logo guessing quiz engine",                keywords: ["logos", "brands"] },
    ],
  },
  {
    id: "library",
    title: "Library",
    surface: "creator",
    icon: "FolderOpen",
    basePath: "/factory/templates",
    routes: [
      { id: "factory-templates", label: "Templates",     href: "/factory/templates",      section: "Library", surface: "creator", icon: "FileCode",     description: "Browse video templates & styles",          keywords: ["templates", "presets", "styles"] },
      { id: "factory-jobs",      label: "My Videos",     href: "/factory/jobs",           section: "Library", surface: "creator", icon: "ListOrdered",  description: "View and manage your created Shorts",      keywords: ["jobs", "videos", "creations", "history"] },
      { id: "creator-assets",    label: "Assets",        href: "/media/assets",           section: "Library", surface: "creator", icon: "Image",        description: "Generated images, voice, and scene media", keywords: ["assets", "images", "audio", "cache"] },
      { id: "media-library",     label: "Rendered Videos", href: "/media/library",        section: "Library", surface: "creator", icon: "Film",         description: "Browse completed video renders",           keywords: ["library", "videos", "renders"] },
      { id: "ai-overseer",       label: "AI Overseer",   href: "/overseer",               section: "Library", surface: "creator", icon: "Sparkles",     description: "Autonomous creator assistant and presence control", keywords: ["overseer", "chat", "voice", "assistant"] },
    ],
  },
  {
    id: "publishing",
    title: "Publishing",
    surface: "creator",
    icon: "Share2",
    basePath: "/publishing",
    routes: [
      { id: "pub-youtube",   label: "YouTube",     href: "/publishing/youtube",   section: "Publishing", surface: "creator", icon: "Video",           description: "YouTube scheduled and published Shorts",   keywords: ["youtube", "publish", "upload"] },
      { id: "pub-tiktok",    label: "TikTok",      href: "/publishing/tiktok",    section: "Publishing", surface: "creator", icon: "Video",           description: "TikTok upload drafts and queue",           keywords: ["tiktok", "short", "draft"] },
      { id: "pub-instagram", label: "Instagram",   href: "/publishing/instagram", section: "Publishing", surface: "creator", icon: "Camera",          description: "Instagram Reels scheduling and history",     keywords: ["instagram", "reels"] },
    ],
  },
  {
    id: "analytics",
    title: "Analytics",
    surface: "creator",
    icon: "LineChart",
    basePath: "/analytics",
    routes: [
      { id: "analytics-heatmaps",    label: "Heatmaps",    href: "/analytics/heatmaps",    section: "Analytics", surface: "creator", icon: "Map",      description: "Scene-level audience drop-off heatmaps",   keywords: ["heatmap", "retention", "drop-off"] },
      { id: "analytics-hooks",       label: "Hooks",       href: "/analytics/hooks",       section: "Analytics", surface: "creator", icon: "Sparkles", description: "Hook score trends and distribution",           keywords: ["hook", "score", "ctr"] },
      { id: "analytics-performance", label: "Performance", href: "/analytics/performance", section: "Analytics", surface: "creator", icon: "Gauge",    description: "Video performance trends",                 keywords: ["performance", "speed", "views"] },
      { id: "analytics-retention",   label: "Retention",   href: "/analytics/retention",   section: "Analytics", surface: "creator", icon: "UserCheck", description: "Audience retention rates per video",          keywords: ["retention", "watch time"] },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    surface: "creator",
    icon: "Settings",
    basePath: "/settings",
    routes: [
      { id: "user-settings", label: "Account Settings", href: "/settings", section: "Settings", surface: "creator", icon: "Settings", description: "Manage account and profile preferences", keywords: ["settings", "profile", "account"] },
    ],
  },
  {
    id: "pricing",
    title: "Plans & Pricing",
    surface: "creator",
    icon: "Sparkles",
    basePath: "/pricing",
    maxRole: "USER",
    routes: [
      { id: "plans-pricing", label: "Plans & Pricing", href: "/pricing", section: "Plans & Pricing", surface: "creator", icon: "Sparkles", description: "View Basic, Pro, and Enterprise subscription plans", keywords: ["pricing", "plans", "upgrade", "pro", "enterprise", "quota", "billing"], maxRole: "USER" },
    ],
  },

  // ==========================================================================
  // FACTORYOS CONTROL PLANE (Internal Operator Surface — ADMIN / OWNER ONLY)
  // ==========================================================================
  {
    id: "factory-ops",
    title: "Operations",
    surface: "factory",
    icon: "Factory",
    basePath: "/factory",
    minRole: "ADMIN",
    routes: [
      { id: "factory-jobs",      label: "Jobs Monitor",   href: "/factory/jobs",      section: "Operations", surface: "factory", icon: "ListOrdered",  description: "Global job queue and execution monitor",       keywords: ["jobs", "queue", "history"], minRole: "ADMIN" },
      { id: "factory-queue",     label: "Live Queue",     href: "/factory/queue",     section: "Operations", surface: "factory", icon: "Loader2",      description: "Live job queue with retry and dead letters",   keywords: ["queue", "pending", "workers"], minRole: "ADMIN" },
      { id: "factory-workflows", label: "Workflows / DAG", href: "/factory/workflows", section: "Operations", surface: "factory", icon: "GitBranch",    description: "DSL workflow manifests and execution DAGs",    keywords: ["dsl", "workflow", "manifest", "dag"], minRole: "ADMIN" },
      { id: "factory-scheduler", label: "Scheduler",      href: "/factory/scheduler", section: "Operations", surface: "factory", icon: "Calendar",     description: "Schedule recurring batch production runs",     keywords: ["cron", "schedule", "recurring"], minRole: "ADMIN" },
    ],
  },
  {
    id: "factory-intel",
    title: "Intelligence",
    surface: "factory",
    icon: "Bot",
    basePath: "/ai",
    minRole: "ADMIN",
    routes: [
      { id: "ai-models",           label: "Models Directory",    href: "/ai/models",              section: "Intelligence", surface: "factory", icon: "Boxes",        description: "Registered models across all active providers", keywords: ["models", "llm", "gpt", "claude"], minRole: "ADMIN" },
      { id: "ai-marketplace",      label: "Model Marketplace",   href: "/ai/marketplace",         section: "Intelligence", surface: "factory", icon: "ShoppingBag",  description: "Model discovery, comparison, and benchmarks",   keywords: ["marketplace", "models", "compare", "discover"], minRole: "ADMIN" },
      { id: "ai-capability-reg",   label: "Capability Registry", href: "/ai/capability-registry", section: "Intelligence", surface: "factory", icon: "Layers",       description: "Capability → Model → Provider fallback map",    keywords: ["capability", "registry", "routing", "fallback"], minRole: "ADMIN" },
      { id: "ai-runtime",          label: "Runtime Topology",    href: "/ai/runtime",             section: "Intelligence", surface: "factory", icon: "Terminal",     description: "Live AI router state and active floor tasks",    keywords: ["runtime", "router", "execution"], minRole: "ADMIN" },
      { id: "ai-benchmarks",       label: "Benchmarks",          href: "/ai/benchmarks",          section: "Intelligence", surface: "factory", icon: "BarChart2",    description: "Provider latency, cost, and quality rankings",    keywords: ["benchmarks", "latency", "cost"], minRole: "ADMIN" },
      { id: "ai-providers",        label: "API Configuration",   href: "/settings/api",           section: "Intelligence", surface: "factory", icon: "Network",      description: "Manage provider credentials and fallback chains", keywords: ["providers", "llm", "api", "keys"], minRole: "ADMIN" },
      { id: "ai-overseer-ops",     label: "Overseer Operator",   href: "/overseer",               section: "Intelligence", surface: "factory", icon: "Sparkles",     description: "Autonomous operator chat and presence control", keywords: ["overseer", "chat", "voice", "assistant"], minRole: "ADMIN" },
    ],
  },
  {
    id: "sre",
    title: "SRE & Telemetry",
    surface: "factory",
    icon: "Activity",
    basePath: "/dashboard",
    minRole: "ADMIN",
    routes: [
      { id: "sre-events",          label: "Event Bus",           href: "/ai/events",              section: "Observability", surface: "factory", icon: "Activity",     description: "Real-time EventBus monitor and trace streams", keywords: ["events", "eventbus", "trace"], minRole: "ADMIN" },
      { id: "sre-ai-hospital",     label: "AI Hospital",         href: "/dashboard/ai-hospital",  section: "Observability", surface: "factory", icon: "HeartPulse",   description: "Full AI infrastructure health & doctor audit", keywords: ["hospital", "health", "doctor", "sre"], minRole: "ADMIN" },
      { id: "sre-voice-registry",  label: "Voice Registry",      href: "/dashboard/voice-registry", section: "Observability", surface: "factory", icon: "Activity",  description: "Voice capability, health, and benchmarks",      keywords: ["voice", "tts", "supertonic"], minRole: "ADMIN" },
      { id: "sre-profiler",        label: "Pipeline Profiler",   href: "/dashboard/profiler",     section: "Observability", surface: "factory", icon: "BarChart2",    description: "Waterfall profiler for floor execution runs",   keywords: ["profiler", "waterfall", "timing"], minRole: "ADMIN" },
      { id: "sre-workers",         label: "Workers & Deadletter", href: "/dashboard/workers",     section: "Observability", surface: "factory", icon: "Terminal",     description: "Queue workers, dead letters, and worker pools", keywords: ["workers", "queue", "dead letter"], minRole: "ADMIN" },
      { id: "sre-simulation",      label: "Chaos Simulation",    href: "/dashboard/simulation",   section: "Observability", surface: "factory", icon: "Flame",        description: "Chaos engineering simulation controls",          keywords: ["simulation", "chaos", "testing"], minRole: "ADMIN" },
    ],
  },
  {
    id: "factory-obs",
    title: "Observability",
    surface: "factory",
    icon: "Activity",
    basePath: "/dashboard",
    minRole: "ADMIN",
    routes: [
      { id: "sre-events-obs",      label: "Event Bus",           href: "/ai/events",              section: "Observability", surface: "factory", icon: "Activity",     description: "Real-time EventBus monitor and trace streams", keywords: ["events", "eventbus", "trace"], minRole: "ADMIN" },
    ],
  },
  {
    id: "factory-admin",
    title: "Administration",
    surface: "factory",
    icon: "UserCheck",
    basePath: "/admin",
    minRole: "ADMIN",
    routes: [
      { id: "admin-users",         label: "User Directory",      href: "/admin/users",            section: "Administration", surface: "factory", icon: "UserCheck",  description: "Manage registered users, roles, and RBAC",      keywords: ["users", "admin", "roles", "rbac"], minRole: "ADMIN" },
      { id: "admin-system",        label: "System Overview",     href: "/admin",                  section: "Administration", surface: "factory", icon: "Activity",   description: "System administration and host telemetry",      keywords: ["system", "admin", "telemetry"], minRole: "ADMIN" },
      { id: "admin-drive-sync",    label: "Drive Sync Queue",    href: "/publishing/drive",       section: "Administration", surface: "factory", icon: "ArrowUpFromLine", description: "Google Drive upload queue and sync state",  keywords: ["drive", "upload", "sync"], minRole: "ADMIN" },
      { id: "admin-media-drive",   label: "Drive Storage",       href: "/media/drive",            section: "Administration", surface: "factory", icon: "Cloud",      description: "Google Drive storage quota and credentials",     keywords: ["drive", "google", "storage"], minRole: "ADMIN" },
      { id: "admin-cloudinary",    label: "Cloudinary CDN",      href: "/media/cloudinary",       section: "Administration", surface: "factory", icon: "HardDrive",  description: "Cloudinary CDN bandwidth and quota",            keywords: ["cloudinary", "cdn", "images"], minRole: "ADMIN" },
    ],
  },
];

/**
 * Returns the exact navigation structure filtered for the given user role.
 * Basic/Creator users receive ONLY creator sections.
 * Owner/Admin users receive ShortForge creator navigation PLUS the FactoryOS Control Plane.
 */
export function getNavigationForRole(role: string = "USER"): RouteSection[] {
  const isAdmin = isAdminUser(role);

  return ROUTE_SECTIONS.filter((section) => {
    // Basic creators must never see FactoryOS control plane sections
    if (section.surface === "factory" && !isAdmin) return false;
    if (section.minRole === "ADMIN" && !isAdmin) return false;
    if (section.maxRole === "USER" && isAdmin) return false;
    return true;
  }).map((section) => {
    const allowedRoutes = section.routes.filter((route) => {
      if (route.surface === "factory" && !isAdmin) return false;
      if (route.minRole === "ADMIN" && !isAdmin) return false;
      if (route.maxRole === "USER" && isAdmin) return false;
      return true;
    });
    return { ...section, routes: allowedRoutes };
  }).filter((section) => section.routes.length > 0);
}

/**
 * Explicit set of internal FactoryOS operator routes.
 * Requests to these routes require ADMIN or OWNER role.
 * Notice: /factory/templates and /factory/jobs are EXCLUDED because they are creator-safe!
 */
export const FACTORYOS_INTERNAL_EXACT_ROUTES = new Set<string>([
  "/factory/workflows",
  "/factory/queue",
  "/factory/scheduler",
  "/ai/models",
  "/ai/marketplace",
  "/ai/capability-registry",
  "/ai/runtime",
  "/ai/benchmarks",
  "/ai/events",
  "/ai/providers",
  "/dashboard/ai-hospital",
  "/dashboard/voice-registry",
  "/dashboard/profiler",
  "/dashboard/workers",
  "/dashboard/simulation",
  "/settings/api",
  "/admin",
  "/admin/users",
  "/overseer",
  "/media/drive",
  "/media/cloudinary",
  "/publishing/drive",
]);

/**
 * Checks whether a given path is an internal FactoryOS operator route.
 * Replaces naive prefix matching with explicit classification.
 */
export function isInternalFactoryRoute(pathname: string): boolean {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "");

  // 1. Direct match on explicit internal route
  if (FACTORYOS_INTERNAL_EXACT_ROUTES.has(cleanPath)) {
    return true;
  }

  // 2. Admin subpaths (e.g. /admin/users/[id])
  if (cleanPath.startsWith("/admin/") || cleanPath === "/admin") {
    return true;
  }

  // 3. AI operator subpaths
  if (cleanPath.startsWith("/ai/") && cleanPath !== "/ai") {
    return true;
  }

  // 4. Overseer operator subpaths
  if (cleanPath.startsWith("/overseer/") || cleanPath === "/overseer") {
    return true;
  }

  return false;
}

// Flat lookup by href for fast route resolution
export const ROUTE_BY_HREF = new Map<string, RouteEntry>(
  ROUTE_SECTIONS.flatMap((s) => s.routes.map((r) => [r.href, r]))
);

// All routes flattened for search/CommandPalette
export const ALL_ROUTES: RouteEntry[] = ROUTE_SECTIONS.flatMap((s) => s.routes);
